/**
 * What each button of the Mod, Unmod and Single speaker views is expected to
 * change, worked out in the browser at the moment of the press (T141), the
 * way `$lib/room-presses.ts` does it for the GSL view, whose builders these
 * reuse. The buttons hand these to the chair's instant form
 * (`$lib/chair-form.ts`), and the views draw the room with them laid on top
 * until the server has answered.
 *
 * Each function does what the server does to the same data:
 * `$lib/server/caucus-actions.ts` (Recognise, Extend +5:00, End caucus),
 * `$lib/server/single-speaker-actions.ts` (Return to GSL), and the floor's
 * actions, which in a moderated caucus also move the caucus clock as
 * `caucusClockAfterAction` in `$lib/caucus-floor.ts` says. The server's
 * floor actions call that same function, so the screen and the database
 * agree on both clocks. The start buttons' presses are
 * `$lib/mode-start-presses.ts`.
 */

import {
	expectationsOf,
	speakersAfterPresses,
	speakersListAfterPresses,
	type ChairExpectation,
	type ChairPress,
	type SpeakerChange
} from '$lib/chair-form';
import { TIMER_ADD_SECONDS, readTimerSeconds, type CommitteeStateView } from '$lib/chair-room';
import {
	CLEARED_CAUCUS_CLOCK,
	extendedCaucusClock,
	type CaucusClockSetting
} from '$lib/caucus-clock';
import { CAUCUS_EXTENSION_SECONDS, caucusClockAfterAction } from '$lib/caucus-floor';
import {
	CLEARED_TIMER,
	timerWithAddedSeconds,
	type AttendanceStatus,
	type RoomSeat
} from '$lib/committee-room';
import type { GslList } from '$lib/gsl-floor';
import { NEW_ROW_ID_FIELD } from '$lib/new-row-id';
import {
	addSpeakerPress,
	addsAnEntry,
	finishSpeechPress,
	floorPress,
	listViewPress,
	speakNowPress,
	timerPress,
	type Floor,
	type ListViewRoom,
	type ShownList
} from '$lib/room-presses';
import { nextPosition } from '$lib/speakers-lists';

/** The room's state as these presses read it. */
export type ModeRoomState = Pick<
	CommitteeStateView,
	'mode' | 'currentSpeakerEntryId' | 'activeSpeakersListId' | 'timer'
> & {
	caucusClock?: CaucusClockSetting;
};

/** What a press of the Mod, Unmod or Single speaker view works on, as the page shows it. */
export type ModePressRoom = ListViewRoom & {
	state: ModeRoomState;
	/** The session's General Speakers' List, which End caucus and Return to GSL put back. */
	generalListId: string | null;
};

/**
 * Whether a press adds an entry, so the browser must choose its id before
 * sending it: the GSL view's own (`addsAnEntry`), and "Recognise".
 */
export function modeAddsAnEntry(action: string): boolean {
	return addsAnEntry(action) || action === '?/recognise';
}

/** `expectation` with the caucus clock it also sets. */
function withCaucusClock(
	expectation: ChairExpectation,
	caucusClock: CaucusClockSetting
): ChairExpectation {
	return { ...expectation, state: { ...expectation.state, caucusClock } };
}

/** The speech in progress on `listId` ends, as every press that changes the mode ends it. */
export function speechEnds(listId: string | null, currentEntryId: string | null): SpeakerChange[] {
	if (listId === null || currentEntryId === null) return [];

	return finishSpeechPress(listId, currentEntryId).speakers ?? [];
}

/**
 * Recognising a seat in a moderated caucus (`mod.md`, "`recognise`"): it
 * joins the end of the caucus's list under the id the browser chose, and
 * when nobody has the floor it takes it at once, its clock ready at the
 * caucus's speaking time, as "Speak now" gives it.
 */
