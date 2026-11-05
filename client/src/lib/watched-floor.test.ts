import { describe, expect, it } from 'vitest';
import type { CommitteeStateView, RoomSpeaker } from './chair-room';
import type { RoomSeat, TimerSetting } from './committee-room';
import {
	absentSeatIds,
	clockNote,
	emptyFloorText,
	floorModeTitle,
	floorScreenView,
	nextSeats,
	readerOnFloor,
	readerPlaceText,
	unmodBackAtText,
	watchedListTitle,
	type FloorFacts
} from './watched-floor';

// The floor of "What the display shows" (`05-pages/chair/display.md`) and
// "What delegates see" (`05-pages/delegate/committee-live.md`): the GSL, a
// moderated caucus and a single speaker, their lists, and the Unmod clock.

const NO_TIMER: TimerSetting = { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null };

const IDLE_STATE: CommitteeStateView = {
	currentSessionId: null,
	mode: 'idle',
	currentMotionId: null,
	activeSpeakersListId: null,
	currentSpeakerEntryId: null,
	currentVoteId: null,
	agendaTopic: null,
	timer: NO_TIMER
};

const SEATS: RoomSeat[] = [
	{ id: 'seat-cn', name: 'China', countryCode: 'CN', delegateName: 'Wei Zhang' },
	{ id: 'seat-gb', name: 'United Kingdom', countryCode: 'GB', delegateName: null },
	{ id: 'seat-br', name: 'Brazil', countryCode: 'BR', delegateName: null },
	{ id: 'seat-ru', name: 'Russian Federation', countryCode: 'RU', delegateName: null },
	{ id: 'seat-ke', name: 'Kenya', countryCode: 'KE', delegateName: null },
	{ id: 'seat-jp', name: 'Japan', countryCode: 'JP', delegateName: null }
];

const NOW = new Date('2020-05-06T11:19:00Z');

/** China speaking on the GSL; the United Kingdom, Brazil (absent), Russia, Kenya and Japan waiting. */
function gslSpeakers(): RoomSpeaker[] {
	const waiting = SEATS.slice(1).map((seat, index) => ({
		id: `entry-${seat.id}`,
		position: index + 1,
		status: 'waiting' as const,
		seat
	}));

	return [{ id: 'entry-cn', position: 0, status: 'speaking', seat: SEATS[0] }, ...waiting];
}

const FLOOR: FloorFacts = {
	committeeState: {
		...IDLE_STATE,
		mode: 'formal_debate',
		currentSpeakerEntryId: 'entry-cn',
		timer: { totalSeconds: 90, endsAt: '2020-05-06T11:19:52Z', pausedRemainingSeconds: null }
	},
	speakers: gslSpeakers(),
	attendance: { 'seat-br': 'absent', 'seat-gb': 'present' },
	speakersList: {
		id: 'list-1',
		name: "General Speakers' List",
		speakingTimeSeconds: 90,
		isOpen: true
	},
	listPurpose: null,
	currentMotion: null,
	committee: { defaultSpeakingTimeSeconds: 60 }
};

describe('floorScreenView', () => {
	it("draws the GSL's speaker, clock and next three, skipping a seat marked absent", () => {
		const floor = floorScreenView(FLOOR, 'gsl', 'display');

		expect(floor).toMatchObject({
			modeTitle: 'General Speakers’ List',
			caucus: null,
			speaker: SEATS[0],
			speakingTimeSeconds: 90,
			clockNote: null,
			emptyText: 'The next speaker will be called shortly'
		});
		expect(floor.nextSeats.map((seat) => seat.name)).toEqual([
			'United Kingdom',
			'Russian Federation',
			'Kenya'
		]);
	});

	it("names a moderated caucus's topic and carries its own clock", () => {
		const mod: FloorFacts = {
			...FLOOR,
			committeeState: {
				...FLOOR.committeeState,
				mode: 'moderated_caucus',
				caucusClock: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 372 }
			},
			currentMotion: { topic: 'Opening humanitarian corridors' }
		};

		expect(floorScreenView(mod, 'mod', 'display')).toMatchObject({
			modeTitle: 'Moderated caucus · Opening humanitarian corridors',
			caucus: { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 372 },
			emptyText: 'Raise your placard to speak'
		});
	});

	it("names a single speaker's purpose, or none", () => {
		const single = { ...FLOOR, listPurpose: 'Right of reply' };

		expect(floorScreenView(single, 'single', 'display').modeTitle).toBe(
			'Single speaker · Right of reply'
		);
		expect(floorScreenView(FLOOR, 'single', 'display').modeTitle).toBe('Single speaker');
	});

	it('tells a phone nobody has the floor, and falls back to the default speaking time', () => {
		const empty: FloorFacts = {
			...FLOOR,
			committeeState: { ...FLOOR.committeeState, currentSpeakerEntryId: null },
			speakersList: null
		};

		expect(floorScreenView(empty, 'gsl', 'phone')).toMatchObject({
			speaker: null,
			speakingTimeSeconds: 60,
			emptyText: 'Nobody has the floor'
		});
	});
});

