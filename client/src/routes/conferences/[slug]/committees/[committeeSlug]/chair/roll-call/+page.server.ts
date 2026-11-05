import { fail, redirect } from '@sveltejs/kit';
import { isSessionRunning, type ChairRoomFrame, type CommitteeSession } from '$lib/chair-room';
import { committeeRoomDependency } from '$lib/committee-room-live';
import type { Flash } from '$lib/flash';
import { FROM_VIEW_FIELD, readFromView } from '$lib/live-mode';
import {
	ROLL_CALL_FROM_FIELD,
	ROLL_CALL_REFUSALS,
	chooseShownRollCallId,
	readAttendanceStatus,
	readRollCallFrom,
	type RollCallDraft
} from '$lib/roll-calls';
import { chairPageUrl, rollCallViewUrl } from '$lib/urls';
import { requireCommitteePermission } from '$lib/server/access';
import { getChairRoomFrame } from '$lib/server/committee-room';
import {
	getOrCreateRollCall,
	listRollCalls,
	markAllPresent,
	readRollCallAttendance,
	readRollCallSessionId,
	setRollCallStatus,
	startRollCall
} from '$lib/server/roll-calls';
// `./$types` holds the types SvelteKit writes for this one route.
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * Runs on the server, after the chair layout's `load` has checked the reader
 * and read the room's frame. `parent()` hands over what the layout returned.
 *
 * It adds the session's roll calls and the answers of the one being edited:
 * `?rollCall=<id>` when the address names one of this session's, otherwise
 * the latest, or none before the session's first. `?seat=<id>` names the row
 * the focus marker starts on, and `?from=<page>` the page "Return to the
 * floor" goes back to (`chair/roll-call.md`, "Data").
 */
export const load: PageServerLoad = async ({ parent, locals, url, depends }) => {
	const { committee, currentSession } = await parent();

	// The same name as the layout's, so a realtime change reloads this page too.
	depends(committeeRoomDependency(committee.id));

	const markedSeatId = url.searchParams.get('seat');
	const from = readRollCallFrom(url.searchParams.get(ROLL_CALL_FROM_FIELD));

	if (currentSession === null || !isSessionRunning(currentSession)) {
		return { rollCalls: [], rollCall: null, markedSeatId, from };
	}

	const rollCalls = await listRollCalls(locals.supabase, currentSession.id);
	const shownId = chooseShownRollCallId(rollCalls, url.searchParams.get('rollCall'));

	let rollCall: RollCallDraft | null = null;

	if (shownId !== null) {
		const attendance = await readRollCallAttendance(locals.supabase, shownId);
		rollCall = { id: shownId, attendance };
	}

	return { rollCalls, rollCall, markedSeatId, from };
};

/** Refuse, staying on the page. The root layout shows `flash` as a toast. */
function refuse(message: string) {
	return fail(400, { flash: { tone: 'error', message } satisfies Flash });
}

/**
 * The chair gate, asked again at the top of every action, then the room as it
 * is now and its running session, or null when none is running. An action is
 * its own request, so nothing `load` worked out reaches it.
 */
async function openRoom(
	event: RequestEvent
): Promise<{ frame: ChairRoomFrame; session: CommitteeSession | null }> {
	const { committee } = await requireCommitteePermission(
		event.locals,
		event.url,
		event.params.slug,
		event.params.committeeSlug,
		'run_room'
	);
	const frame = await getChairRoomFrame(event.locals.supabase, committee.id);
	const session = isSessionRunning(frame.currentSession) ? frame.currentSession : null;

	return { frame, session };
}

/** What an action on one roll call knows once the roll call has been checked. */
type CheckedRollCall = { frame: ChairRoomFrame; rollCallId: string };

/**
 * The roll call the form names, or null when it is not one of the running
 * session's own. A roll call of another session, or one the reader cannot
 * see, answers with a different session or none at all.
 *
 * A form that names no roll call at all gets the session's latest one, or a
 * new one when it has none (T160, R2): that is how the first press of a
 * session, here or on the opening band, makes the roll call and answers it
 * in one round trip.
 */
