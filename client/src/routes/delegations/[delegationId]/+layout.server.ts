import { requireDelegationMember } from '$lib/server/access';
import { countDelegationMembers, countDelegationSeats } from '$lib/server/delegations';
import type { LayoutServerLoad } from './$types';

/**
 * Runs on the server for every page under `/delegations/[delegationId]`,
 * because it belongs to that folder's layout.
 *
 * `05-pages/delegation/dashboard.md` gives it one job: check once that the
 * reader really is in this delegation, read the delegation with its conference
 * and the reader's role, and count the members and the seats. Whatever it
 * returns reaches every page underneath as `data`, so none of them repeats any
 * of it.
 *
 * `+layout.svelte` beside this file holds the `Tabs` strip `dashboard.md` asks
 * for — Overview, Members, Seats and Papers — and nothing else. It builds that
 * strip out of the role and the counts returned below, and it is also the way
 * back to the dashboard from the pages under it, so none of them draws a back
 * link of its own.
 *
 * Files under `$lib/server` only ever run on the server, so the check and the
 * queries below cannot be skipped by anything the browser does.
 */
export const load: LayoutServerLoad = async ({ params, url, locals }) => {
	/*
		`requireDelegationMember` sends a visitor to the sign in page and an
		account that has not answered the welcome questions to `/welcome`. A
		signed-in stranger gets the same 404 that a delegation which does not
		exist gets, never a 403, which is the rule for the whole app. All three
		throw, so everything below is running for a real member of this one
		delegation.
	*/
	const { delegation, conference, myRole } = await requireDelegationMember(
		locals,
		url,
		params.delegationId
	);

	// Neither count needs the other's answer, so the two run side by side.
	const [memberCount, seatCounts] = await Promise.all([
		countDelegationMembers(locals.supabase, delegation.id),
		countDelegationSeats(locals.supabase, delegation.id)
	]);

	return {
		delegation,
		conference,
		/** `head` or `member`. It decides which half of the dashboard is drawn. */
		myRole,
		/** How many people are in the delegation. The head counts. */
		memberCount,
		/** Seats reserved for it, and how many of those already have somebody in them. */
		seatCounts
	};
};