describe('clockNote', () => {
	it('reads "About to speak" before the clock has run, with or without a timer', () => {
		expect(clockNote(NO_TIMER)).toBe('About to speak');
		expect(clockNote({ totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 90 })).toBe(
			'About to speak'
		);
	});

	it('reads "Paused" once it has run and stopped, and nothing while it runs', () => {
		expect(clockNote({ totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 41 })).toBe(
			'Paused'
		);
		expect(clockNote(FLOOR.committeeState.timer)).toBeNull();
	});
});

describe('nextSeats', () => {
	it('names nobody when nobody waits', () => {
		expect(nextSeats([gslSpeakers()[0]], {})).toEqual([]);
	});
});

describe('watchedListTitle and absentSeatIds', () => {
	it("titles the GSL's and a caucus's list, and draws none for a single speaker", () => {
		expect(watchedListTitle('gsl')).toBe('Speakers’ list');
		expect(watchedListTitle('mod')).toBe('Caucus speakers');
		expect(watchedListTitle('single')).toBeNull();
	});

	it('picks out the seats marked absent', () => {
		expect(absentSeatIds(FLOOR.attendance)).toEqual(['seat-br']);
	});
});

describe('unmodBackAtText', () => {
	it('is the stored end while the clock runs, even once the time is up', () => {
		// 12:32 UTC is 14:32 in Amsterdam.
		const running = {
			totalSeconds: 600,
			endsAt: '2020-05-06T12:32:00Z',
			pausedRemainingSeconds: null
		};

		expect(unmodBackAtText(running, NOW, 'Europe/Amsterdam')).toBe('Back at 14:32');
		expect(unmodBackAtText(running, new Date('2020-05-06T12:40:00Z'), 'Europe/Amsterdam')).toBe(
			'Back at 14:32'
		);
	});

	it('is now plus the time left while paused, and nothing with no clock', () => {
		const paused = { totalSeconds: 600, endsAt: null, pausedRemainingSeconds: 540 };

		expect(unmodBackAtText(paused, NOW, 'Europe/Amsterdam')).toBe('Back at 13:28');
		expect(unmodBackAtText(NO_TIMER, NOW, 'Europe/Amsterdam')).toBeNull();
	});
});

describe('readerOnFloor and readerPlaceText', () => {
	const floor = floorScreenView(FLOOR, 'gsl', 'phone');

	it('places the reader among the seats "Next" would call, after the speech in progress', () => {
		const reader = readerOnFloor({ ...FLOOR, mySeatId: 'seat-ru' }, floor);

		expect(reader.isReadersFloor).toBe(false);
		// Brazil is absent and skipped, so Russia is 2nd: 52 seconds left plus one 1:30 speech.
		expect(readerPlaceText(reader.readerWait, 52)).toBe('You are 2nd · about 3 min');
		expect(readerPlaceText(reader.readerWait, null)).toBe('You are 2nd · about 2 min');
	});

	it('says the reader has the floor, and gives no place to a seat that is not waiting', () => {
		const reader = readerOnFloor({ ...FLOOR, mySeatId: 'seat-cn' }, floor);

		expect(reader.isReadersFloor).toBe(true);
		expect(readerPlaceText(reader.readerWait, 52)).toBeNull();
	});

	it('gives a seat marked absent no place, and staff watching nothing at all', () => {
		const absent = readerOnFloor({ ...FLOOR, mySeatId: 'seat-br' }, floor);
		const staff = readerOnFloor({ ...FLOOR, mySeatId: null }, floor);

		expect(readerPlaceText(absent.readerWait, 52)).toBeNull();
		expect(staff).toEqual({ isReadersFloor: false, readerWait: null });
	});
});

describe('floorModeTitle and emptyFloorText', () => {
	it('names each floor as its view does', () => {
		expect(floorModeTitle('gsl', null, null)).toBe('General Speakers’ List');
		expect(floorModeTitle('mod', null, null)).toBe('Moderated caucus');
		expect(floorModeTitle('single', null, 'Presentation')).toBe('Single speaker · Presentation');
	});

	it('words an empty floor for the room on the projector, and plainly on a phone', () => {
		expect(emptyFloorText('gsl', 'display')).toBe('The next speaker will be called shortly');
		expect(emptyFloorText('single', 'display')).toBe('The next speaker will be called shortly');
		expect(emptyFloorText('mod', 'display')).toBe('Raise your placard to speak');
		expect(emptyFloorText('mod', 'phone')).toBe('Nobody has the floor');
	});
});
