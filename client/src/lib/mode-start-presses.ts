/**
 * What the start buttons of the Mod, Unmod and Single speaker views are
 * expected to change, worked out in the browser at the moment of the press
 * (T141): "Start caucus" twice and "Give the floor". The start forms hand
 * these to the chair's instant form (`$lib/chair-form.ts`), so the running
 * view is drawn the moment the button is pressed.
 *
 * Each does what the server does (the start actions on each view's route, and
 * `$lib/server/mode-starts.ts`): a caucus is recorded as a motion already
 * passed, under the id the browser chose; a single speaker is given a list of
 * their own. The database chooses the ids of those lists itself, so the ones
 * drawn here only stand for them until the server has answered. The presses
 * of the running views are `$lib/caucus-presses.ts`.
 */

import type { ChairExpectation, ChairPress } from '$lib/chair-form';
import type { ChairMotion } from '$lib/chair-room';
import { CLEARED_CAUCUS_CLOCK, caucusClockForTotal } from '$lib/caucus-clock';
import { chosenId, speechEnds, type ModeRoomState } from '$lib/caucus-presses';
import { readModStartForm, readUnmodStartForm, type CaucusStartInput } from '$lib/caucus-start';
import { PRESSED_AT_FIELD } from '$lib/clock-offset';
import { CLEARED_TIMER, readyTimer, startedTimer, type RoomSeat } from '$lib/committee-room';
import { NEW_ROW_ID_FIELD } from '$lib/new-row-id';
import { purposeWords, readSingleSpeakerForm, type SingleSpeakerInput } from '$lib/single-speaker';

/**
 * The form fields a start press carries the ids the browser chose for the
 * rows it draws at once: the caucus's or single speaker's list and the single
 * speaker's entry. The database chooses its own ids for these, so they only
 * name the rows drawn until the server has answered.
 */
export const NEW_LIST_ID_FIELD = 'newListId';

/** What a start press reads beyond its own form: the room, its GSL and who raised the caucus. */
export type StartPressFacts = {
	state: ModeRoomState;
	generalListId: string | null;
	/** The name of the seat that raised the caucus, or null for the chair. */
	raisedByName: string | null;
	pressed: Date;
};

/** The caucus a start records, passed already, as the room's state names it. */
function startedMotion(
	input: CaucusStartInput,
	motionId: string,
	facts: StartPressFacts
): ChairMotion {
	return {
		id: motionId,
		kind: input.kind,
		status: 'passed',
		topic: input.topic,
		totalTimeSeconds: input.totalSeconds,
		speakingTimeSeconds: input.speakingSeconds,
		proposedBySeatName: facts.raisedByName,
		votesFor: null,
		votesAgainst: null,
		createdAt: facts.pressed.toISOString()
	};
}

/**
 * "Start caucus" on the Mod view (`mod.md`, "`startModerated`"): the caucus
 * runs on a new, empty list of its own at its speaking time, with nobody on
 * the floor, the speaker's clock cleared and the caucus clock holding the
 * whole total, paused. The speech in progress ends, and a closed vote on show
 * ends with it.
 */
export function startModeratedCaucusPress(
	input: CaucusStartInput,
	ids: { motionId: string; listId: string },
	facts: StartPressFacts
): ChairExpectation {
	const speakingTimeSeconds = input.speakingSeconds ?? 0;
	// The database names a caucus's list after its topic, as this does.
	const name = input.topic ?? 'Moderated caucus';
	const list = { id: ids.listId, name, speakingTimeSeconds, isOpen: true };

	return {
		state: {
			mode: 'moderated_caucus',
			currentMotionId: ids.motionId,
			activeSpeakersListId: ids.listId,
			currentSpeakerEntryId: null,
			currentVoteId: null,
			timer: CLEARED_TIMER,
			caucusClock: caucusClockForTotal(input.totalSeconds)
		},
		currentMotion: startedMotion(input, ids.motionId, facts),
		speakersLists: [{ id: ids.listId, added: list }],
		speakers: speechEnds(facts.state.activeSpeakersListId, facts.state.currentSpeakerEntryId)
	};
}

/**
 * "Start caucus" on the Unmod view (`unmod.md`, "`startUnmoderated`"): the
 * caucus's one clock runs from the press, nobody has the floor, and the
 * General Speakers' List stays (or becomes again) the active list.
 */
export function startUnmoderatedCaucusPress(
	input: CaucusStartInput,
	motionId: string,
	facts: StartPressFacts
): ChairExpectation {
	return {
		state: {
			mode: 'unmoderated_caucus',
			currentMotionId: motionId,
			activeSpeakersListId: facts.generalListId ?? facts.state.activeSpeakersListId,
			currentSpeakerEntryId: null,
			currentVoteId: null,
			timer: startedTimer(input.totalSeconds, facts.pressed),
			caucusClock: CLEARED_CAUCUS_CLOCK
		},
		currentMotion: startedMotion(input, motionId, facts),
		speakers: speechEnds(facts.state.activeSpeakersListId, facts.state.currentSpeakerEntryId)
	};
}

/**
 * "Give the floor" (`single-speaker.md`, "`startSingle`"): a new list of the
 * single speaker's own, the speaker on it with the floor and the clock ready
 * at the time, not running. No motion is recorded, a caucus that was live
 * ends, and so does the speech in progress. `speaker` is the chosen seat, or
 * a stand-in seat for a typed name.
 */
