import { committeeRoomDependency } from '$lib/committee-room-live';
import { requireRoomWatcher } from '$lib/server/access';
import { readAmendmentVoteForScreen } from '$lib/server/amendment-on-screen';
import { loadWatchedRoom } from '$lib/server/committee-live';
import { readRoomCrisisUpdate } from '$lib/server/crisis-desk';
import { readPaperForScreen } from '$lib/server/papers-on-floor';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server every time the projector's display is opened, and again
 * whenever realtime reports a change in the room (see `depends` below).
 *
 * The display may be opened by whoever may open the live view: a delegate of
 * this committee or anybody on the conference's staff. A visitor goes to sign
 * in and everybody else gets a 404. It reads exactly what the live view reads
 * (`loadWatchedRoom`), so the projector and the phones always agree. Nothing
 * on the display is about the reader: a delegate who opens it never sees "You".
 * Beside the room it reads the paper the dais put on screen, with its text,
 * and, during a vote on an amendment, the amendment and the clause it changes.
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

	const [room, paperOnScreen, crisisUpdate] = await Promise.all([
		loadWatchedRoom(locals.supabase, conference, committee, user.id),
		readPaperForScreen(locals.supabase, committee),
		readRoomCrisisUpdate(locals.supabase, committee.id)
	]);

	// The room's state names its vote, so the amendment is read once the room is.
	const amendmentVote = await readAmendmentVoteForScreen(
		locals.supabase,
		room.committeeState.currentVoteId
	);

	// A crisis committee's projector also shows the crisis staff's latest update.
	return { ...room, paperOnScreen, crisisUpdate, amendmentVote };
};
