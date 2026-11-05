import { describe, expect, it } from 'vitest';
import type { ChairExpectation, ChairPress } from '$lib/chair-form';
import type { RoomSeat } from '$lib/committee-room';
import type { GslList } from '$lib/gsl-floor';
import {
	backToGslPress,
	chosenId,
	emptyList,
	extendCaucusPress,
	listAfterPresses,
	liveFloorPress,
	modeAddsAnEntry,
	modeViewPress,
	recognisePress,
	shownList,
	speechEnds,
	unmodPressRoom,
	unmodViewPress,
	type ModePressRoom
} from './caucus-presses';

const NOW = new Date('2026-10-01T12:00:00.000Z');

/** A moment `seconds` after `NOW`. */
function after(seconds: number): string {
	return new Date(NOW.getTime() + seconds * 1000).toISOString();
}

const KENYA: RoomSeat = { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' };
const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const JAPAN: RoomSeat = { id: 'seat-jp', name: 'Japan', countryCode: 'JP' };

const PAUSED_CAUCUS = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 372 };
const RUNNING_CAUCUS = { totalSeconds: 600, endsAt: after(372), pausedRemainingSeconds: null };

/** The caucus list: Kenya speaking, France waiting. */
const CAUCUS_LIST = {
	id: 'caucus-1',
	speakingTimeSeconds: 60,
	entries: [
		{ id: 'entry-ke', position: 1, status: 'speaking' as const, seat: KENYA, spokeSeconds: null },
		{ id: 'entry-fr', position: 2, status: 'waiting' as const, seat: FRANCE, spokeSeconds: null }
	]
};

/** A Mod view's press room, with Kenya's clock ready and the caucus clock paused. */
function modRoom(currentEntryId: string | null = 'entry-ke'): ModePressRoom {
	const timer = { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 60 };

	return {
		floor: { list: CAUCUS_LIST, currentEntryId, timer, startSeconds: 60, attendance: {} },
		queue: CAUCUS_LIST,
		seats: [FRANCE, JAPAN, KENYA],
		state: {
			mode: 'moderated_caucus',
			currentSpeakerEntryId: currentEntryId,
			activeSpeakersListId: 'caucus-1',
			timer,
			caucusClock: PAUSED_CAUCUS
		},
		generalListId: 'gsl-1'
	};
}

/** A form holding `fields`. */
function formOf(fields: Record<string, string> = {}): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return formData;
}

describe('recognisePress', () => {
	it('adds the seat at the end of the list while someone speaks', () => {
		const expectation = recognisePress(CAUCUS_LIST, 'entry-ke', JAPAN, 'entry-jp');

		expect(expectation.state).toBeUndefined();
		expect(expectation.speakers).toEqual([
			{
				listId: 'caucus-1',
				id: 'entry-jp',
				added: { id: 'entry-jp', position: 3, status: 'waiting', seat: JAPAN, spokeSeconds: null }
			}
		]);
	});

	it('gives the seat the floor at once, its clock ready, while nobody has it', () => {
		const list = { ...CAUCUS_LIST, entries: [CAUCUS_LIST.entries[1]] };
		const expectation = recognisePress(list, null, JAPAN, 'entry-jp');

		expect(expectation.state).toEqual({
			currentSpeakerEntryId: 'entry-jp',
			timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 60 }
		});
		// Added, moved to the top of the waiting entries, and speaking: not France, who waited first.
		const changes = expectation.speakers ?? [];
		expect(changes[0].added?.id).toBe('entry-jp');
		expect(changes.at(-1)).toEqual({
			listId: 'caucus-1',
			id: 'entry-jp',
			changes: { status: 'speaking' }
		});
	});
});

describe('extendCaucusPress and backToGslPress', () => {
	it('adds five minutes to the caucus clock, running or paused', () => {
		expect(extendCaucusPress(PAUSED_CAUCUS, NOW)).toEqual({
			state: { caucusClock: { totalSeconds: 900, endsAt: null, pausedRemainingSeconds: 672 } }
		});
		expect(extendCaucusPress(RUNNING_CAUCUS, NOW).state?.caucusClock).toEqual({
			totalSeconds: 900,
			endsAt: after(672),
			pausedRemainingSeconds: null
		});
	});

	it('ends the speech and puts the room back on the GSL with neither clock', () => {
		const expectation = backToGslPress(modRoom().state, 'gsl-1');

		expect(expectation.state).toMatchObject({
			mode: 'formal_debate',
			currentMotionId: null,
			activeSpeakersListId: 'gsl-1',
			currentSpeakerEntryId: null,
			timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null },
			caucusClock: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
		});
		expect(expectation.currentMotion).toBeNull();
		expect(expectation.speakers).toEqual([
			{ listId: 'caucus-1', id: 'entry-ke', changes: { status: 'spoken' } }
		]);
	});
});