export function startSingleSpeakerPress(
	input: SingleSpeakerInput,
	speaker: RoomSeat,
	ids: { listId: string; entryId: string },
	state: ModeRoomState
): ChairExpectation {
	const seconds = input.speakingSeconds;
	const list = {
		id: ids.listId,
		name: 'Single speaker',
		speakingTimeSeconds: seconds,
		isOpen: true
	};
	const entry = { id: ids.entryId, position: 1, status: 'speaking' as const, seat: speaker };

	return {
		state: {
			mode: 'single_speaker',
			currentMotionId: null,
			activeSpeakersListId: ids.listId,
			currentSpeakerEntryId: ids.entryId,
			currentVoteId: null,
			timer: readyTimer(seconds),
			caucusClock: CLEARED_CAUCUS_CLOCK
		},
		currentMotion: null,
		speakersLists: [{ id: ids.listId, added: list }],
		speakers: [
			...speechEnds(state.activeSpeakersListId, state.currentSpeakerEntryId),
			{ listId: ids.listId, id: ids.entryId, added: { ...entry, spokeSeconds: null } }
		]
	};
}

/**
 * The purpose of the single speaker a press has only just given the floor
 * on the list `listId`, read from that press's own form, or null when no
 * press did.
 */
export function startedPurpose(listId: string, presses: ChairPress[]): string | null {
	const press = presses.find((candidate) => candidate.formData.get(NEW_LIST_ID_FIELD) === listId);

	if (press === undefined) return null;

	const purpose = String(press.formData.get('purpose') ?? '').trim();
	const purposeOther = String(press.formData.get('purposeOther') ?? '').trim();

	return purposeWords(purpose, purposeOther);
}

/** What a start form's press reads beyond the form itself. */
export type StartFormFacts = {
	state: ModeRoomState;
	generalListId: string | null;
	seats: RoomSeat[];
	/** The seats not marked absent, the only ones that may raise a caucus or take the floor. */
	presentSeatIds: string[];
	/** The committee's speaking time, which an empty "Each speaker" takes. */
	defaultSpeakingSeconds: number;
	pressed: Date;
};

/**
 * Put into a start form being sent the moment of the press and the ids the
 * browser chose for what it draws at once: the motion (`NEW_ROW_ID_FIELD`,
 * which the server saves the caucus under) and the list (`NEW_LIST_ID_FIELD`,
 * only drawn; the database chooses its own). A single speaker's entry takes
 * the first of the two.
 */
export function stampStartForm(formData: FormData, pressed: Date, makeId: () => string): void {
	formData.set(PRESSED_AT_FIELD, pressed.toISOString());
	formData.set(NEW_ROW_ID_FIELD, makeId());
	formData.set(NEW_LIST_ID_FIELD, makeId());
}

/** The name of the seat `seatId`, or null for the chair or a seat not found. */
function seatNameOf(seats: RoomSeat[], seatId: string | null): string | null {
	return seats.find((seat) => seat.id === seatId)?.name ?? null;
}

/** "Start caucus" on the Mod view, read from its stamped form; null for a form the server would refuse. */
export function modStartPressOf(
	formData: FormData,
	facts: StartFormFacts
): ChairExpectation | null {
	const reading = readModStartForm(formData, facts.presentSeatIds, facts.defaultSpeakingSeconds);
	const motionId = chosenId(formData, NEW_ROW_ID_FIELD);
	const listId = chosenId(formData, NEW_LIST_ID_FIELD);

	if (reading.input === null || motionId === null || listId === null) return null;

	const raisedByName = seatNameOf(facts.seats, reading.input.proposedBySeatId);

	return startModeratedCaucusPress(reading.input, { motionId, listId }, { ...facts, raisedByName });
}

/** "Start caucus" on the Unmod view, read from its stamped form; null for a form the server would refuse. */
export function unmodStartPressOf(
	formData: FormData,
	facts: StartFormFacts
): ChairExpectation | null {
	const reading = readUnmodStartForm(formData, facts.presentSeatIds);
	const motionId = chosenId(formData, NEW_ROW_ID_FIELD);

	if (reading.input === null || motionId === null) return null;

	const raisedByName = seatNameOf(facts.seats, reading.input.proposedBySeatId);

	return startUnmoderatedCaucusPress(reading.input, motionId, { ...facts, raisedByName });
}

/**
 * "Give the floor", read from its stamped form; null for a form the server
 * would refuse. A typed name stands in a seat of its own whose id is its
 * entry's, as the server reads such an entry back (`entrySeat`).
 */
export function singleStartPressOf(
	formData: FormData,
	facts: StartFormFacts
): ChairExpectation | null {
	const reading = readSingleSpeakerForm(formData, facts.presentSeatIds);
	const entryId = chosenId(formData, NEW_ROW_ID_FIELD);
	const listId = chosenId(formData, NEW_LIST_ID_FIELD);

	if (reading.input === null || entryId === null || listId === null) return null;

	const { seatId, speakerName } = reading.input;
	const seat = facts.seats.find((candidate) => candidate.id === seatId);
	const speaker = seat ?? { id: entryId, name: speakerName ?? '', countryCode: null };

	return startSingleSpeakerPress(reading.input, speaker, { listId, entryId }, facts.state);
}
