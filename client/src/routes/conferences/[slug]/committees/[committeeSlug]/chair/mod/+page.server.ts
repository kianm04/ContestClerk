import { fail } from '@sveltejs/kit';
import { isSessionRunning, presentSeats } from '$lib/chair-room';
import { readModStartForm } from '$lib/caucus-start';
import { PRESSED_AT_FIELD, pressedMoment } from '$lib/clock-offset';
import { committeeRoomDependency } from '$lib/committee-room-live';
import { NEW_ROW_ID_FIELD, readNewRowId } from '$lib/new-row-id';
import { chairModUrl } from '$lib/urls';
import { caucusActions } from '$lib/server/caucus-actions';
import { readModView } from '$lib/server/caucus-view';
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
 * While a moderated caucus runs (or the room is suspended in one) it adds the
 * caucus's list and motion (`readModView`, the reader the live room calls
 * too); otherwise the view is the start form, which needs to know whether a
 * vote is open, since "Start caucus" waits for it to close.
 */
export const load: PageServerLoad = async ({ parent, locals, depends }) => {
	const { committee, committeeState, currentSession, seats } = await parent();

	// The same name as the layout's, so one realtime change reloads both.
	depends(committeeRoomDependency(committee.id));

	const isRunning = currentSession !== null && isSessionRunning(currentSession);
	const frame = { committeeState, currentSession, seats };
	const [mod, isVoteOpen] = await Promise.all([
		isRunning ? readModView(locals.supabase, frame) : null,
		isRunning ? hasOpenVote(locals.supabase, currentSession.id) : false
	]);

	return { mod, hasOpenVote: isVoteOpen };
};

/** Every action of the view sends the chair back to this page once it has worked. */
function backToMod(event: ChairRequestEvent): string {
	return chairModUrl(event.params.slug, event.params.committeeSlug);
}

export const actions: Actions = {
	// "Start caucus" (S7): a passed moderated caucus, marked started without a
	// vote, raised by the chosen seat or the chair. It leaves the motions on
	// the floor as they were. The chair stays here, on the running caucus.
	startModerated: async (event) => {
		const { committee, frame } = await openChairRoom(event);
		const formData = await event.request.formData();
		const presentSeatIds = presentSeats(frame.seats, frame.attendance).map((seat) => seat.id);
		const reading = readModStartForm(
			formData,
			presentSeatIds,
			committee.defaultSpeakingTimeSeconds
		);
		const check = await checkStart(event.locals.supabase, frame);

		if ('refusal' in check) return refuseStart(check.refusal, reading.values);
		if (reading.input === null) {
			return fail(400, { values: reading.values, errors: reading.errors });
		}

		// The moment of the press and the motion's id, which the chair's screen
		// already shows (T141). Without JavaScript neither is sent.
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

		returnTo(event, backToMod(event));
	},

	// The floor's buttons, the caucus list's forms and the caucus's own
	// ("Recognise", "Extend +5:00", "End caucus") are the live room's too, so
	// both pages take them from one place (`$lib/server`).
	...floorActions(backToMod),
	...queueActions(backToMod),
	...caucusActions(backToMod)
};