describe('modeViewPress', () => {
	it('starts both clocks with the clock button in a moderated caucus', () => {
		const expectation = modeViewPress('?/timerResume', formOf(), modRoom(), NOW);

		expect(expectation?.state?.timer).toEqual({
			totalSeconds: 60,
			endsAt: after(60),
			pausedRemainingSeconds: null
		});
		expect(expectation?.state?.caucusClock).toEqual(RUNNING_CAUCUS);
	});

	it('leaves the caucus clock alone with +15 s', () => {
		const expectation = modeViewPress('?/timerAdd', formOf(), modRoom(), NOW);

		expect(expectation?.state?.caucusClock).toEqual(PAUSED_CAUCUS);
	});

	it('gives "Next" the caucus’s speaking time and leaves its total alone', () => {
		const expectation = modeViewPress('?/nextSpeaker', formOf(), modRoom(), NOW);

		expect(expectation?.state?.currentSpeakerEntryId).toBe('entry-fr');
		expect(expectation?.state?.timer).toEqual({
			totalSeconds: 60,
			endsAt: null,
			pausedRemainingSeconds: 60
		});
		expect(expectation?.state?.caucusClock?.totalSeconds).toBe(600);
	});

	it('recognises the chosen seat, under the id the browser chose', () => {
		const form = formOf({ seatId: 'seat-jp', newRowId: 'entry-jp', listId: 'caucus-1' });
		const expectation = modeViewPress('?/recognise', form, modRoom(), NOW);

		expect(expectation?.speakers?.[0].added?.seat).toEqual(JAPAN);
		expect(modeViewPress('?/recognise', formOf({ seatId: 'seat-jp' }), modRoom(), NOW)).toBeNull();
	});

	it('extends the caucus and ends it', () => {
		expect(modeViewPress('?/extendCaucus', formOf(), modRoom(), NOW)?.state?.caucusClock).toEqual({
			totalSeconds: 900,
			endsAt: null,
			pausedRemainingSeconds: 672
		});
		expect(modeViewPress('?/endCaucus', formOf(), modRoom(), NOW)?.state?.mode).toBe(
			'formal_debate'
		);
		expect(modeViewPress('?/returnToGsl', formOf(), modRoom(), NOW)?.state?.mode).toBe(
			'formal_debate'
		);
	});

	it('moves no caucus clock outside a moderated caucus', () => {
		const room = modRoom();
		const single = { ...room, state: { ...room.state, mode: 'single_speaker' as const } };

		expect(
			modeViewPress('?/timerResume', formOf(), single, NOW)?.state?.caucusClock
		).toBeUndefined();
	});
});

describe('liveFloorPress', () => {
	it('moves the caucus clock with the strip’s clock button in a moderated caucus', () => {
		const floor = modRoom().floor;

		expect(liveFloorPress('?/timerResume', floor, PAUSED_CAUCUS, NOW)?.state?.caucusClock).toEqual(
			RUNNING_CAUCUS
		);
		expect(liveFloorPress('?/timerResume', floor, null, NOW)?.state?.caucusClock).toBeUndefined();
	});
});

describe('the Unmod view’s presses', () => {
	const GSL: GslList = {
		speakersList: {
			id: 'gsl-1',
			name: "General Speakers' List",
			speakingTimeSeconds: 90,
			isOpen: true
		},
		speakers: [{ id: 'entry-gb', position: 1, status: 'waiting', seat: KENYA, spokeSeconds: null }]
	};
	const state = {
		mode: 'unmoderated_caucus' as const,
		currentSpeakerEntryId: null,
		activeSpeakersListId: 'gsl-1',
		timer: { totalSeconds: 600, endsAt: after(522), pausedRemainingSeconds: null }
	};
	const room = unmodPressRoom({
		state,
		gsl: GSL,
		seats: [KENYA, JAPAN],
		attendance: {},
		generalListId: 'gsl-1'
	});

	it('has no list on the floor, and "After the caucus" as its queue', () => {
		expect(room.floor.list).toBeNull();
		expect(room.queue?.id).toBe('gsl-1');
		expect(modeViewPress('?/nextSpeaker', formOf(), room, NOW)).toBeNull();
	});

	it('adds the minute its form sends with "+1 min"', () => {
		const expectation = unmodViewPress('?/timerAdd', formOf({ seconds: '60' }), room, NOW);

		expect(expectation?.state?.timer?.endsAt).toBe(after(582));
	});

	it('pauses its clock, adds to the GSL and ends the caucus', () => {
		const paused = unmodViewPress('?/timerPause', formOf(), room, NOW);
		const added = unmodViewPress(
			'?/add',
			formOf({ seatId: 'seat-jp', newRowId: 'entry-jp' }),
			room,
			NOW
		);
		const ended = unmodViewPress('?/endCaucus', formOf(), room, NOW);

		expect(paused?.state?.timer?.pausedRemainingSeconds).toBe(522);
		expect(added?.speakers?.[0]).toMatchObject({ listId: 'gsl-1', id: 'entry-jp' });
		expect(ended?.state?.mode).toBe('formal_debate');
	});
});

