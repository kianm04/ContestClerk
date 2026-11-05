import { describe, expect, it } from 'vitest';
import type { CommitteeSession, RoomSpeaker } from '$lib/chair-room';
import { CLEARED_TIMER, type RoomSeat, type TimerSetting } from '$lib/committee-room';
import {
	addSpeakerPress,
	addsAnEntry,
	endSessionPress,
	finishSpeechPress,
	floorPress,
	listSettingsPress,
	listViewPress,
	nextSpeakerPress,
	placeSpeakerPress,
	queuePress,
	removeSpeakerPress,
	roomFloor,
	setAgendaPress,
	setDropFields,
	speakNowPress,
	swapSpeakerPress,
	timerPress,
	yieldToSeatPress,
	type Floor,
	type ListViewRoom,
	type ShownList
} from './room-presses';

const PRESSED = new Date('2026-09-26T10:00:00.000Z');

const FRANCE: RoomSeat = { id: 'seat-france', name: 'France', countryCode: 'FR' };
const GHANA: RoomSeat = { id: 'seat-ghana', name: 'Ghana', countryCode: 'GH' };
const INDIA: RoomSeat = { id: 'seat-india', name: 'India', countryCode: 'IN' };

/** France speaking, then Ghana and India waiting in that order. */
const ENTRIES: RoomSpeaker[] = [
	{ id: 'entry-france', position: 1, status: 'speaking', seat: FRANCE },
	{ id: 'entry-ghana', position: 2, status: 'waiting', seat: GHANA },
	{ id: 'entry-india', position: 3, status: 'waiting', seat: INDIA }
];

const LIST: ShownList = { id: 'list-1', entries: ENTRIES, speakingTimeSeconds: 90 };

/** Forty seconds left of a ninety-second speech at `PRESSED`. */
const RUNNING: TimerSetting = {
	totalSeconds: 90,
	endsAt: '2026-09-26T10:00:40.000Z',
	pausedRemainingSeconds: null
};

const FLOOR: Floor = {
	list: LIST,
	currentEntryId: 'entry-france',
	timer: RUNNING,
	startSeconds: 90,
	attendance: {}
};

/** What a called speaker's clock holds: the list's ninety seconds, ready and not running (S4). */
const READY = { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 90 };

/** A form's fields, as a press sends them. */
function formOf(fields: Record<string, string>): FormData {
	const formData = new FormData();
	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return formData;
}

describe('roomFloor', () => {
	const SPEAKERS_LIST = {
		id: 'list-1',
		name: "General Speakers' List",
		speakingTimeSeconds: 90,
		isOpen: true
	};

	it('works on the active list, with its speaking time as what "Start timer" starts', () => {
		const committeeState = { currentSpeakerEntryId: 'entry-france', timer: RUNNING };

		expect(roomFloor(SPEAKERS_LIST, ENTRIES, committeeState, 60)).toEqual(FLOOR);
	});

	it("starts the committee's default speaking time when the room is on no list", () => {
		const committeeState = { currentSpeakerEntryId: null, timer: CLEARED_TIMER };

		expect(roomFloor(null, [], committeeState, 60)).toEqual({
			list: null,
			currentEntryId: null,
			timer: CLEARED_TIMER,
			startSeconds: 60,
			attendance: {}
		});
	});

	it('carries the attendance whose absent seats "Next" skips', () => {
		const committeeState = { currentSpeakerEntryId: null, timer: CLEARED_TIMER };
		const attendance = { 'seat-ghana': 'absent' as const };

		expect(roomFloor(null, [], committeeState, 60, attendance).attendance).toEqual(attendance);
	});
});

describe('nextSpeakerPress', () => {
	it('ends the speech and gives the first seat waiting the floor, its clock ready and not running', () => {
		expect(nextSpeakerPress(LIST, 'entry-france')).toEqual({
			state: { currentSpeakerEntryId: 'entry-ghana', timer: READY },
			speakers: [
				{ listId: 'list-1', id: 'entry-france', changes: { status: 'spoken' } },
				{ listId: 'list-1', id: 'entry-ghana', changes: { status: 'speaking' } }
			]
		});
	});

	it('skips a seat marked absent at the latest roll call, as the database does', () => {
		const expected = nextSpeakerPress(LIST, 'entry-france', { 'seat-ghana': 'absent' });

		expect(expected.state?.currentSpeakerEntryId).toBe('entry-india');
		expect(expected.speakers?.[1]).toEqual({
			listId: 'list-1',
			id: 'entry-india',
			changes: { status: 'speaking' }
		});
	});

	it('calls the first seat over an empty floor without ending any speech', () => {
		const nobodySpeaking = { ...LIST, entries: ENTRIES.slice(1) };

		expect(nextSpeakerPress(nobodySpeaking, null).speakers).toEqual([
			{ listId: 'list-1', id: 'entry-ghana', changes: { status: 'speaking' } }
		]);
	});

	it('clears the floor and the timer when nobody is waiting', () => {
		const onlyFrance = { ...LIST, entries: [ENTRIES[0]] };

		expect(nextSpeakerPress(onlyFrance, 'entry-france').state).toEqual({
			currentSpeakerEntryId: null,
			timer: CLEARED_TIMER
		});
	});

	it('clears the floor when every seat waiting is marked absent', () => {
		const attendance = { 'seat-ghana': 'absent' as const, 'seat-india': 'absent' as const };

		expect(nextSpeakerPress(LIST, 'entry-france', attendance).state).toEqual({
			currentSpeakerEntryId: null,
			timer: CLEARED_TIMER
		});
	});
});

