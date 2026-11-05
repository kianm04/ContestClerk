/**
 * The roll call as it will be once the server has saved the answers just
 * pressed, worked out in the browser so every screen of the chair shows them
 * at once (T140). The presses come from the instant form in
 * `$lib/instant-form.svelte.ts`, which the chair layout keeps for the roll call.
 *
 * The prediction is certain: it does what the `setStatus` and `markAllPresent`
 * actions of the Roll call page do, in the order the chair pressed them.
 */
import { getContext, setContext } from 'svelte';
import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
import { createInstantForm, type InstantForm, type InstantPress } from '$lib/instant-form.svelte';
import { ATTENDANCE_LABELS, readAttendanceStatus } from '$lib/roll-calls';

/** The actions that name no roll call when pressed on the Room page's opening card (R2). */
const GET_OR_CREATE_ACTIONS = ['?/setStatus', '?/markAllPresent'];

/**
 * Whether a press names no roll call, so the server gives it the session's
 * latest one, or makes one when there is none (T160, R2).
 */
function isGetOrCreatePress(press: InstantPress): boolean {
	const rollCallId = String(press.formData.get('rollCallId') ?? '');

	return rollCallId === '' && GET_OR_CREATE_ACTIONS.includes(press.action.search);
}

/**
 * Whether a press lands on the roll call `rollCallId`: it names that roll
 * call, or it names none and `rollCallId` is the session's latest, which the
 * server gives it.
 */
function isPressOnRollCall(
	press: InstantPress,
	rollCallId: string,
	isLatestRollCall: boolean
): boolean {
	if (isGetOrCreatePress(press)) return isLatestRollCall;

	return press.formData.get('rollCallId') === rollCallId;
}

/** `marks` with the presses applied, oldest first, the way the server applies them. */
function applyPresses(
	marks: Record<string, AttendanceStatus>,
	presses: InstantPress[]
): Record<string, AttendanceStatus> {
	const nextMarks = { ...marks };

	for (const press of presses) {
		if (press.action.search === '?/setStatus') {
			const seatId = String(press.formData.get('seatId') ?? '');
			const status = readAttendanceStatus(press.formData.get('status'));

			if (seatId !== '' && status !== null) nextMarks[seatId] = status;
		}

		if (press.action.search === '?/markAllPresent') {
			for (const seatId of Object.keys(nextMarks)) {
				if (nextMarks[seatId] === 'absent') nextMarks[seatId] = 'present';
			}
		}
	}

	return nextMarks;
}

/**
 * `attendance` of the roll call `rollCallId` with the presses on it applied,
 * oldest first. Presses on another roll call are left out; a press that names
 * no roll call counts only when `isLatestRollCall` says `rollCallId` is the
 * session's latest. Like the server, "Mark all present" turns only seats
 * marked absent into present, and never adds a seat that has no mark.
 */
export function attendanceAfterPresses(
	attendance: Record<string, AttendanceStatus>,
	rollCallId: string | null,
	presses: InstantPress[],
	isLatestRollCall = false
): Record<string, AttendanceStatus> {
	if (rollCallId === null) return { ...attendance };

	const pressesOnRollCall = presses.filter((press) =>
		isPressOnRollCall(press, rollCallId, isLatestRollCall)
	);

	return applyPresses(attendance, pressesOnRollCall);
}

/**
 * Whether the session will have a roll call once the presses on their way are
 * answered: it has one already, or a press on its way names none, so the
 * server makes one for it (R2).
 */
export function hasRollCallAfterPresses(
	latestRollCallId: string | null,
	presses: InstantPress[]
): boolean {
	return latestRollCallId !== null || presses.some(isGetOrCreatePress);
}

/**
 * The marks of the session's latest roll call with the presses on their way
 * applied, or null while the session has no roll call and none is on its way.
 *
 * Before the first roll call exists, the first press that names none makes
 * it with every seat of `seatIds` absent, as the server does, so the preview
 * starts from that.
 */
export function latestAttendanceAfterPresses(
	attendance: Record<string, AttendanceStatus>,
	latestRollCallId: string | null,
	presses: InstantPress[],
	seatIds: string[]
): Record<string, AttendanceStatus> | null {
	if (latestRollCallId !== null) {
		return attendanceAfterPresses(attendance, latestRollCallId, presses, true);
	}

	const firstRollCallPresses = presses.filter(isGetOrCreatePress);

	if (firstRollCallPresses.length === 0) return null;

	const everySeatAbsent: Record<string, AttendanceStatus> = {};

	for (const seatId of seatIds) {
		everySeatAbsent[seatId] = 'absent';
	}

	return applyPresses(everySeatAbsent, firstRollCallPresses);
}

/**
 * What did not happen when a roll call press failed, for its toast: "France
 * was not marked present."
 */
export function describeRollCallFailure(press: InstantPress, seats: RoomSeat[]): string {
	if (press.action.search === '?/markAllPresent') return 'The seats were not marked present.';

	if (press.action.search === '?/finish') return 'The roll call was not finished.';

	const seatId = press.formData.get('seatId');
	const seatName = seats.find((seat) => seat.id === seatId)?.name ?? 'The seat';
	const status = readAttendanceStatus(press.formData.get('status'));
	const answer = status === null ? 'marked' : `marked ${ATTENDANCE_LABELS[status].toLowerCase()}`;

	return `${seatName} was not ${answer}.`;
}

/*
	Why context rather than props: the present count is drawn in the chair
	layout's top bar and the answers are pressed on the Roll call page below it.
	A page cannot hand anything up to the layout around it through props, so the
	layout keeps the roll call's form and puts it in Svelte's context, where the
	page can reach it. Kept in the layout, presses also go on being sent when the
	chair moves to another chair page. `setContext` and `getContext` only work
	while a component is being set up, so call these at the top of a `<script>`.
*/

/** The name the form is kept under; nothing else can find it without this. */
const ROLL_CALL_FORM_KEY = Symbol('chair roll call form');

/** Share the roll call's form with every component inside the calling one. Used by the chair layout. */
export function shareRollCallForm(form: InstantForm): void {
	setContext(ROLL_CALL_FORM_KEY, form);
}

/**
 * The roll call's form the chair layout shared. A component drawn outside the
 * chair pages, as in a component test, gets one of its own.
 */
export function sharedRollCallForm(): InstantForm {
	const shared = getContext<InstantForm | undefined>(ROLL_CALL_FORM_KEY);

	return shared ?? createInstantForm({ describeFailure: () => 'The roll call was not saved.' });
}