describe('listAfterPresses', () => {
	const SERVER_LIST: GslList = {
		speakersList: { id: 'caucus-1', name: 'Corridors', speakingTimeSeconds: 60, isOpen: true },
		speakers: []
	};

	/** A press that drew `expected`. */
	function press(expected: ChairExpectation): ChairPress {
		return { id: 1, formData: new FormData(), action: new URL('http://localhost/?/x'), expected };
	}

	it('is the server’s list, with the presses on it', () => {
		const added = recognisePress(
			{ id: 'caucus-1', entries: [], speakingTimeSeconds: 60 },
			'x',
			JAPAN,
			'entry-jp'
		);
		const shown = listAfterPresses(SERVER_LIST, 'caucus-1', [press(added)]);

		expect(shown?.speakers.map((entry) => entry.id)).toEqual(['entry-jp']);
	});

	it('is the list a start press has only just drawn, until the server has made its own', () => {
		const started = {
			speakersLists: [
				{
					id: 'caucus-2',
					added: { id: 'caucus-2', name: 'New', speakingTimeSeconds: 45, isOpen: true }
				}
			]
		};

		expect(listAfterPresses(SERVER_LIST, 'caucus-2', [press(started)])?.speakersList.name).toBe(
			'New'
		);
		expect(listAfterPresses(SERVER_LIST, 'caucus-3', [press(started)])).toBeNull();
		expect(listAfterPresses(SERVER_LIST, null, [])).toBeNull();
	});
});

describe('emptyList and shownList', () => {
	const SERVER_LIST: GslList = {
		speakersList: { id: 'caucus-1', name: 'Corridors', speakingTimeSeconds: 60, isOpen: true },
		speakers: []
	};

	it('draws an open list with no entries at the speaking time given', () => {
		expect(emptyList('caucus-9', 45)).toEqual({
			speakersList: { id: 'caucus-9', name: '', speakingTimeSeconds: 45, isOpen: true },
			speakers: []
		});
	});

	it('is the list the server read when it is the one asked for', () => {
		expect(shownList(SERVER_LIST, 'caucus-1', [], 90)).toEqual(SERVER_LIST);
	});

	it('is an empty list of the speaking time given while no list is known yet', () => {
		// "Start caucus" has drawn the running view, but neither the server nor a
		// press has the caucus's list yet.
		expect(shownList(SERVER_LIST, 'caucus-2', [], 90)).toEqual(emptyList('caucus-2', 90));
		expect(shownList(null, null, [], 90)).toEqual(emptyList('', 90));
	});
});

describe('speechEnds', () => {
	it('marks the speech in progress spoken, on its own list', () => {
		expect(speechEnds('caucus-1', 'entry-ke')).toEqual([
			{ listId: 'caucus-1', id: 'entry-ke', changes: { status: 'spoken' } }
		]);
	});

	it('changes nothing while nobody speaks or no list is live', () => {
		expect(speechEnds('caucus-1', null)).toEqual([]);
		expect(speechEnds(null, 'entry-ke')).toEqual([]);
	});
});

describe('chosenId', () => {
	it('reads the id the browser chose from the field named', () => {
		expect(chosenId(formOf({ newRowId: 'entry-jp' }), 'newRowId')).toBe('entry-jp');
	});

	it('is null for a field that is missing or empty, as without JavaScript', () => {
		expect(chosenId(formOf(), 'newRowId')).toBeNull();
		expect(chosenId(formOf({ newRowId: '' }), 'newRowId')).toBeNull();
	});
});

describe('modeAddsAnEntry', () => {
	it('chooses the new entry’s id for an add, a yield and a recognise', () => {
		expect(modeAddsAnEntry('?/add')).toBe(true);
		expect(modeAddsAnEntry('?/yieldToSeat')).toBe(true);
		expect(modeAddsAnEntry('?/recognise')).toBe(true);
		expect(modeAddsAnEntry('?/timerPause')).toBe(false);
	});
});
