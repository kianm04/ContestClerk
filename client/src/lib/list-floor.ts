/**
 * The floor of the Mod and Single speaker views (`specs/05-pages/chair/mod.md`
 * and `single-speaker.md`, "Components"): the GSL's floor, on the mode's own
 * list, with its own rules for the one primary in the bottom right corner and
 * for the words over an empty floor.
 *
 * The GSL's own floor is `$lib/gsl-floor.ts`, whose helpers this file reuses
 * so the three floors count the same way. Plain functions with no Svelte in
 * them.
 */

import type { ResolvedPathname } from '$app/types';
import {
	yieldCandidates,
	type CommitteeStateView,
	type SpeakersListSummary
} from '$lib/chair-room';
import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
import type { ModePressRoom, ModeRoomState } from '$lib/caucus-presses';
import { seatToCall, spokeLastText, type GslEntry, type GslViewFrame } from '$lib/gsl-floor';
import type { InstantPress } from '$lib/instant-form.svelte';
import { latestAttendanceAfterPresses } from '$lib/roll-call-preview';
import { chairNotesUrl } from '$lib/urls';

/**
 * The floor's one primary: "Next: {seat}" or "Call {seat}" (and the disabled
 * "Next" while nobody waits), "End caucus" once a moderated caucus's time is
 * up, "Return to GSL" once nobody waits for a single speaker, or none.
 */
export type ListFloorPrimary = 'next' | 'endCaucus' | 'returnToGsl' | null;

/** The large grey sentence over a floor nobody has, and the quieter line under it. */
export type FloorWords = { title: string; line: string | null };

/** What the Mod or Single speaker floor shows. */
export type ListFloorView = {
	/** False while the room is suspended: no clock and no controls, only `words`. */
	isLive: boolean;
	/** The entry with the floor, or null when nobody has it. */
	speaking: GslEntry | null;
	/** The seat "Next" or "Call" gives the floor to, or null when no present seat waits. */
	nextSeat: RoomSeat | null;
	primary: ListFloorPrimary;
	/** The words in place of the speaker, or null while somebody has the floor. */
	words: FloorWords | null;
	/** The present seats the speaker may yield to, their own left out (Single speaker only). */
	yieldSeats: RoomSeat[];
};

/** What a list floor is worked out from, with the presses on their way laid on top. */
export type ListFloorFacts = {
	committeeState: Pick<CommitteeStateView, 'currentSpeakerEntryId' | 'timer'>;
	list: SpeakersListSummary;
	entries: GslEntry[];
	seats: RoomSeat[];
	attendance: Record<string, AttendanceStatus>;
	/** Whether the room is suspended in this mode, which keeps the list but stops the floor. */
	isSuspended: boolean;
};

/** The words of a suspended floor: the mode comes back with the session. */
const SUSPENDED_WORDS = {
	mod: 'The caucus resumes with the session',
	single: 'The single speaker resumes with the session'
} as const;

/** The empty Mod floor with nobody waiting: the add box is where the chair goes next. */
const RECOGNISE_WORDS: FloorWords = {
	title: 'Recognise a delegation to speak',
	line: 'Pick one in the box on the right: with nobody speaking, Enter gives them the floor.'
};

/** The entry with the floor, or null. */
function speakingOn(facts: ListFloorFacts): GslEntry | null {
	const currentId = facts.committeeState.currentSpeakerEntryId;

	return facts.entries.find((entry) => entry.id === currentId) ?? null;
}

/**
 * The words over the floor while nobody has it. With a present seat waiting
 * the primary already says "Call {seat}", so the words only say the floor is
 * free and who spoke last; otherwise each mode says what comes next.
 */
function emptyFloorWords(
	facts: ListFloorFacts,
	hasWaitingSeat: boolean,
	whenNobodyWaits: FloorWords
): FloorWords {
	if (hasWaitingSeat) return { title: 'Nobody has the floor', line: spokeLastText(facts.entries) };

	return whenNobodyWaits;
}

/** The Mod floor's primary: "End caucus" once the time is up, else "Next" while anybody speaks or waits. */
function modPrimary(isCaucusTimeUp: boolean, hasSomebody: boolean): ListFloorPrimary {
	if (isCaucusTimeUp) return 'endCaucus';

	return hasSomebody ? 'next' : null;
}

/**
 * The Mod view's floor (`mod.md`, the table of primaries). Once the caucus
 * time is up, "End caucus" takes the primary's place and "Next" is not drawn,
 * whoever speaks or waits. Otherwise the primary is the GSL's "Next" or
 * "Call", or none while nobody speaks or waits.
 */
export function modFloorView(facts: ListFloorFacts, isCaucusTimeUp: boolean): ListFloorView {
	const speaking = speakingOn(facts);
	const nextSeat = seatToCall(facts.entries, facts.attendance);

	if (facts.isSuspended) {
		const words = { title: SUSPENDED_WORDS.mod, line: null };

		return { isLive: false, speaking: null, nextSeat, primary: null, words, yieldSeats: [] };
	}

	const primary = modPrimary(isCaucusTimeUp, speaking !== null || nextSeat !== null);
	const words =
		speaking === null ? emptyFloorWords(facts, nextSeat !== null, RECOGNISE_WORDS) : null;

	return { isLive: true, speaking, nextSeat, primary, words, yieldSeats: [] };
}