describe('speakNowPress', () => {
	it('gives a waiting seat the floor at once, its clock ready, ending the speech in progress', () => {
		expect(speakNowPress(LIST, 'entry-france', 'entry-india')).toEqual({
			state: { currentSpeakerEntryId: 'entry-india', timer: READY },
			speakers: [
				{ listId: 'list-1', id: 'entry-india', changes: { position: 2 } },
				{ listId: 'list-1', id: 'entry-ghana', changes: { position: 3 } },
				{ listId: 'list-1', id: 'entry-france', changes: { status: 'spoken' } },
				{ listId: 'list-1', id: 'entry-india', changes: { status: 'speaking' } }
			]
		});
	});

	it('ends no speech over an empty floor, and moves nobody for the first seat', () => {
		expect(speakNowPress(LIST, null, 'entry-ghana')?.speakers).toEqual([
			{ listId: 'list-1', id: 'entry-ghana', changes: { status: 'speaking' } }
		]);
	});

	it('leaves an entry that is not waiting to the server', () => {
		expect(speakNowPress(LIST, 'entry-france', 'entry-france')).toBeNull();
		expect(speakNowPress(LIST, 'entry-france', 'someone-else')).toBeNull();
	});
});

describe('finishSpeechPress', () => {
	it('clears the floor and the timer and marks the speech as spoken', () => {
		expect(finishSpeechPress('list-1', 'entry-france')).toEqual({
			state: { currentSpeakerEntryId: null, timer: CLEARED_TIMER },
			speakers: [{ listId: 'list-1', id: 'entry-france', changes: { status: 'spoken' } }]
		});
	});

	it('marks nobody as spoken when nobody had the floor', () => {
		expect(finishSpeechPress('list-1', null).speakers).toEqual([]);
	});
});

describe('timerPress', () => {
	it('sets the timer a button gives', () => {
		expect(timerPress(RUNNING)).toEqual({ state: { timer: RUNNING } });
	});

	it('expects nothing from a press that would change nothing', () => {
		expect(timerPress(null)).toBeNull();
	});
});

describe('floorPress', () => {
	it('finishes the speech for "End speech"', () => {
		expect(floorPress('?/endSpeech', FLOOR, PRESSED)).toEqual({
			state: { currentSpeakerEntryId: null, timer: CLEARED_TIMER },
			speakers: [{ listId: 'list-1', id: 'entry-france', changes: { status: 'spoken' } }]
		});
	});

	it('leaves "End speech" to the server when nobody is speaking', () => {
		expect(floorPress('?/endSpeech', { ...FLOOR, currentEntryId: null }, PRESSED)).toBeNull();
	});

	it('leaves "Next speaker" to the server when the room is on no list', () => {
		expect(floorPress('?/nextSpeaker', { ...FLOOR, list: null }, PRESSED)).toBeNull();
	});

	it('calls the next present seat, skipping the absent ones the floor knows of', () => {
		const floor = { ...FLOOR, attendance: { 'seat-ghana': 'absent' as const } };

		expect(floorPress('?/nextSpeaker', floor, PRESSED)?.state?.currentSpeakerEntryId).toBe(
			'entry-india'
		);
	});

	it('pauses the timer with the seconds it has left', () => {
		expect(floorPress('?/timerPause', FLOOR, PRESSED)).toEqual({
			state: { timer: { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 40 } }
		});
	});
});

