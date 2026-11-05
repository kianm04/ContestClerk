/**
 * What each button of the committee room is expected to change, worked out
 * in the browser at the moment of the press (T141). The buttons hand these to
 * the chair's instant form (`$lib/chair-form.ts`), and every screen draws the
 * room with them laid on top until the server has answered.
 *
 * Each function does the same thing, on the same data, as the server action
 * the button posts to, so the screen shows what the database will hold:
 * `$lib/server/chair-floor-actions.ts` for the floor, `$lib/server/speaker-queue-actions.ts`
 * for the queue and `$lib/server/committee-room.ts` and
 * `$lib/server/committee-sessions.ts` for the room's mode and session.
 * Every change says what things will be, never "one more", so laying it over
 * data that already holds it changes nothing.
 */
import type { ChairExpectation, SpeakerChange } from '$lib/chair-form';
import type {
	CommitteeSession,
	CommitteeStateView,
	RoomSpeaker,
	SpeakersListSummary
} from '$lib/chair-room';
import { timerAfterPress } from '$lib/chair-timer-preview';
import type { PendingPlace } from '$lib/drag-order';
import {
	CLEARED_TIMER,
	nextSpeaker,
	readyTimer,
	remainingSeconds,
	startedTimer,
	type AttendanceStatus,
	type RoomSeat,
	type TimerSetting
} from '$lib/committee-room';
import { NEW_ROW_ID_FIELD } from '$lib/new-row-id';
import { SPEAKING_TIME_FIELD, readTypedSpeakingTime } from '$lib/speaking-time';
import {
	nextPosition,
	placedPositions,
	readQueueIndex,
	waitingNeighbour,
	type MoveDirection
} from '$lib/speakers-lists';

/** The speakers list a floor press works on, as the page shows it. */
export type ShownList = {
	id: string;
	/** Every entry of the list, with the presses on their way already laid on top. */
	entries: RoomSpeaker[];
	speakingTimeSeconds: number;
};

/** The change that marks the entry `entryId` of `listId` as having spoken, or none. */
function spokenChanges(listId: string, entryId: string | null): SpeakerChange[] {
	if (entryId === null) return [];

	return [{ listId, id: entryId, changes: { status: 'spoken' } }];
}

/**
 * "Next" and "Call": the speech under way ends, and the first waiting seat
 * not marked absent at the latest roll call takes the floor with its clock
 * ready at the list's speaking time, not running: the chair starts it when
 * the speech starts (S4). With no present seat waiting the floor and the
 * timer are cleared. The same as `call_next_speaker` in the database, so the
 * screen and the server agree on who comes next. Before the first roll call
 * `attendance` is empty and nobody is skipped.
 */
export function nextSpeakerPress(
	list: ShownList,
	currentEntryId: string | null,
	attendance: Record<string, AttendanceStatus> = {}
): ChairExpectation {
	const notSpeaking = list.entries.filter((entry) => entry.id !== currentEntryId);
	const next = nextSpeaker(notSpeaking, attendance);
	const speakers = spokenChanges(list.id, currentEntryId);

	if (next === null) {
		return {
			state: { currentSpeakerEntryId: null, timer: CLEARED_TIMER },
			speakers
		};
	}

	speakers.push({ listId: list.id, id: next.id, changes: { status: 'speaking' } });

	return {
		state: {
			currentSpeakerEntryId: next.id,
			timer: readyTimer(list.speakingTimeSeconds)
		},
		speakers
	};
}

/**
 * "Speak now" in a row's menu (S4): what "Next" does, for that waiting entry
 * instead of the first. The server moves the entry to the top of the waiting
 * entries and then calls the next speaker, so the positions it writes are
 * part of the press too. Null for an entry that is not waiting, which the
 * server refuses.
 */
export function speakNowPress(
	list: ShownList,
	currentEntryId: string | null,
	entryId: string
): ChairExpectation | null {
	const entry = list.entries.find((candidate) => candidate.id === entryId);

	if (entry === undefined || entry.status !== 'waiting') return null;

	const positions = placeSpeakerPress(list.id, list.entries, entryId, 0).speakers ?? [];
	const speaking: SpeakerChange = { listId: list.id, id: entryId, changes: { status: 'speaking' } };

	return {
		state: {
			currentSpeakerEntryId: entryId,
			timer: readyTimer(list.speakingTimeSeconds)
		},
		speakers: [...positions, ...spokenChanges(list.id, currentEntryId), speaking]
	};
}

