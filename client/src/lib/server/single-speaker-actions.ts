/**
 * The form action of a running single speaker
 * (`specs/05-pages/chair/single-speaker.md`, "`returnToGsl`"): "Return to
 * GSL", the Single speaker view's primary once nobody waits, which the live
 * strip posts too.
 *
 * Files under `$lib/server` only ever run on the server. The live room
 * (`chair`) and `chair/single` each spread `singleSpeakerActions()` into
 * their own `actions`, beside `floorActions` and `queueActions`. The press
 * changes what the room is doing, so it always lands on the live room,
 * whichever page it was pressed on.
 */

import { isSessionRunning } from '$lib/chair-room';
import { chairRoomUrl } from '$lib/urls';
import {
	openChairRoom,
	refuseChairAction,
	returnTo,
	type ChairRequestEvent
} from '$lib/server/chair-floor-actions';
import { setRoomMode } from '$lib/server/committee-room';

/** The sentence "Return to GSL" refuses with while no single speaker has the floor. */
export const SINGLE_SPEAKER_REFUSALS = {
	noSingleSpeaker: 'No single speaker has the floor.'
} as const;

/** "Return to GSL", which takes the chair who pressed it to `chair`. */
export function singleSpeakerActions() {
	return {
		// The speech in progress ends with its time, and the room goes back to
		// formal debate on the General Speakers' List with its waiting speakers
		// in place: `setRoomMode` puts that list back when leaving a single speaker.
		returnToGsl: async (event: ChairRequestEvent) => {
			const { committee, frame } = await openChairRoom(event);
			const state = frame.committeeState;

			if (!isSessionRunning(frame.currentSession) || state.mode !== 'single_speaker') {
				return refuseChairAction(SINGLE_SPEAKER_REFUSALS.noSingleSpeaker);
			}

			await setRoomMode(event.locals.supabase, committee.id, state, 'formal_debate');

			returnTo(event, chairRoomUrl(event.params.slug, event.params.committeeSlug));
		}
	};
}