describe('yieldToSeatPress', () => {
	it('puts the seat on the floor on a new entry, with the seconds that were left', () => {
		const expected = yieldToSeatPress(LIST, 'entry-france', RUNNING, INDIA, 'new-entry', PRESSED);

		expect(expected.state).toEqual({
			currentSpeakerEntryId: 'new-entry',
			timer: { totalSeconds: 90, endsAt: '2026-09-26T10:00:40.000Z', pausedRemainingSeconds: null }
		});
		expect(expected.speakers?.[1]).toEqual({
			listId: 'list-1',
			id: 'new-entry',
			added: { id: 'new-entry', position: 0, status: 'speaking', seat: INDIA, spokeSeconds: null }
		});
	});
});

describe('addSpeakerPress', () => {
	it('adds the seat at the end, waiting, under the id the browser chose', () => {
		expect(addSpeakerPress('list-1', ENTRIES, FRANCE, 'new-entry')).toEqual({
			speakers: [
				{
					listId: 'list-1',
					id: 'new-entry',
					added: {
						id: 'new-entry',
						position: 4,
						status: 'waiting',
						seat: FRANCE,
						spokeSeconds: null
					}
				}
			]
		});
	});
});

describe('queuePress', () => {
	it('marks a removed entry as removed', () => {
		expect(queuePress(LIST, formOf({ entryId: 'entry-india' }), '?/remove')).toEqual({
			speakers: [{ listId: 'list-1', id: 'entry-india', changes: { status: 'removed' } }]
		});
	});

	it('swaps an entry moved up with the waiting entry above it', () => {
		expect(queuePress(LIST, formOf({ entryId: 'entry-india' }), '?/moveUp')).toEqual({
			speakers: [
				{ listId: 'list-1', id: 'entry-india', changes: { position: 2 } },
				{ listId: 'list-1', id: 'entry-ghana', changes: { position: 3 } }
			]
		});
	});

	it('moves nothing past the top of the waiting entries', () => {
		expect(queuePress(LIST, formOf({ entryId: 'entry-ghana' }), '?/moveUp')).toEqual({});
	});

	it('writes the positions of a drop, read from the place the drag form sends', () => {
		const formData = new FormData();
		setDropFields(formData, { id: 'entry-india', toIndex: 0 });

		expect(queuePress(LIST, formData, '?/moveTo')).toEqual({
			speakers: [
				{ listId: 'list-1', id: 'entry-india', changes: { position: 2 } },
				{ listId: 'list-1', id: 'entry-ghana', changes: { position: 3 } }
			]
		});
	});

	it('leaves a press on an entry that is not on the list to the server', () => {
		expect(queuePress(LIST, formOf({ entryId: 'someone-else' }), '?/remove')).toBeNull();
	});
});

describe('removeSpeakerPress', () => {
	it('marks the entry as removed', () => {
		expect(removeSpeakerPress('list-1', 'entry-ghana')).toEqual({
			speakers: [{ listId: 'list-1', id: 'entry-ghana', changes: { status: 'removed' } }]
		});
	});
});

describe('swapSpeakerPress', () => {
	it('swaps an entry moved down with the waiting entry below it', () => {
		expect(swapSpeakerPress('list-1', ENTRIES, 'entry-ghana', 'down')).toEqual({
			speakers: [
				{ listId: 'list-1', id: 'entry-ghana', changes: { position: 3 } },
				{ listId: 'list-1', id: 'entry-india', changes: { position: 2 } }
			]
		});
	});

	it('moves nothing for an entry that is not on the list', () => {
		expect(swapSpeakerPress('list-1', ENTRIES, 'someone-else', 'up')).toEqual({});
	});
});

describe('placeSpeakerPress', () => {
	it('writes the waiting positions once the entry stands at the top', () => {
		expect(placeSpeakerPress('list-1', ENTRIES, 'entry-india', 0)).toEqual({
			speakers: [
				{ listId: 'list-1', id: 'entry-india', changes: { position: 2 } },
				{ listId: 'list-1', id: 'entry-ghana', changes: { position: 3 } }
			]
		});
	});
});

describe('setAgendaPress', () => {
	it('sets the topic under debate', () => {
		expect(setAgendaPress('Water security')).toEqual({ state: { agendaTopic: 'Water security' } });
	});
});

describe('listSettingsPress', () => {
	it('opens and closes the list', () => {
		expect(listSettingsPress('list-1', new FormData(), '?/closeList')).toEqual({
			speakersLists: [{ id: 'list-1', changes: { isOpen: false } }]
		});
	});

	it('sets a speaking time typed the MUN way, and leaves one the server refuses to it', () => {
		const typed = formOf({ speakingTime: '1:30' });
		const tooShort = formOf({ speakingTime: '0:05' });

		expect(listSettingsPress('list-1', typed, '?/setSpeakingTime')).toEqual({
			speakersLists: [{ id: 'list-1', changes: { speakingTimeSeconds: 90 } }]
		});
		expect(listSettingsPress('list-1', tooShort, '?/setSpeakingTime')).toBeNull();
	});
});