export function recognisePress(
	list: ShownList,
	currentEntryId: string | null,
	seat: RoomSeat,
	newEntryId: string
): ChairExpectation {
	const added = addSpeakerPress(list.id, list.entries, seat, newEntryId);

	if (currentEntryId !== null) return added;

	const waitingRow = {
		id: newEntryId,
		position: nextPosition(list.entries),
		status: 'waiting' as const,
		seat,
		spokeSeconds: null
	};
	const withNewRow = { ...list, entries: [...list.entries, waitingRow] };
	// The row waits, so "Speak now" always has an answer for it.
	const takesTheFloor = speakNowPress(withNewRow, null, newEntryId) ?? {};

	return {
		state: takesTheFloor.state,
		speakers: [...(added.speakers ?? []), ...(takesTheFloor.speakers ?? [])]
	};
}

/** "Extend +5:00": five minutes more on the caucus clock, running or paused. */
export function extendCaucusPress(caucusClock: CaucusClockSetting, now: Date): ChairExpectation {
	return {
		state: { caucusClock: extendedCaucusClock(caucusClock, CAUCUS_EXTENSION_SECONDS, now) }
	};
}

/**
 * "End caucus" and "Return to GSL": the speech in progress ends, and the room
 * goes back to formal debate on the General Speakers' List, with no motion,
 * no speaker and neither clock.
 */
export function backToGslPress(
	state: ModeRoomState,
	generalListId: string | null
): ChairExpectation {
	return {
		state: {
			mode: 'formal_debate',
			currentMotionId: null,
			activeSpeakersListId: generalListId ?? state.activeSpeakersListId,
			currentSpeakerEntryId: null,
			timer: CLEARED_TIMER,
			caucusClock: CLEARED_CAUCUS_CLOCK
		},
		currentMotion: null,
		speakers: speechEnds(state.activeSpeakersListId, state.currentSpeakerEntryId)
	};
}

/** The seat a form names in its `seatId` field, among `seats`, or null. */
function seatOf(seats: RoomSeat[], formData: FormData): RoomSeat | null {
	const seatId = formData.get('seatId');

	return seats.find((seat) => seat.id === seatId) ?? null;
}

/** The id the browser chose for a row a press adds, or null when the form has none. */
export function chosenId(formData: FormData, fieldName: string): string | null {
	const id = formData.get(fieldName);

	return typeof id === 'string' && id !== '' ? id : null;
}

/** "Recognise" from the Mod view's add box, on the caucus list it shows. */
function recognisePressOf(room: ModePressRoom, formData: FormData): ChairExpectation | null {
	const seat = seatOf(room.seats, formData);
	const entryId = chosenId(formData, NEW_ROW_ID_FIELD);

	if (room.queue === null || seat === null || entryId === null) return null;

	return recognisePress(room.queue, room.state.currentSpeakerEntryId, seat, entryId);
}

/**
 * A press of any button of the Mod or Single speaker view, by the action it
 * posts to: the view's own (Recognise, Extend +5:00, End caucus, Return to
 * GSL), or one of the GSL view's floor and queue presses, which in a
 * moderated caucus also move the caucus clock. Null for a press the server
 * would refuse, which the screen then leaves to the server's answer.
 */
export function modeViewPress(
	action: string,
	formData: FormData,
	room: ModePressRoom,
	pressed: Date
): ChairExpectation | null {
	if (action === '?/recognise') return recognisePressOf(room, formData);
	if (action === '?/endCaucus' || action === '?/returnToGsl') {
		return backToGslPress(room.state, room.generalListId);
	}
	if (action === '?/extendCaucus') {
		if (room.state.caucusClock === undefined) return null;

		return extendCaucusPress(room.state.caucusClock, pressed);
	}

	const expectation = listViewPress(action, formData, room, pressed);
	const caucusClock = caucusClockAfterAction(room.state, action, pressed);

	if (expectation === null || caucusClock === null) return expectation;

	return withCaucusClock(expectation, caucusClock);
}

/**
 * A press of the live strip's clock button or "Next", from any view
 * (`committee-room.md`, "Live strip"): the floor's own press, and in a
 * moderated caucus the caucus clock with it. `caucusClock` is the room's
 * caucus clock, or null outside a moderated caucus.
 */
