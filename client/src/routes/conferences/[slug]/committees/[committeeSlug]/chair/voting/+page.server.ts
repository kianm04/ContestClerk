import { committeeRoomDependency } from '$lib/committee-room-live';
import { chairVotingUrl } from '$lib/urls';
import type { ChairRequestEvent } from '$lib/server/chair-floor-actions';
import { readVoteView, voteActions } from '$lib/server/vote-view';
import type { Actions, PageServerLoad } from './$types';

/**
 * Runs on the server, after the chair layout's `load` has checked the reader
 * and read the room's frame. `parent()` hands over what the layout returned.
 *
 * It adds the Vote view's data (`readVoteView`, the reader the live room
 * calls too while the room votes): the room's current vote, open or closed,
 * with its roll call answers, and the session's closed votes. It is returned
 * as `voteView`, the name the console's keys look for. `?vote=new`,
 * `?cancel=confirm` and `?seat=<id>` are read from the address, so SvelteKit
 * runs this again whenever one changes.
 */
export const load: PageServerLoad = async ({ parent, locals, url, depends }) => {
	const { committee, committeeState, currentSession } = await parent();

	// The same name as the layout's, so one realtime change reloads both.
	depends(committeeRoomDependency(committee.id));

	const room = { committeeId: committee.id, committeeState, currentSession };
	const voteView = await readVoteView(locals.supabase, room, url);

	return { voteView };
};

/** Every action of the view that keeps the room's mode sends the chair back to this page. */
function backToVoting(event: ChairRequestEvent): string {
	return chairVotingUrl(event.params.slug, event.params.committeeSlug);
}

export const actions: Actions = {
	// The live room draws the same view while the room votes, so both pages
	// take its actions from one place (`$lib/server/vote-view.ts`).
	...voteActions(backToVoting)
};