describe('addsAnEntry', () => {
	it('is the add box and a yield to a seat, whose new entry the browser names', () => {
		expect(addsAnEntry('?/add')).toBe(true);
		expect(addsAnEntry('?/yieldToSeat')).toBe(true);
		expect(addsAnEntry('?/nextSpeaker')).toBe(false);
	});
});

describe('listViewPress', () => {
	const ROOM: ListViewRoom = { floor: FLOOR, queue: LIST, seats: [FRANCE, GHANA, INDIA] };

	it("sends the floor's buttons to the floor", () => {
		expect(listViewPress('?/nextSpeaker', new FormData(), ROOM, PRESSED)?.state).toEqual({
			currentSpeakerEntryId: 'entry-ghana',
			timer: READY
		});
		expect(listViewPress('?/timerPause', new FormData(), ROOM, PRESSED)).toEqual({
			state: { timer: { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 40 } }
		});
	});

	it('adds the seat the add box chose, under the id the browser chose', () => {
		const formData = formOf({ seatId: 'seat-france', newRowId: 'new-entry' });

		expect(listViewPress('?/add', formData, ROOM, PRESSED)).toEqual(
			addSpeakerPress('list-1', ENTRIES, FRANCE, 'new-entry')
		);
	});

	it('leaves an add with no known seat or no new id to the server', () => {
		expect(listViewPress('?/add', formOf({ seatId: 'nowhere' }), ROOM, PRESSED)).toBeNull();
		expect(listViewPress('?/add', formOf({ seatId: 'seat-france' }), ROOM, PRESSED)).toBeNull();
	});

	it('yields to the seat chosen in the Yield menu, with the time left', () => {
		const formData = formOf({ seatId: 'seat-india', newRowId: 'new-entry' });

		expect(listViewPress('?/yieldToSeat', formData, ROOM, PRESSED)).toEqual(
			yieldToSeatPress(LIST, 'entry-france', RUNNING, INDIA, 'new-entry', PRESSED)
		);
	});

	it('leaves a yield to the server when nobody has the floor', () => {
		const room = { ...ROOM, floor: { ...FLOOR, currentEntryId: null } };
		const formData = formOf({ seatId: 'seat-india', newRowId: 'new-entry' });

		expect(listViewPress('?/yieldToSeat', formData, room, PRESSED)).toBeNull();
	});

	it('gives a row\'s seat the floor for "Speak now"', () => {
		const formData = formOf({ entryId: 'entry-india' });

		expect(listViewPress('?/speakNow', formData, ROOM, PRESSED)).toEqual(
			speakNowPress(LIST, 'entry-france', 'entry-india')
		);
	});

	it("moves and removes a row, and changes the list's settings", () => {
		const moved = listViewPress('?/moveUp', formOf({ entryId: 'entry-india' }), ROOM, PRESSED);
		const closed = listViewPress('?/closeList', new FormData(), ROOM, PRESSED);

		expect(moved).toEqual(queuePress(LIST, formOf({ entryId: 'entry-india' }), '?/moveUp'));
		expect(closed).toEqual({ speakersLists: [{ id: 'list-1', changes: { isOpen: false } }] });
	});

	it("leaves the queue's presses to the server when it shows no list", () => {
		const room = { ...ROOM, queue: null };

		expect(
			listViewPress('?/speakNow', formOf({ entryId: 'entry-india' }), room, PRESSED)
		).toBeNull();
		expect(listViewPress('?/closeList', new FormData(), room, PRESSED)).toBeNull();
	});
});

describe('endSessionPress', () => {
	const RUNNING_SESSION: CommitteeSession = {
		id: 'session-2',
		name: 'Session 2',
		status: 'in_progress',
		startedAt: '2026-09-26T08:00:00.000Z',
		endedAt: null
	};

	it('leaves the room idle, with nothing running', () => {
		const expected = endSessionPress(RUNNING_SESSION, PRESSED);

		expect(expected.state?.mode).toBe('idle');
		expect(expected.state?.currentSessionId).toBeNull();
		expect(expected.currentMotion).toBeNull();
	});

	it('keeps the session, marked ended at the press, for the ended card', () => {
		const expected = endSessionPress(RUNNING_SESSION, PRESSED);

		expect(expected.currentSession).toEqual({
			...RUNNING_SESSION,
			status: 'ended',
			endedAt: PRESSED.toISOString()
		});
	});

	it('keeps no session when there was none', () => {
		expect(endSessionPress(null, PRESSED).currentSession).toBeNull();
	});
});
