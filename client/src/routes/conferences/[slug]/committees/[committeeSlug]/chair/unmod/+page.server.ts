import { fail } from '@sveltejs/kit';
import { isSessionRunning, presentSeats } from '$lib/chair-room';
import { readUnmodStartForm } from '$lib/caucus-start';
import { PRESSED_AT_FIELD, pressedMoment } from '$lib/clock-offset';
import { committeeRoomDependency } from '$lib/committee-room-live';
import { NEW_ROW_ID_FIELD, readNewRowId } from '$lib/new-row-id';
import { chairUnmodUrl } from '$lib/urls';
import { caucusActions } from '$lib/server/caucus-actions';
import { readUnmodView } from '$lib/server/caucus-view';
import {
	floorActions,
	openChairRoom,
	returnTo,
	type ChairRequestEvent
} from '$lib/server/chair-floor-actions';
import { checkStart, hasOpenVote, refuseStart, startCaucusDirectly } from '$lib/server/mode-starts';
import { queueActions } from '$lib/server/speaker-queue-actions';
import type { Actions, PageServerLoad } from './$types';

/**
 * Runs on the server, after the chair layout's `load` has checked the reader
 * and read the room's frame. `parent()` hands over what the layout returned.
 *
 * While a session runs it adds the General Speakers' List, which the running
 * caucus shows as "After the caucus", and the caucus's motion while one runs
 * (`readUnmodView`, the reader the live room calls too), and whether a vote
 * is open, which "Start caucus" waits for. `?time=change` asks for the list
 * footer's speaking time field, which is how "Change" works without
 * JavaScript.
 */
export const load: PageServerLoad = async ({ parent, locals, url, depends }) => {
	const { committee, committeeState, currentSession, seats } = await parent();

	// The same name as the layout's, so one realtime change reloads both.
	depends(committeeRoomDependency(committee.id));

	const isRunning = currentSession !== null && isSessionRunning(currentSession);
	const frame = { committeeState, currentSession, seats };
	const [unmod, isVoteOpen] = await Promise.all([
		readUnmodView(locals.supabase, frame),
		isRunning ? hasOpenVote(locals.supabase, currentSession.id) : false
	]);

	return {
		unmod,
		hasOpenVote: isVoteOpen,
		isTimeFieldOpen: url.searchParams.get('time') === 'change'
	};
};

/** Every action of the view sends the chair back to this page once it has worked. */
function backToUnmod(event: ChairRequestEvent): string {
	return chairUnmodUrl(event.params.slug, event.params.committeeSlug);
}

export const actions: Actions = {
	// "Start caucus" (S8), moved here from the live room: a passed unmoderated
	// caucus, marked started without a vote, whose clock runs at once. It
	// leaves the motions on the floor as they were. The chair stays here.
	startUnmoderated: async (event) => {
		const { committee, frame } = await openChairRoom(event);
		const formData = await event.request.formData();
		const presentSeatIds = presentSeats(frame.seats, frame.attendance).map((seat) => seat.id);
		const reading = readUnmodStartForm(formData, presentSeatIds);
		const check = await checkStart(event.locals.supabase, frame);

		if ('refusal' in check) return refuseStart(check.refusal, reading.values);
		if (reading.input === null) {
			return fail(400, { values: reading.values, errors: reading.errors });
		}

		// The moment of the press, from which the caucus's clock runs, and the
		// motion's id, both as the chair's screen already shows them (T141).
		const place = {
			committeeId: committee.id,
			sessionId: check.sessionId,
			pressedAt: pressedMoment(formData.get(PRESSED_AT_FIELD), new Date())
		};
		const motionId = readNewRowId(formData.get(NEW_ROW_ID_FIELD));
		const refusal = await startCaucusDirectly(
			event.locals.supabase,
			place,
			reading.input,
			motionId
		);

		if (refusal !== null) return refuseStart(refusal, reading.values);

		returnTo(event, backToUnmod(event));
	},

	// The clock buttons, "+1 min" (`timerAdd` with 60 seconds), "After the
	// caucus" (the General Speakers' List's own queue column) and "End caucus"
	// are the live room's too, so both pages take them from one place.
	...floorActions(backToUnmod),
	...queueActions(backToUnmod),
	...caucusActions(backToUnmod)
};
