/**
 * What the GSL view shows besides the clock (`specs/05-pages/chair/gsl.md`):
 * whether its floor is live or waiting for another mode to end, who "Next"
 * calls and what its button says, which button is filled during the opening,
 * and the speeches already made, latest first.
 *
 * The clock is `$lib/floor-clock.ts`; the rules of the list itself (who waits,
 * who comes next) are `$lib/committee-room.ts` and `$lib/speakers-lists.ts`.
 * Nothing here talks to Supabase, so the components can import it.
 */

import {
	yieldCandidates,
	type ChairRoomFrame,
	type CommitteeStateView,
	type SpeakersListSummary
} from '$lib/chair-room';
import {
	formatDuration,
	nextSpeaker,
	type AttendanceStatus,
	type CommitteeMode,
	type RoomSeat
} from '$lib/committee-room';
import type { ListViewRoom } from '$lib/room-presses';
import type { ListedSpeaker } from '$lib/speakers-lists';

/**
 * One entry of the General Speakers' List. `finishedAt` orders the speeches
 * latest first; an entry a press has only just added or ended has none yet.
 */
export type GslEntry = ListedSpeaker & {
	finishedAt?: string | null;
};

/** The session's General Speakers' List with every entry, as the view's reader returns it. */
export type GslList = {
	speakersList: SpeakersListSummary;
	speakers: GslEntry[];
};

/**
 * What the GSL view takes from the chair layout's data: the room as the
 * server read it (the view lays the presses on their way on top itself), the
 * seats and the attendance, the clock offset and the two slugs. A page passes
 * its whole `data`, which holds all of these.
 */
export type GslViewFrame = Pick<
	ChairRoomFrame,
	| 'committeeState'
	| 'currentSession'
	| 'currentMotion'
	| 'seats'
	| 'attendance'
	| 'latestRollCallId'
> & {
	conference: { slug: string };
	committee: { slug: string };
	/** The latest reading of how far the server's clock is ahead of this browser's. */
	clockOffsetSampleMs: number;
};

/** The modes in which no list is on the floor, so nobody can be called ("Next", "Speak now"). */
const MODES_WITHOUT_A_SPEAKER: CommitteeMode[] = [
	'idle',
	'unmoderated_caucus',
	'voting',
	'suspended'
];

/**
 * Whether the list `listId` is the one on the floor: the room's active list,
 * in a mode that calls speakers from it. Only then do "Next" and "Speak now"
 * work on it, as `call_next_speaker` in the database insists.
 */
export function isListOnTheFloor(
	state: Pick<CommitteeStateView, 'mode' | 'activeSpeakersListId'>,
	listId: string
): boolean {
	if (MODES_WITHOUT_A_SPEAKER.includes(state.mode)) return false;

	return state.activeSpeakersListId === listId;
}

/**
 * The waiting floor's sentence while another mode is live or the room is
 * suspended: the GSL resumes when that ends.
 */
export function waitingFloorSentence(mode: CommitteeMode): string {
	if (mode === 'moderated_caucus' || mode === 'unmoderated_caucus') {
		return 'The GSL resumes when the caucus ends';
	}

	if (mode === 'single_speaker') return 'The GSL resumes after the single speaker';
	if (mode === 'voting') return 'The GSL resumes when voting ends';

	return 'The GSL resumes with the session';
}

/**
 * The letters drawn in place of a flag for a seat with no country code, such
 * as a custom member of a quick session: the first letter of its first two
 * words, "Secretary-General" giving "SG" and "World Bank" "WB".
 */
export function seatInitials(name: string): string {
	const words = name.split(/[^\p{Letter}\p{Number}]+/u).filter((word) => word !== '');
	const firstLetters = words.slice(0, 2).map((word) => word[0]);

	return firstLetters.join('').toUpperCase();
}

/** Whether the latest roll call marked the seat absent. Before any roll call nobody is. */
export function isSeatAbsent(
	seatId: string,
	attendance: Record<string, AttendanceStatus>
): boolean {
	return attendance[seatId] === 'absent';
}

/**
 * The seat "Next" or "Call" gives the floor to: the first waiting entry whose
 * seat is not marked absent (`nextSpeaker`), or null when no present seat
 * waits.
 */
export function seatToCall(
	entries: GslEntry[],
	attendance: Record<string, AttendanceStatus>
): RoomSeat | null {
	return nextSpeaker(entries, attendance)?.seat ?? null;
}

/** The floor's primary: "Next: Brazil" while someone speaks, "Call Brazil" over an empty floor. */
export function nextButtonLabel(seatName: string, hasSpeaker: boolean): string {
	return hasSpeaker ? `Next: ${seatName}` : `Call ${seatName}`;
}

/**
 * Whether "Next" or "Call" is drawn filled. During the opening, while the
 * session has no roll call and nobody has been called, "Mark all present" on
 * the opening band is the one filled button and the floor's is outlined
 * (`chair/committee-room.md`, "Opening band").
 */
export function isCallFilled(hasRollCall: boolean, entries: GslEntry[]): boolean {
	if (hasRollCall) return true;

	return entries.some((entry) => entry.status === 'speaking' || entry.status === 'spoken');
}

/** The moment a speech ended in milliseconds, or null for one a press has only just ended. */
function endedAt(entry: GslEntry): number | null {
	if (entry.finishedAt === undefined || entry.finishedAt === null) return null;

	return Date.parse(entry.finishedAt);
}