/** "End speech" and "Yield to chair": the speech ends and nobody new is called. */
export function finishSpeechPress(listId: string, currentEntryId: string | null): ChairExpectation {
	return {
		state: { currentSpeakerEntryId: null, timer: CLEARED_TIMER },
		speakers: spokenChanges(listId, currentEntryId)
	};
}

/**
 * "Yield time" to `seat`: the speech ends, and the seat takes the floor on a
 * new entry at the top of the list, with the seconds that were left.
 * `newEntryId` is the id the browser chose for the entry, which the server
 * saves it under.
 */
export function yieldToSeatPress(
	list: ShownList,
	currentEntryId: string | null,
	timer: TimerSetting,
	seat: RoomSeat,
	newEntryId: string,
	pressed: Date
): ChairExpectation {
	const secondsLeft = remainingSeconds(timer, pressed) ?? 0;
	const runsOn = startedTimer(secondsLeft, pressed);
	const added = {
		id: newEntryId,
		position: 0,
		status: 'speaking' as const,
		seat,
		spokeSeconds: null
	};

	return {
		state: {
			currentSpeakerEntryId: newEntryId,
			timer: { ...runsOn, totalSeconds: list.speakingTimeSeconds }
		},
		speakers: [
			...spokenChanges(list.id, currentEntryId),
			{ listId: list.id, id: newEntryId, added }
		]
	};
}

/** A timer button's press: the timer it gives, or nothing when it would change nothing. */
export function timerPress(setting: TimerSetting | null): ChairExpectation | null {
	if (setting === null) return null;

	return { state: { timer: setting } };
}

/** What the speaker card's buttons work on, as the page shows it. */
export type Floor = {
	/** The list the room is on, or null when it is on none. */
	list: ShownList | null;
	/** The entry with the floor, or null when nobody has it. */
	currentEntryId: string | null;
	/** The room's timer. */
	timer: TimerSetting;
	/** What "Start timer" starts: the list's speaking time. */
	startSeconds: number;
	/**
	 * The latest roll call, keyed by seat id, whose absent seats "Next" skips.
	 * Left out, or empty before the first roll call, nobody is skipped.
	 */
	attendance?: Record<string, AttendanceStatus>;
};

/**
 * The floor the Room page's speaker card, opening card and yield form work on:
 * the active list with its entries, or no list, and the room's speaker and
 * timer. With no list, "Start timer" starts the committee's default speaking time.
 */
export function roomFloor(
	speakersList: SpeakersListSummary | null,
	entries: RoomSpeaker[],
	committeeState: Pick<CommitteeStateView, 'currentSpeakerEntryId' | 'timer'>,
	defaultSpeakingTimeSeconds: number,
	attendance: Record<string, AttendanceStatus> = {}
): Floor {
	const speakingTimeSeconds = speakersList?.speakingTimeSeconds ?? defaultSpeakingTimeSeconds;
	const list = speakersList === null ? null : { id: speakersList.id, entries, speakingTimeSeconds };

	return {
		list,
		currentEntryId: committeeState.currentSpeakerEntryId,
		timer: committeeState.timer,
		startSeconds: speakingTimeSeconds,
		attendance
	};
}

/**
 * A press of one of the speaker card's buttons, by its action, such as
 * `?/nextSpeaker` or `?/timerPause`. Null for a press that would change
 * nothing, which the page then leaves to the server's answer.
 */
export function floorPress(action: string, floor: Floor, pressed: Date): ChairExpectation | null {
	const listId = floor.list?.id ?? null;

	if (action === '?/nextSpeaker') {
		if (floor.list === null) return null;

		return nextSpeakerPress(floor.list, floor.currentEntryId, floor.attendance);
	}

	if (action === '?/endSpeech' || action === '?/yieldToChair') {
		// With nobody speaking the server refuses, and the screen waits for it.
		if (listId === null || floor.currentEntryId === null) return null;

		return finishSpeechPress(listId, floor.currentEntryId);
	}

	return timerPress(timerAfterPress(action, floor.timer, floor.startSeconds, pressed));
}

/** "Add": `seat` joins the end of the list, waiting, under the id the browser chose. */
export function addSpeakerPress(
	listId: string,
	entries: RoomSpeaker[],
	seat: RoomSeat,
	newEntryId: string
): ChairExpectation {
	const added = {
		id: newEntryId,
		position: nextPosition(entries),
		status: 'waiting' as const,
		seat,
		spokeSeconds: null
	};

	return { speakers: [{ listId, id: newEntryId, added }] };
}

