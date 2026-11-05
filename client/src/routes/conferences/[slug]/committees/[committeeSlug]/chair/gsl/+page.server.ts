import { isSessionRunning } from '$lib/chair-room';
import { committeeRoomDependency } from '$lib/committee-room-live';
import { chairGslUrl } from '$lib/urls';
import { floorActions, type ChairRequestEvent } from '$lib/server/chair-floor-actions';
import { readGslList } from '$lib/server/gsl-view';
import { queueActions } from '$lib/server/speaker-queue-actions';
import type { Actions, PageServerLoad } from './$types';

/**
 * Runs on the server, after the chair layout's `load` has checked the reader
 * and read the room's frame. `parent()` hands over what the layout returned.
 *
 * It adds the session's General Speakers' List (`readGslList`, the reader the
 * live room calls too while it is in formal debate), whatever the live mode:
 * during a caucus or a vote the floor waits, but the list shown is still the
 * GSL. `?time=change` asks for the list footer's speaking time field, which is
 * how "Change" works without JavaScript.
 */
export const load: PageServerLoad = async ({ parent, locals, url, depends }) => {
	const { committee, currentSession, seats } = await parent();

	// The same name as the layout's, so one realtime change reloads both.
	depends(committeeRoomDependency(committee.id));

	const gsl =
		currentSession !== null && isSessionRunning(currentSession)
			? await readGslList(locals.supabase, currentSession.id, seats)
			: null;

	return { gsl, isTimeFieldOpen: url.searchParams.get('time') === 'change' };
};

/** Every action of the view sends the chair back to this page once it has worked. */
function backToGsl(event: ChairRequestEvent): string {
	return chairGslUrl(event.params.slug, event.params.committeeSlug);
}

export const actions: Actions = {
	// The floor's buttons and the queue column's forms are the live room's too,
	// so both pages take them from one place (`$lib/server`).
	...floorActions(backToGsl),
	...queueActions(backToGsl)
};
