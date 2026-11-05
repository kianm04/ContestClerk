import { fail } from '@sveltejs/kit';
import { isSessionRunning, presentSeats } from '$lib/chair-room';
import { PRESSED_AT_FIELD, pressedMoment } from '$lib/clock-offset';
import { committeeRoomDependency } from '$lib/committee-room-live';
import { readSingleSpeakerForm } from '$lib/single-speaker';
import { chairSingleUrl } from '$lib/urls';
import {
	floorActions,
	openChairRoom,
	returnTo,
	type ChairRequestEvent
} from '$lib/server/chair-floor-actions';
import { checkStart, hasOpenVote, refuseStart, startSingleSpeaker } from '$lib/server/mode-starts';
import { singleSpeakerActions } from '$lib/server/single-speaker-actions';
import { readSingleSpeakerView } from '$lib/server/single-speaker-view';
import { queueActions } from '$lib/server/speaker-queue-actions';
import type { Actions, PageServerLoad } from './$types';

/**
 * Runs on the server, after the chair layout's `load` has checked the reader
 * and read the room's frame. `parent()` hands over what the layout returned.
 *
 * While a single speaker has the floor (or the room is suspended with one)
 * it adds the single speaker's own list and its purpose
 * (`readSingleSpeakerView`, the reader the live room calls too); otherwise
 * the view is the start form, which needs to know whether a vote is open.
 */
export const load: PageServerLoad = async ({ parent, locals, depends }) => {
	const { committee, committeeState, currentSession, seats } = await parent();

	// The same name as the layout's, so one realtime change reloads both.
	depends(committeeRoomDependency(committee.id));

	const isRunning = currentSession !== null && isSessionRunning(currentSession);
	const frame = { committeeState, currentSession, seats };
	const [single, isVoteOpen] = await Promise.all([
		isRunning ? readSingleSpeakerView(locals.supabase, frame) : null,
		isRunning ? hasOpenVote(locals.supabase, currentSession.id) : false
	]);

	return { single, hasOpenVote: isVoteOpen };
};

/** Every action of the view sends the chair back to this page once it has worked. */
function backToSingle(event: ChairRequestEvent): string {
	return chairSingleUrl(event.params.slug, event.params.committeeSlug);
}

export const actions: Actions = {
	// "Give the floor" (S9): a seat or a typed name gets the floor on a list of
	// its own, with the purpose and the time, its clock ready and not running.
	// No motion is recorded. The chair stays here, on the running view.
	startSingle: async (event) => {
		const { committee, frame } = await openChairRoom(event);
		const formData = await event.request.formData();
		const presentSeatIds = presentSeats(frame.seats, frame.attendance).map((seat) => seat.id);
		const reading = readSingleSpeakerForm(formData, presentSeatIds);
		const check = await checkStart(event.locals.supabase, frame);

		if ('refusal' in check) return refuseStart(check.refusal, reading.values);
		if (reading.input === null) {
			return fail(400, { values: reading.values, errors: reading.errors });
		}

		const place = {
			committeeId: committee.id,
			pressedAt: pressedMoment(formData.get(PRESSED_AT_FIELD), new Date())
		};
		const refusal = await startSingleSpeaker(event.locals.supabase, place, reading.input);

		if (refusal !== null) return refuseStart(refusal, reading.values);

		returnTo(event, backToSingle(event));
	},

	// The floor's buttons and "Also speaking"'s forms are the live room's too,
	// and so is "Return to GSL", which always lands on the live room.
	...floorActions(backToSingle),
	...queueActions(backToSingle),
	...singleSpeakerActions()
};