export function liveFloorPress(
	action: string,
	floor: Floor,
	caucusClock: CaucusClockSetting | null,
	pressed: Date
): ChairExpectation | null {
	const expectation = floorPress(action, floor, pressed);

	if (expectation === null || caucusClock === null) return expectation;

	const state = { mode: 'moderated_caucus' as const, caucusClock };
	const caucusAfter = caucusClockAfterAction(state, action, pressed);

	return caucusAfter === null ? expectation : withCaucusClock(expectation, caucusAfter);
}

/**
 * A press of any button of the Unmod view: its clock button, "+1 min" (the
 * seconds its form sends, 60), "End caucus", and the presses of "After the
 * caucus", the General Speakers' List's own queue column.
 */
export function unmodViewPress(
	action: string,
	formData: FormData,
	room: ModePressRoom,
	pressed: Date
): ChairExpectation | null {
	if (action === '?/endCaucus') return backToGslPress(room.state, room.generalListId);

	if (action === '?/timerAdd') {
		const seconds = readTimerSeconds(formData.get('seconds'), TIMER_ADD_SECONDS);

		if (seconds === null) return null;

		return timerPress(timerWithAddedSeconds(room.state.timer, seconds, pressed));
	}

	return listViewPress(action, formData, room, pressed);
}

/** What the Unmod view's presses are worked out from. */
export type UnmodPressFacts = {
	state: ModeRoomState;
	/** "After the caucus": the General Speakers' List, with the presses on their way laid on top. */
	gsl: GslList;
	seats: RoomSeat[];
	attendance: Record<string, AttendanceStatus>;
	generalListId: string | null;
};

/**
 * What a press of the Unmod view works on: the caucus's one clock (the
 * room's timer), with no list on the floor, since nobody is called during an
 * unmoderated caucus, and "After the caucus", the General Speakers' List.
 */
export function unmodPressRoom(facts: UnmodPressFacts): ModePressRoom {
	const gsl = facts.gsl.speakersList;
	const queue = {
		id: gsl.id,
		entries: facts.gsl.speakers,
		speakingTimeSeconds: gsl.speakingTimeSeconds
	};
	const floor = {
		list: null,
		currentEntryId: null,
		timer: facts.state.timer,
		startSeconds: facts.state.timer.totalSeconds ?? 0,
		attendance: facts.attendance
	};

	return {
		floor,
		queue,
		seats: facts.seats,
		state: facts.state,
		generalListId: facts.generalListId
	};
}

/** A list a press has only just started, as the press drew it, or null when no press did. */
function startedList(listId: string, presses: ChairPress[]): GslList | null {
	for (const expectation of expectationsOf(presses)) {
		const change = (expectation.speakersLists ?? []).find((list) => list.id === listId);

		if (change?.added) return { speakersList: change.added, speakers: [] };
	}

	return null;
}

/** A list with no entries yet, drawn in the moment before the database has made the real one. */
export function emptyList(listId: string, speakingTimeSeconds: number): GslList {
	return {
		speakersList: { id: listId, name: '', speakingTimeSeconds, isOpen: true },
		speakers: []
	};
}

/**
 * The list `listId` with every press's changes laid on top: the one the
 * server read when it is that list, or one a start press has only just
 * drawn, or null when there is neither.
 */
export function listAfterPresses(
	fromServer: GslList | null,
	listId: string | null,
	presses: ChairPress[]
): GslList | null {
	if (listId === null) return null;

	const base = fromServer?.speakersList.id === listId ? fromServer : startedList(listId, presses);

	if (base === null) return null;

	return {
		speakersList: speakersListAfterPresses(base.speakersList, presses),
		speakers: speakersAfterPresses(base.speakers, listId, presses)
	};
}

/**
 * The list a view draws: `listAfterPresses`, or an empty list of
 * `speakingTimeSeconds` in the moment before any is known.
 */
export function shownList(
	fromServer: GslList | null,
	listId: string | null,
	presses: ChairPress[],
	speakingTimeSeconds: number
): GslList {
	const list = listAfterPresses(fromServer, listId, presses);

	return list ?? emptyList(listId ?? '', speakingTimeSeconds);
}