/** "Remove": the entry leaves the list. */
export function removeSpeakerPress(listId: string, entryId: string): ChairExpectation {
	return { speakers: [{ listId, id: entryId, changes: { status: 'removed' } }] };
}

/**
 * "Move up" and "Move down": the entry swaps positions with the waiting entry
 * next to it, as the server does. At either end nothing moves.
 */
export function swapSpeakerPress(
	listId: string,
	entries: RoomSpeaker[],
	entryId: string,
	direction: MoveDirection
): ChairExpectation {
	const entry = entries.find((candidate) => candidate.id === entryId);
	const neighbour = waitingNeighbour(entries, entryId, direction);

	if (entry === undefined || neighbour === null) return {};

	const speakers: SpeakerChange[] = [
		{ listId, id: entry.id, changes: { position: neighbour.position } },
		{ listId, id: neighbour.id, changes: { position: entry.position } }
	];

	return { speakers };
}

/**
 * "Move to top" and a drag: the waiting entries' positions once `entryId`
 * stands at `toIndex` (from 0), the same positions the server writes.
 */
export function placeSpeakerPress(
	listId: string,
	entries: RoomSpeaker[],
	entryId: string,
	toIndex: number
): ChairExpectation {
	const positions = placedPositions(entries, entryId, toIndex);
	const speakers: SpeakerChange[] = positions.map((entry) => ({
		listId,
		id: entry.id,
		changes: { position: entry.position }
	}));

	return { speakers };
}

/**
 * Put a drop into the drag form being sent: the entry dropped, and its place
 * counting from 1, which is what `?/moveTo` reads.
 */
export function setDropFields(formData: FormData, drop: PendingPlace): void {
	formData.set('entryId', drop.id);
	formData.set('place', String(drop.toIndex + 1));
}

/**
 * A press on a waiting entry of `list`: "Remove", a move from its menu or
 * arrows, or a drop, which sends the entry's id and, for a drop, its new
 * `place` counting from 1. Null for a press the server would refuse, which
 * the screen then leaves to its answer.
 */
export function queuePress(
	list: ShownList,
	formData: FormData,
	action: string
): ChairExpectation | null {
	const entryId = String(formData.get('entryId') ?? '');

	if (!list.entries.some((entry) => entry.id === entryId)) return null;

	if (action === '?/remove') return removeSpeakerPress(list.id, entryId);
	if (action === '?/moveUp') return swapSpeakerPress(list.id, list.entries, entryId, 'up');
	if (action === '?/moveDown') return swapSpeakerPress(list.id, list.entries, entryId, 'down');
	if (action === '?/moveToTop') return placeSpeakerPress(list.id, list.entries, entryId, 0);

	const place = readQueueIndex(formData.get('place'));

	if (action === '?/moveTo' && place !== null) {
		return placeSpeakerPress(list.id, list.entries, entryId, place);
	}

	return null;
}

/**
 * A press on a list's settings in the GSL view's footer: a new speaking time
 * typed as "1:30" (`readTypedSpeakingTime`), "Open list" or "Close list".
 * Null for a speaking time the server would refuse.
 */
export function listSettingsPress(
	listId: string,
	formData: FormData,
	action: string
): ChairExpectation | null {
	if (action === '?/openList')
		return { speakersLists: [{ id: listId, changes: { isOpen: true } }] };
	if (action === '?/closeList')
		return { speakersLists: [{ id: listId, changes: { isOpen: false } }] };

	const seconds = readTypedSpeakingTime(formData.get(SPEAKING_TIME_FIELD));

	if (action !== '?/setSpeakingTime' || seconds === null) return null;

	return { speakersLists: [{ id: listId, changes: { speakingTimeSeconds: seconds } }] };
}

/**
 * What a press of the GSL view (and of the views that reuse its floor and its
 * queue column) works on, as the page shows it.
 */
export type ListViewRoom = {
	/** The room's floor: the active list, who has the floor, the timer and the attendance. */
	floor: Floor;
	/** The list the queue column shows, with the presses on their way laid on top, or null. */
	queue: ShownList | null;
	/** Every seat of the committee, which "Add" and a yield name by id. */
	seats: RoomSeat[];
};

