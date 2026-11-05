/**
 * The chair's roll call: its shapes, its counts and the readings of its form
 * fields.
 *
 * `specs/05-pages/chair/roll-call.md` describes the page. Quorum itself is
 * `quorum()` in `$lib/committee-room.ts`, which every room screen shares.
 * Fetching and writing is `$lib/server/roll-calls.ts`'s job, and the keyboard
 * shortcuts are `$lib/roll-call-keys.ts`. Nothing here talks to Supabase, so
 * the components can import it too.
 */

import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
import { formatTimeOfDay } from '$lib/dates';
import { readFromView, type ChairPage } from '$lib/live-mode';

/** One roll call of a session, as the "Earlier roll calls" line shows it. */
export type RollCallSummary = {
	id: string;
	/** When it was started, as an ISO timestamp. */
	takenAt: string;
	/** The chair who took it, or null when their profile has no name. */
	takenByName: string | null;
	/** Seats marked present or present and voting. */
	presentCount: number;
};

/** The roll call the page is editing, with each seat's mark keyed by seat id. */
export type RollCallDraft = {
	id: string;
	attendance: Record<string, AttendanceStatus>;
};

/** How many seats each answer of a roll call has. */
export type RollCallCounts = {
	presentCount: number;
	presentAndVotingCount: number;
	absentCount: number;
};

/** The three answers a seat can give, in the order the row's buttons show them. */
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['absent', 'present', 'present_and_voting'];

/** The words on each answer's button. */
export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
	absent: 'Absent',
	present: 'Present',
	present_and_voting: 'Present and voting'
};

/**
 * The hidden field the roll call view's own forms carry: the page the view
 * was opened from (`?from=`), so every press comes back to the view still
 * knowing where "Return to the floor" leads (`chair/roll-call.md`, "Data").
 */
export const ROLL_CALL_FROM_FIELD = 'from';

/**
 * The page "Return to the floor" goes back to, from `?from=` or the field of
 * the same name: one of the chair pages (`readFromView`), and `chair` for
 * anything else. The roll call itself is never where the floor is, so a
 * `from` naming it, which the attendance chip on this page would write, also
 * means `chair`.
 */
export function readRollCallFrom(value: FormDataEntryValue | null): ChairPage {
	const page = readFromView(value);

	return page === 'roll-call' ? 'chair' : page;
}

/** The sentences the roll call's actions answer with when they refuse. */
export const ROLL_CALL_REFUSALS = {
	noSession: 'Start a session first.',
	otherSession: 'That roll call belongs to another session.',
	status: 'Choose absent, present, or present and voting.',
	seat: 'That seat is not in this committee.'
} as const;

/**
 * How many seats are present, present and voting, and absent.
 *
 * "Present" here is only the plain answer, so the three numbers add up to the
 * seats in the roll call. The top strip's present count is `countPresent` in
 * `$lib/committee-room.ts`, which counts both kinds of present together.
 */
export function rollCallCounts(attendance: Record<string, AttendanceStatus>): RollCallCounts {
	const statuses = Object.values(attendance);

	return {
		presentCount: statuses.filter((status) => status === 'present').length,
		presentAndVotingCount: statuses.filter((status) => status === 'present_and_voting').length,
		absentCount: statuses.filter((status) => status === 'absent').length
	};
}

/** The answer a status button sent, or null when it is not one of the three. */
export function readAttendanceStatus(value: FormDataEntryValue | null): AttendanceStatus | null {
	const status = ATTENDANCE_STATUSES.find((candidate) => candidate === value);

	return status ?? null;
}

/**
 * Which roll call the page edits: the one `?rollCall=` names when it is one of
 * this session's, otherwise the latest. Null before the session's first.
 *
 * `rollCalls` is newest first, the way `listRollCalls` returns it.
 */
export function chooseShownRollCallId(
	rollCalls: RollCallSummary[],
	requestedId: string | null
): string | null {
	const requested = rollCalls.find((rollCall) => rollCall.id === requestedId);

	if (requested) return requested.id;

	return rollCalls[0]?.id ?? null;
}

/** Every roll call of the session except the one being edited, newest first. */
export function earlierRollCalls(
	rollCalls: RollCallSummary[],
	shownId: string | null
): RollCallSummary[] {
	return rollCalls.filter((rollCall) => rollCall.id !== shownId);
}

/**
 * Each listed seat's mark, keyed by seat id. A seat made available after the
 * roll call started has no entry yet and counts as absent; an entry of a seat
 * that is no longer available is left out, because the page does not list it.
 */
export function attendanceOfSeats(
	seats: RoomSeat[],
	attendance: Record<string, AttendanceStatus>
): Record<string, AttendanceStatus> {
	const marks: Record<string, AttendanceStatus> = {};

	for (const seat of seats) {
		marks[seat.id] = attendance[seat.id] ?? 'absent';
	}

	return marks;
}

/** One roll call in a few words: "10:05 (12 present)", in the conference's timezone. */
export function describeRollCall(rollCall: RollCallSummary, timeZone: string): string {
	return `${formatTimeOfDay(rollCall.takenAt, timeZone)} (${rollCall.presentCount} present)`;
}
