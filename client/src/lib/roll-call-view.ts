/**
 * What the roll call view draws (`specs/05-pages/chair/roll-call.md`, S5):
 * the seats in alphabetical order, each one's answer with the presses still
 * on their way laid on top, the counts, the quorum and the majority, and the
 * earlier roll calls of the session as links.
 *
 * Plain functions with no Svelte in them, so they can be read and tested on
 * their own. The roll call's rules are `$lib/roll-calls.ts`, its presses
 * `$lib/roll-call-preview.ts`, and quorum and majority `$lib/committee-room.ts`.
 */

import {
	countPresent,
	quorum,
	simpleMajority,
	type AttendanceStatus,
	type RoomSeat
} from '$lib/committee-room';
import type { InstantPress } from '$lib/instant-form.svelte';
import type { ChairPage } from '$lib/live-mode';
import { attendanceAfterPresses, latestAttendanceAfterPresses } from '$lib/roll-call-preview';
import {
	attendanceOfSeats,
	describeRollCall,
	earlierRollCalls,
	rollCallCounts,
	type RollCallCounts,
	type RollCallDraft,
	type RollCallSummary
} from '$lib/roll-calls';
import { rollCallViewUrl } from '$lib/urls';

/** What the view is drawn from: the layout's rows and what its own `load` read. */
export type RollCallViewData = {
	conference: { slug: string; timezone: string };
	committee: { slug: string };
	/** The available seats, in display order. */
	seats: RoomSeat[];
	/** The session's latest roll call, which decides who is present everywhere else. */
	latestRollCallId: string | null;
	/** The session's roll calls, newest first. */
	rollCalls: RollCallSummary[];
	/** The roll call being edited, or null before the session's first. */
	rollCall: RollCallDraft | null;
	/** The page "Return to the floor" goes back to. */
	from: ChairPage;
};

/** One earlier roll call, as a link to edit it: "10:05 (12 present)". */
export type EarlierRollCallLink = {
	id: string;
	label: string;
	href: string;
};

/** Everything the view draws, worked out by `rollCallView`. */
export type RollCallView = {
	/** The available seats in alphabetical order, the way a chair calls them. */
	seats: RoomSeat[];
	/** Every listed seat's answer, "absent" until one is given. */
	marks: Record<string, AttendanceStatus>;
	counts: RollCallCounts;
	/** How many present seats a quorum needs, and whether they are there. */
	quorumNeeded: number;
	hasQuorum: boolean;
	/** The simple majority of the seats present. */
	majority: number;
	/** Whether any seat is present: then "Return to the floor" is the filled button (P1). */
	hasAnyonePresent: boolean;
	/** The roll call the rows' presses name, or null before the first, which they then make (R2). */
	rollCallId: string | null;
	earlier: EarlierRollCallLink[];
};

/** The seats in alphabetical order of their names, as a chair calls the roll. */
export function alphabeticalSeats(seats: RoomSeat[]): RoomSeat[] {
	return [...seats].sort((first, second) => first.name.localeCompare(second.name, 'en'));
}

/**
 * The answers of the roll call shown, with the presses on their way laid on
 * top. Before the session's first roll call there are none yet, and the
 * first press makes it with every seat absent (`latestAttendanceAfterPresses`).
 */
function shownMarks(data: RollCallViewData, presses: InstantPress[]) {
	if (data.rollCall === null) {
		const seatIds = data.seats.map((seat) => seat.id);

		return latestAttendanceAfterPresses({}, null, presses, seatIds) ?? {};
	}

	const isLatest = data.rollCall.id === data.latestRollCallId;

	return attendanceAfterPresses(data.rollCall.attendance, data.rollCall.id, presses, isLatest);
}

/** The session's other roll calls, newest first, each a link to edit it. */
function earlierLinks(data: RollCallViewData): EarlierRollCallLink[] {
	const others = earlierRollCalls(data.rollCalls, data.rollCall?.id ?? null);

	return others.map((rollCall) => ({
		id: rollCall.id,
		label: describeRollCall(rollCall, data.conference.timezone),
		href: rollCallViewUrl(data.conference.slug, data.committee.slug, {
			rollCallId: rollCall.id,
			seatId: null,
			from: data.from
		})
	}));
}

/** The view's seats, answers, counts and links, with the roll call's presses laid on top. */
export function rollCallView(data: RollCallViewData, presses: InstantPress[]): RollCallView {
	const marks = attendanceOfSeats(data.seats, shownMarks(data, presses));
	const presentCount = countPresent(marks);
	const roomQuorum = quorum(presentCount, data.seats.length);

	return {
		seats: alphabeticalSeats(data.seats),
		marks,
		counts: rollCallCounts(marks),
		quorumNeeded: roomQuorum.needed,
		hasQuorum: roomQuorum.hasQuorum,
		majority: simpleMajority(presentCount),
		hasAnyonePresent: presentCount > 0,
		rollCallId: data.rollCall?.id ?? null,
		earlier: earlierLinks(data)
	};
}

/**
 * The quorum line, neutral either way (P4): "Quorum 3 · met · majority 4" once
 * quorum is met, "Quorum 3 · 2 more needed" while it is not.
 */
export function quorumLineText(
	view: Pick<RollCallView, 'quorumNeeded' | 'hasQuorum' | 'majority' | 'counts'>
): string {
	if (view.hasQuorum) return `Quorum ${view.quorumNeeded} · met · majority ${view.majority}`;

	const presentCount = view.counts.presentCount + view.counts.presentAndVotingCount;
	const stillNeeded = view.quorumNeeded - presentCount;

	return `Quorum ${view.quorumNeeded} · ${stillNeeded} more needed`;
}

/* Written out in full, because Tailwind reads the class names out of this file. */
const ANSWER_SHARED_CLASSES =
	'h-9 -ml-px border px-3 text-small font-medium first-of-type:ml-0 first-of-type:rounded-l-lg last-of-type:rounded-r-lg max-md:h-11 max-md:flex-auto max-md:px-2';

/** "Present" and "Present and voting" when chosen: light blue with its line (`roll-call.md`). */
const PRESENT_CHOSEN_CLASSES = 'relative z-10 border-brand-500 bg-brand-100 text-brand-900';

/** "Absent" when chosen: grey, since an answer not yet taken is not a fault (P4). */
const ABSENT_CHOSEN_CLASSES = 'border-line bg-neutral-100 text-ink-900';

const NOT_CHOSEN_CLASSES = 'border-line bg-surface text-ink-900 hover:bg-neutral-100';

/**
 * The classes of one part of a row's segmented answer: the three buttons sit
 * joined, the first and last rounded, and the chosen one filled. No warning
 * or danger colour appears in the roll call (P4).
 */
export function rollCallAnswerClasses(answer: AttendanceStatus, isChosen: boolean): string {
	if (!isChosen) return `${ANSWER_SHARED_CLASSES} ${NOT_CHOSEN_CLASSES}`;

	const chosenClasses = answer === 'absent' ? ABSENT_CHOSEN_CLASSES : PRESENT_CHOSEN_CLASSES;

	return `${ANSWER_SHARED_CLASSES} ${chosenClasses}`;
}