/** The footer's actions on the list's settings. */
const LIST_SETTINGS_ACTIONS = ['?/setSpeakingTime', '?/closeList', '?/openList'];

/** A row's moves and "Remove", and a drop. */
const ROW_ACTIONS = ['?/remove', '?/moveUp', '?/moveDown', '?/moveToTop', '?/moveTo'];

/** The presses that add an entry, whose id the browser chooses (`NEW_ROW_ID_FIELD`). */
const ROW_ADDING_ACTIONS = ['?/add', '?/yieldToSeat'];

/** Whether a press adds an entry, so the browser must choose its id before sending it. */
export function addsAnEntry(action: string): boolean {
	return ROW_ADDING_ACTIONS.includes(action);
}

/** The seat a form names in its `seatId` field, among `seats`, or null. */
function seatOf(seats: RoomSeat[], formData: FormData): RoomSeat | null {
	const seatId = formData.get('seatId');

	return seats.find((seat) => seat.id === seatId) ?? null;
}

/** The id the browser chose for the entry a press adds, or null when the form has none. */
function newEntryIdOf(formData: FormData): string | null {
	const entryId = formData.get(NEW_ROW_ID_FIELD);

	return typeof entryId === 'string' && entryId !== '' ? entryId : null;
}

/** "Add" from the add box: the chosen seat joins the end of the queue. */
function addPressOf(
	queue: ShownList,
	room: ListViewRoom,
	formData: FormData
): ChairExpectation | null {
	const seat = seatOf(room.seats, formData);
	const entryId = newEntryIdOf(formData);

	if (seat === null || entryId === null) return null;

	return addSpeakerPress(queue.id, queue.entries, seat, entryId);
}

/** A yield to the seat chosen in the Yield menu, with the time left. */
function yieldPressOf(
	room: ListViewRoom,
	formData: FormData,
	pressed: Date
): ChairExpectation | null {
	const { list, currentEntryId, timer } = room.floor;
	const seat = seatOf(room.seats, formData);
	const entryId = newEntryIdOf(formData);

	if (list === null || currentEntryId === null || seat === null || entryId === null) return null;

	return yieldToSeatPress(list, currentEntryId, timer, seat, entryId, pressed);
}

/**
 * A press of any button of the GSL view, by the action it posts to: the
 * floor's controls, "Next", a yield, the add box, a row's menu, a drop or the
 * list footer. The view sends every form through one instant form, and this
 * says what each press will change, with the same rules as the server. Null
 * for a press the server would refuse or that changes nothing, which the
 * screen then leaves to the server's answer.
 */
export function listViewPress(
	action: string,
	formData: FormData,
	room: ListViewRoom,
	pressed: Date
): ChairExpectation | null {
	const queue = room.queue;

	if (action === '?/yieldToSeat') return yieldPressOf(room, formData, pressed);
	if (action === '?/speakNow' && queue !== null) {
		const entryId = String(formData.get('entryId') ?? '');

		return speakNowPress(queue, room.floor.currentEntryId, entryId);
	}
	if (action === '?/add' && queue !== null) return addPressOf(queue, room, formData);
	if (LIST_SETTINGS_ACTIONS.includes(action) && queue !== null) {
		return listSettingsPress(queue.id, formData, action);
	}
	if (ROW_ACTIONS.includes(action) && queue !== null) return queuePress(queue, formData, action);

	return floorPress(action, room.floor, pressed);
}

/** "Set agenda": the topic under debate. */
export function setAgendaPress(topic: string): ChairExpectation {
	return { state: { agendaTopic: topic } };
}

/**
 * "End session" and "Adjourn": the session ends and the room goes idle, with
 * no session, speaker, motion, vote or timer. `session` is the one being
 * ended, which the press keeps as a copy marked ended at `pressed`, so the
 * room shows its ended card at once rather than the Ready card first (T168).
 */
export function endSessionPress(session: CommitteeSession | null, pressed: Date): ChairExpectation {
	const endedSession: CommitteeSession | null =
		session === null ? null : { ...session, status: 'ended', endedAt: pressed.toISOString() };

	return {
		state: {
			mode: 'idle',
			currentSessionId: null,
			currentMotionId: null,
			activeSpeakersListId: null,
			currentSpeakerEntryId: null,
			currentVoteId: null,
			timer: CLEARED_TIMER
		},
		currentSession: endedSession,
		currentMotion: null
	};
}