/** Negative when `first` ended after `second`, so it comes first. */
function compareLatestFirst(first: GslEntry, second: GslEntry): number {
	const firstEnd = endedAt(first);
	const secondEnd = endedAt(second);

	// Two speeches ending at the same moment, or two just ended: the one listed later is later.
	if (firstEnd === secondEnd) return second.position - first.position;
	// A speech a press has just ended is the latest of all.
	if (firstEnd === null) return -1;
	if (secondEnd === null) return 1;

	return secondEnd - firstEnd;
}

/** The speeches made on the list, latest first. Returns a new array. */
export function speechesLatestFirst(entries: GslEntry[]): GslEntry[] {
	const spoken = entries.filter((entry) => entry.status === 'spoken');

	// `sort` changes the array it is given; `filter` above already made a copy.
	return spoken.sort(compareLatestFirst);
}

/** One speech as the spoken line writes it, "France 1:25", or the name alone when its time is not known. */
export function speechText(entry: ListedSpeaker): string {
	if (entry.spokeSeconds === null) return entry.seat.name;

	return `${entry.seat.name} ${formatDuration(entry.spokeSeconds)}`;
}

/**
 * The empty floor's line about the last speech, "China spoke last · 1:28", or
 * null before anyone has spoken on the list.
 */
export function spokeLastText(entries: GslEntry[]): string | null {
	const latest = speechesLatestFirst(entries)[0];

	if (latest === undefined) return null;
	if (latest.spokeSeconds === null) return `${latest.seat.name} spoke last`;

	return `${latest.seat.name} spoke last · ${formatDuration(latest.spokeSeconds)}`;
}

/** What the GSL view's floor is worked out from, with the presses on their way laid on top. */
export type GslFloorFacts = {
	committeeState: Pick<
		CommitteeStateView,
		'mode' | 'activeSpeakersListId' | 'currentSpeakerEntryId'
	>;
	/** The General Speakers' List's id. */
	listId: string;
	entries: GslEntry[];
	seats: RoomSeat[];
	attendance: Record<string, AttendanceStatus>;
	/** Whether the session has a roll call, or will once a press on its way is answered. */
	hasRollCall: boolean;
};

/** What the GSL view's floor shows (`specs/05-pages/chair/gsl.md`, the table under "Floor"). */
export type GslFloorView = {
	/** Whether the GSL has the floor; otherwise the floor waits ("The GSL resumes …"). */
	isLive: boolean;
	/** The entry with the floor, or null when nobody has it. */
	speaking: GslEntry | null;
	/** The seat "Next" or "Call" gives the floor to, or null when no present seat waits. */
	nextSeat: RoomSeat | null;
	/** "China spoke last · 1:28" over an empty floor, or null. */
	spokeLast: string | null;
	/** Whether "Next" or "Call" is drawn filled (`isCallFilled`). */
	isCallFilled: boolean;
	/** The present seats the speaker may yield to, their own left out (`yieldCandidates`). */
	yieldSeats: RoomSeat[];
};

/**
 * The GSL view's floor: whether it is live, who has it, who is called next,
 * the last speech, and the seats a yield may go to. While another mode is
 * live the floor waits and nobody on the GSL has it.
 */
export function gslFloorView(facts: GslFloorFacts): GslFloorView {
	const { committeeState, entries, attendance } = facts;
	const isLive =
		committeeState.mode === 'formal_debate' && isListOnTheFloor(committeeState, facts.listId);
	const currentEntryId = isLive ? committeeState.currentSpeakerEntryId : null;
	const speaking = entries.find((entry) => entry.id === currentEntryId) ?? null;

	return {
		isLive,
		speaking,
		nextSeat: seatToCall(entries, attendance),
		spokeLast: spokeLastText(entries),
		isCallFilled: isCallFilled(facts.hasRollCall, entries),
		yieldSeats: yieldCandidates(facts.seats, attendance, speaking?.seat.id ?? null)
	};
}

/** What the GSL view draws, and what its presses work on, from its data after the presses. */
export type GslViewState = {
	floor: GslFloorView;
	/** What a press works on (`listViewPress`): the GSL, and the floor only while the GSL has it. */
	pressRoom: ListViewRoom;
};

/** What the GSL view is worked out from: `GslFloorFacts`, with the list's settings and the timer. */
export type GslViewFacts = Omit<GslFloorFacts, 'listId'> & {
	list: SpeakersListSummary;
	committeeState: GslFloorFacts['committeeState'] & Pick<CommitteeStateView, 'timer'>;
};

/**
 * The GSL view's floor (`gslFloorView`) and what its presses work on. While
 * another mode is live the floor's buttons are gone, so the presses have no
 * floor list to act on, and only the queue column's work.
 */
export function gslViewState(facts: GslViewFacts): GslViewState {
	const floor = gslFloorView({ ...facts, listId: facts.list.id });
	const shownList = {
		id: facts.list.id,
		entries: facts.entries,
		speakingTimeSeconds: facts.list.speakingTimeSeconds
	};
	const pressFloor = {
		list: floor.isLive ? shownList : null,
		currentEntryId: floor.speaking?.id ?? null,
		timer: facts.committeeState.timer,
		startSeconds: facts.list.speakingTimeSeconds,
		attendance: facts.attendance
	};

	return { floor, pressRoom: { floor: pressFloor, queue: shownList, seats: facts.seats } };
}
