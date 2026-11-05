import { papersPageTitle } from '$lib/committee-papers';
import { committeeRoomDependency } from '$lib/committee-room-live';
import { requireRoomWatcher } from '$lib/server/access';
import { loadWatchedRoom } from '$lib/server/committee-live';
import { readCommitteeFormat } from '$lib/server/committee-papers';
import { readRoomCrisisUpdate } from '$lib/server/crisis-desk';
import { readAmendmentsToAnswer } from '$lib/server/paper-amendments';
import { readRoomPaperVote } from '$lib/server/paper-votes';
import { readDisplayedPaper } from '$lib/server/papers-on-floor';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server every time the live view is opened, and again whenever
 * realtime reports a change in the room (see `depends` below).
 *
 * A delegate of this committee or anybody on the conference's staff may watch;
 * a visitor goes to sign in and everybody else gets a 404. The projector's
 * `display/+page.server.ts` reads exactly the same (`loadWatchedRoom`), so the
 * phone and the projector always show the same room.
 */
export const load: PageServerLoad = async ({ params, url, locals, depends }) => {
	const { user, conference, committee } = await requireRoomWatcher(
		locals,
		url,
		params.slug,
		params.committeeSlug
	);

	// `depends` gives this `load` a name. When realtime hears that something in
	// the room changed, the page calls `invalidate` with the same name, and
	// SvelteKit runs this `load` again with fresh, permission-checked rows.
	depends(committeeRoomDependency(committee.id));

	const [room, format, displayedPaper, crisisUpdate, votedPaper] = await Promise.all([
		loadWatchedRoom(locals.supabase, conference, committee, user.id),
		readCommitteeFormat(locals.supabase, committee.id),
		readDisplayedPaper(locals.supabase, committee.id),
		readRoomCrisisUpdate(locals.supabase, committee.id),
		readRoomPaperVote(locals.supabase, committee.id)
	]);

	// The amendments a sponsor's seat has still to answer, for the quiet "Waiting for you" line.
	const amendmentsToAnswer =
		room.mySeatId === null
			? []
			: await readAmendmentsToAnswer(locals.supabase, committee.id, room.mySeatId);

	return {
		...room,
		// The heading's link to the committee's papers: "Resolutions", or
		// "Directives" in a crisis committee (`docs/committee-papers.md`, section 6).
		papersTitle: papersPageTitle(format),
		// The paper the dais put on the projector, which the floor links to.
		displayedPaper,
		// The paper the room's vote is on, which the same line links while the vote has the screen.
		votedPaper,
		// A crisis committee's room also shows the crisis staff's latest update.
		crisisUpdate,
		amendmentsToAnswer
	};
};
