/**
 * How many of somebody's applications `/applications` cannot show, because the
 * organisers have taken their conference down again.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried.
 *
 * The `conferences` select policy shows a signed-in reader `published` and
 * `archived` conferences, and a `draft` to that conference's own team only.
 * An organiser who unpublishes a conference puts it back to `draft`, and from
 * then on the people who applied to it cannot read it. Both halves of the list
 * embed the conference with `conferences!inner(...)`, so those rows are simply
 * not in its answer. The applicant can still read their own application and
 * their own delegation membership, though, so this module counts the rows that
 * come back with no conference attached, and the page says out loud that they
 * exist. T112 settled that: letting applicants read the draft instead would
 * make every page that treats "can read a draft" as "is on the team" wrong.
 *
 * Deleting a conference deletes its applications and delegations with it
 * (`on delete cascade`), and an archived one stays readable, so "no conference"
 * means "unpublished" and nothing else.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * How many of this person's individual applications are at a conference they
 * may no longer read.
 *
 * `conferences(id)` without `!inner` is a left join: the application comes back
 * whether or not its conference could be read, with `conferences` set to
 * `null` when it could not. `.is('conferences', null)` then keeps only those.
 * `head: true` asks for the count and not the rows, so nothing but the number
 * comes back, and `max_rows` cannot cut a count short.
 */
async function countApplicationsAtUnpublishedConferences(
	supabase: SupabaseClient,
	userId: string
): Promise<number> {
	const { count, error } = await supabase
		.from('applications')
		.select('id, conferences(id)', { count: 'exact', head: true })
		.eq('user_id', userId)
		.is('conferences', null);

	if (error) {
		throw new Error(`Could not count your hidden applications: ${error.message}`);
	}

	// Supabase answers with `null` rather than a number when it has no count to
	// report, and no count means nothing to count.
	return count ?? 0;
}

/**
 * How many of this person's delegation memberships are at a conference they may
 * no longer read.
 *
 * The same left join one level further down. A member may always read their own
 * delegation, so `delegations!inner(...)` loses nothing; it is the conference
 * inside it that goes missing, and `.is('delegations.conferences', null)` keeps
 * the memberships where it did.
 */
async function countMembershipsAtUnpublishedConferences(
	supabase: SupabaseClient,
	userId: string
): Promise<number> {
	const { count, error } = await supabase
		.from('delegation_members')
		.select('delegation_id, delegations!inner(id, conferences(id))', {
			count: 'exact',
			head: true
		})
		.eq('user_id', userId)
		.is('delegations.conferences', null);

	if (error) {
		throw new Error(`Could not count your hidden delegations: ${error.message}`);
	}

	return count ?? 0;
}

/**
 * How many rows of this person's `/applications` list are hidden because their
 * conference has been unpublished: individual applications and delegation
 * memberships together, since the list shows both as one.
 *
 * Nought is the ordinary answer. A query error throws.
 */
export async function countMyApplicationsAtUnpublishedConferences(
	supabase: SupabaseClient,
	userId: string
): Promise<number> {
	// Neither count needs the other's answer, so both are sent at once.
	const [applicationCount, membershipCount] = await Promise.all([
		countApplicationsAtUnpublishedConferences(supabase, userId),
		countMembershipsAtUnpublishedConferences(supabase, userId)
	]);

	return applicationCount + membershipCount;
}