async function chooseRollCall(
	event: RequestEvent,
	formData: FormData,
	frame: ChairRoomFrame,
	session: CommitteeSession
): Promise<string | null> {
	const rollCallId = String(formData.get('rollCallId') ?? '');

	if (rollCallId === '') {
		// `frame.seats` holds the available seats only, as `start` uses them.
		const seatIds = frame.seats.map((seat) => seat.id);

		return getOrCreateRollCall(event.locals.supabase, session.id, seatIds);
	}

	const rollCallSessionId = await readRollCallSessionId(event.locals.supabase, rollCallId);

	return rollCallSessionId === session.id ? rollCallId : null;
}

/**
 * Open the room and check the roll call the form names: a session has to be
 * running, and the roll call has to be one of its own. Answers the sentence to
 * refuse with when either is not so.
 *
 * `checkPress` looks at the rest of the form first and answers a refusal or
 * null, so a press that is refused never creates a roll call on the way.
 */
async function openRollCall(
	event: RequestEvent,
	formData: FormData,
	checkPress: (frame: ChairRoomFrame) => string | null = () => null
): Promise<CheckedRollCall | { refusal: string }> {
	const { frame, session } = await openRoom(event);

	if (session === null) return { refusal: ROLL_CALL_REFUSALS.noSession };

	const pressRefusal = checkPress(frame);

	if (pressRefusal !== null) return { refusal: pressRefusal };

	const rollCallId = await chooseRollCall(event, formData, frame, session);

	if (rollCallId === null) return { refusal: ROLL_CALL_REFUSALS.otherSession };

	return { frame, rollCallId };
}

/**
 * Go back to where the press came from. The opening band's "Mark all
 * present" names its page in `fromView`, so the chair stays on `chair` or
 * `chair/gsl`; the roll call view's own forms come back to the view, on the
 * roll call and the row pressed, still knowing the page it was opened from.
 * `redirect` throws, which is how it stops the action.
 */
function backFromPress(
	event: RequestEvent,
	formData: FormData,
	rollCallId: string,
	seatId: string | null = null
) {
	const { slug, committeeSlug } = event.params;

	if (formData.has(FROM_VIEW_FIELD)) {
		redirect(303, chairPageUrl(slug, committeeSlug, readFromView(formData.get(FROM_VIEW_FIELD))));
	}

	const from = readRollCallFrom(formData.get(ROLL_CALL_FROM_FIELD));

	redirect(303, rollCallViewUrl(slug, committeeSlug, { rollCallId, seatId, from }));
}

export const actions: Actions = {
	// "Start a new roll call": always a fresh one, whatever the session already
	// has. This is the chair asking for one on purpose, after lunch say (T160),
	// unlike the presses below that name none and get the session's own.
	start: async (event) => {
		const formData = await event.request.formData();
		const { frame, session } = await openRoom(event);

		if (session === null) return refuse(ROLL_CALL_REFUSALS.noSession);

		// `frame.seats` holds the available seats only, so an unavailable seat is never listed.
		const seatIds = frame.seats.map((seat) => seat.id);
		const rollCallId = await startRollCall(event.locals.supabase, session.id, seatIds);

		backFromPress(event, formData, rollCallId);
	},

	setStatus: async (event) => {
		const formData = await event.request.formData();
		const status = readAttendanceStatus(formData.get('status'));
		const seatId = String(formData.get('seatId') ?? '');

		// The status and the seat are checked before the roll call is looked
		// up, so a refused press never creates one.
		function checkPress(frame: ChairRoomFrame): string | null {
			if (status === null) return ROLL_CALL_REFUSALS.status;
			if (!frame.seats.some((seat) => seat.id === seatId)) return ROLL_CALL_REFUSALS.seat;

			return null;
		}

		const opened = await openRollCall(event, formData, checkPress);

		if ('refusal' in opened) return refuse(opened.refusal);

		// `checkPress` has already refused a missing status; asking again tells
		// TypeScript that `status` is set from here on.
		if (status === null) return refuse(ROLL_CALL_REFUSALS.status);

		await setRollCallStatus(event.locals.supabase, opened.rollCallId, seatId, status);

		backFromPress(event, formData, opened.rollCallId, seatId);
	},

	markAllPresent: async (event) => {
		const formData = await event.request.formData();
		const opened = await openRollCall(event, formData);

		if ('refusal' in opened) return refuse(opened.refusal);

		await markAllPresent(event.locals.supabase, opened.rollCallId);

		backFromPress(event, formData, opened.rollCallId);
	}
};
