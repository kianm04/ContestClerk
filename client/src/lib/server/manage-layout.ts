/**
 * What the management sidebar needs beyond the conference itself (the manage
 * redesign): which setup steps a draft has done, the one count the current
 * phase shows, and the other conferences the organiser can switch to.
 *
 * Files under `$lib/server` only ever run on the server. The rules for what
 * the sidebar draws are pure and live in `$lib/manage-sidebar.ts`,
 * `$lib/setup-steps.ts` and `$lib/manage-status.ts`; this file only reads.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { conferencePhase } from '$lib/conference-phase';
import type { Conference } from '$lib/conferences';
import type { SidebarCount, SwitcherConference } from '$lib/manage-sidebar';
import { publishChecklist } from '$lib/publish-checklist';
import { setupProgressFromChecklist, type SetupProgress } from '$lib/setup-steps';
import { listConferencesByIds } from './conferences';
import { readChecklistCounts } from './manage';
import { readManageableConferenceIds } from './my-permissions';

/** Throws with a readable message when a query failed, as every lookup here does. */
function throwIfFailed(error: { message: string } | null, what: string): void {
	// A failed query means a bug (a wrong column name, a missing policy), not
	// something the organiser can fix, so it shows the error page.
	if (error) {
		throw new Error(`Could not read ${what}: ${error.message}`);
	}
}

/**
 * Whether anybody is on the conference's team or has been invited to it,
 * which is what ticks the Team step.
 */
async function hasTeam(supabase: SupabaseClient, conferenceId: string): Promise<boolean> {
	// `head: true` asks for the count alone, without sending any rows.
	const [staff, invites] = await Promise.all([
		supabase
			.from('conference_staff')
			.select('user_id', { count: 'exact', head: true })
			.eq('conference_id', conferenceId),
		supabase
			.from('invites')
			.select('id', { count: 'exact', head: true })
			.eq('conference_id', conferenceId)
	]);

	throwIfFailed(staff.error, 'the team');
	throwIfFailed(invites.error, 'the invitations');

	return (staff.count ?? 0) + (invites.count ?? 0) > 0;
}

/**
 * Which of a draft's setup steps are done, or `null` for a conference that is
 * no longer a draft, which costs no query at all.
 */
export async function loadSetupProgress(
	supabase: SupabaseClient,
	conference: Conference,
	now: Date
): Promise<SetupProgress | null> {
	if (conference.status !== 'draft') {
		return null;
	}

	const [countsById, isTeamStarted] = await Promise.all([
		readChecklistCounts(supabase, [conference.id]),
		hasTeam(supabase, conference.id)
	]);
	const counts = countsById[conference.id];

	// The conference was asked about, so it has an entry. Without one nothing is
	// ticked, which sends the organiser to the first step rather than past it.
	if (counts === undefined) {
		return setupProgressFromChecklist([], isTeamStarted);
	}

	// Stripe is only ever recommended, so it ticks no step either way.
	const lines = publishChecklist(conference, { ...counts, isStripeConnected: false }, now);

	return setupProgressFromChecklist(lines, isTeamStarted);
}

/** Applications waiting for a decision. */
async function countApplicationsToReview(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<number> {
	const { count, error } = await supabase
		.from('applications')
		.select('id', { count: 'exact', head: true })
		.eq('conference_id', conferenceId)
		.eq('status', 'submitted');

	throwIfFailed(error, 'the applications to review');

	return count ?? 0;
}

/** Seats on offer that nobody holds and no delegation is keeping. */
async function countFreeSeats(supabase: SupabaseClient, conferenceId: string): Promise<number> {
	// `committees!inner` keeps only the seats whose committee matches the filter
	// on the next line, so this counts the seats of this conference alone.
	const { count, error } = await supabase
		.from('seats')
		.select('id, committees!inner(conference_id)', { count: 'exact', head: true })
		.eq('committees.conference_id', conferenceId)
		.eq('is_available', true)
		.is('user_id', null)
		.is('delegation_id', null);

	throwIfFailed(error, 'the free seats');

	return count ?? 0;
}

/** Awards the chairs have proposed and nobody has confirmed yet. */
async function countProposedAwards(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<number> {
	const { count, error } = await supabase
		.from('awards')
		.select('id, committees!inner(conference_id)', { count: 'exact', head: true })
		.eq('committees.conference_id', conferenceId)
		.eq('status', 'proposed');

	throwIfFailed(error, 'the proposed awards');

	return count ?? 0;
}

/**
 * The one count the sidebar shows in the conference's current phase, or
 * `null` in a phase that counts nothing. Only that one is read.
 */
export async function loadSidebarCount(
	supabase: SupabaseClient,
	conference: Conference,
	now: Date
): Promise<SidebarCount | null> {
	const phase = conferencePhase(conference, now);

	if (phase === 'applications') {
		return {
			link: 'applications',
			value: await countApplicationsToReview(supabase, conference.id)
		};
	}

	if (phase === 'allocation') {
		return { link: 'allocation', value: await countFreeSeats(supabase, conference.id) };
	}

	if (phase === 'after') {
		return { link: 'awards', value: await countProposedAwards(supabase, conference.id) };
	}

	return null;
}

/**
 * The conferences the switcher offers: every conference whose management area
 * the reader may open, except archived ones, soonest first. An owner or admin
 * of the organisation is counted in for each of its conferences; a plain
 * member only where a role of theirs opens a page.
 */
export async function loadSwitcherConferences(
	supabase: SupabaseClient
): Promise<SwitcherConference[]> {
	const manageableIds = await readManageableConferenceIds(supabase);
	const conferences = await listConferencesByIds(supabase, [...manageableIds]);

	const current = conferences.filter((conference) => conference.status !== 'archived');
	const soonestFirst = current.sort((first, second) =>
		first.startDate.localeCompare(second.startDate)
	);

	return soonestFirst.map((conference) => ({
		slug: conference.slug,
		name: conference.name,
		startDate: conference.startDate,
		endDate: conference.endDate
	}));
}