/**
 * The Single speaker view's floor (`single-speaker.md`, the table of
 * primaries): "Next" or "Call" while a speaker waits on "Also speaking", and
 * "Return to GSL" once nobody does, whether or not someone speaks. When the
 * last speaker has finished the floor says so, and who spoke last.
 */
export function singleSpeakerFloorView(facts: ListFloorFacts): ListFloorView {
	const speaking = speakingOn(facts);
	const nextSeat = seatToCall(facts.entries, facts.attendance);

	if (facts.isSuspended) {
		const words = { title: SUSPENDED_WORDS.single, line: null };

		return { isLive: false, speaking: null, nextSeat, primary: null, words, yieldSeats: [] };
	}

	const finished = { title: 'The last speaker has finished', line: spokeLastText(facts.entries) };
	const words = speaking === null ? emptyFloorWords(facts, nextSeat !== null, finished) : null;
	const yieldSeats = yieldCandidates(facts.seats, facts.attendance, speaking?.seat.id ?? null);

	return {
		isLive: true,
		speaking,
		nextSeat,
		primary: nextSeat === null ? 'returnToGsl' : 'next',
		words,
		yieldSeats
	};
}

/**
 * What the Mod, Unmod and Single speaker views take from the chair layout's
 * data, beyond what the GSL view takes: the General Speakers' List those
 * modes return to, the committee's speaking time, and the conference's time
 * zone for "back at 14:32". A page passes its whole `data`, which holds all
 * of these.
 */
export type ModeViewFrame = GslViewFrame & {
	conference: { slug: string; timezone: string };
	committee: { slug: string; defaultSpeakingTimeSeconds: number };
	/** The session's General Speakers' List (`getConsoleFacts`), or null. */
	generalSpeakersListId: string | null;
};

/**
 * Where "Note on this speech" leads: the Notes page open on the speaker's
 * seat, or the Notes page itself for a typed name, which holds no seat and
 * so has no notes of its own. Null while nobody has the floor.
 */
export function speechNoteHref(
	frame: Pick<GslViewFrame, 'conference' | 'committee'>,
	speaking: GslEntry | null
): ResolvedPathname | null {
	if (speaking === null) return null;
	if (isTypedName(speaking)) return chairNotesUrl(frame.conference.slug, frame.committee.slug);

	return chairNotesUrl(frame.conference.slug, frame.committee.slug, speaking.seat.id);
}

/**
 * The latest roll call of the session with the roll call's presses on their
 * way laid on top (`$lib/roll-call-preview.ts`), keyed by seat id. Before the
 * session's first roll call nobody is absent, which an empty record says.
 */
export function shownAttendance(
	frame: Pick<GslViewFrame, 'attendance' | 'latestRollCallId' | 'seats'>,
	rollCallPresses: InstantPress[]
): Record<string, AttendanceStatus> {
	const seatIds = frame.seats.map((seat) => seat.id);
	const latest = latestAttendanceAfterPresses(
		frame.attendance,
		frame.latestRollCallId,
		rollCallPresses,
		seatIds
	);

	return latest ?? {};
}

/**
 * Whether the entry is a typed name (a single speaker such as
 * "Secretary-General") rather than a seat. Such an entry stands in a seat of
 * its own whose id is the entry's (`entrySeat` in `$lib/server/committee-room.ts`),
 * so it has no seat notes and is nobody's place in a list.
 */
export function isTypedName(entry: GslEntry): boolean {
	return entry.seat.id === entry.id;
}

/** What a Mod or Single speaker view is worked out from, beyond its floor's facts. */
export type ListModeFacts = ListFloorFacts & {
	committeeState: ModeRoomState;
	/** The session's General Speakers' List, which End caucus and Return to GSL put back. */
	generalListId: string | null;
};

/** What a Mod or Single speaker view draws, and what its presses work on. */
export type ListModeView = {
	floor: ListFloorView;
	pressRoom: ModePressRoom;
};

/**
 * What the presses of a Mod or Single speaker view work on (`modeViewPress`):
 * its own list, which is the room's active list, and the floor while it is
 * live. While the room is suspended only the list's own presses work.
 */
function listModePressRoom(facts: ListModeFacts, floor: ListFloorView): ModePressRoom {
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

	return {
		floor: pressFloor,
		queue: shownList,
		seats: facts.seats,
		state: facts.committeeState,
		generalListId: facts.generalListId
	};
}

/** The Mod view: its floor (`modFloorView`) and what its presses work on. */
export function modView(facts: ListModeFacts, isCaucusTimeUp: boolean): ListModeView {
	const floor = modFloorView(facts, isCaucusTimeUp);

	return { floor, pressRoom: listModePressRoom(facts, floor) };
}

/** The Single speaker view: its floor (`singleSpeakerFloorView`) and what its presses work on. */
export function singleSpeakerView(facts: ListModeFacts): ListModeView {
	const floor = singleSpeakerFloorView(facts);

	return { floor, pressRoom: listModePressRoom(facts, floor) };
}
