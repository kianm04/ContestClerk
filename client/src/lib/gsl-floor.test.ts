import { describe, expect, it } from 'vitest';
import type { RoomSeat } from '$lib/committee-room';
import {
	gslFloorView,
	gslViewState,
	isCallFilled,
	isListOnTheFloor,
	isSeatAbsent,
	nextButtonLabel,
	seatInitials,
	seatToCall,
	speechText,
	speechesLatestFirst,
	spokeLastText,
	waitingFloorSentence,
	type GslEntry
} from './gsl-floor';

const CHINA: RoomSeat = { id: 'seat-cn', name: 'China', countryCode: 'CN' };
const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR' };
const KENYA: RoomSeat = { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' };

/** An entry of the list, spoken or not. */
function entry(
	id: string,
	seat: RoomSeat,
	position: number,
	status: GslEntry['status'],
	spokeSeconds: number | null = null,
	finishedAt: string | null = null
): GslEntry {
	return { id, seat, position, status, spokeSeconds, finishedAt };
}

describe('isListOnTheFloor', () => {
	it('is the active list in a mode that calls speakers', () => {
		const state = { mode: 'formal_debate' as const, activeSpeakersListId: 'gsl' };

		expect(isListOnTheFloor(state, 'gsl')).toBe(true);
		expect(isListOnTheFloor({ ...state, mode: 'moderated_caucus' }, 'gsl')).toBe(true);
		expect(isListOnTheFloor({ ...state, mode: 'single_speaker' }, 'gsl')).toBe(true);
	});

	it('is not another list than the active one', () => {
		const state = { mode: 'moderated_caucus' as const, activeSpeakersListId: 'caucus' };

		expect(isListOnTheFloor(state, 'gsl')).toBe(false);
	});

	it('is no list while a caucus, a vote or a suspension has no speaker', () => {
		for (const mode of ['unmoderated_caucus', 'voting', 'suspended', 'idle'] as const) {
			expect(isListOnTheFloor({ mode, activeSpeakersListId: 'gsl' }, 'gsl')).toBe(false);
		}
	});
});

describe('waitingFloorSentence', () => {
	it('says what the GSL waits for', () => {
		expect(waitingFloorSentence('moderated_caucus')).toBe('The GSL resumes when the caucus ends');
		expect(waitingFloorSentence('unmoderated_caucus')).toBe('The GSL resumes when the caucus ends');
		expect(waitingFloorSentence('single_speaker')).toBe('The GSL resumes after the single speaker');
		expect(waitingFloorSentence('voting')).toBe('The GSL resumes when voting ends');
		expect(waitingFloorSentence('suspended')).toBe('The GSL resumes with the session');
	});
});

describe('isSeatAbsent', () => {
	it('is the latest roll call marking the seat absent', () => {
		expect(isSeatAbsent('seat-fr', { 'seat-fr': 'absent' })).toBe(true);
		expect(isSeatAbsent('seat-fr', { 'seat-fr': 'present' })).toBe(false);
	});

	it('is nobody before the first roll call', () => {
		expect(isSeatAbsent('seat-fr', {})).toBe(false);
	});
});

describe('seatToCall', () => {
	const ENTRIES = [
		entry('entry-cn', CHINA, 1, 'speaking'),
		entry('entry-fr', FRANCE, 2, 'waiting'),
		entry('entry-br', BRAZIL, 3, 'waiting')
	];

	it('is the first waiting seat', () => {
		expect(seatToCall(ENTRIES, {})).toEqual(FRANCE);
	});

	it('skips a seat marked absent, which keeps its place', () => {
		expect(seatToCall(ENTRIES, { 'seat-fr': 'absent' })).toEqual(BRAZIL);
	});

	it('is nobody when no present seat waits', () => {
		expect(seatToCall(ENTRIES, { 'seat-fr': 'absent', 'seat-br': 'absent' })).toBeNull();
		expect(seatToCall([ENTRIES[0]], {})).toBeNull();
	});
});

describe('nextButtonLabel', () => {
	it('reads "Next" while someone has the floor and "Call" over an empty one', () => {
		expect(nextButtonLabel('United Kingdom', true)).toBe('Next: United Kingdom');
		expect(nextButtonLabel('United Kingdom', false)).toBe('Call United Kingdom');
	});
});

describe('isCallFilled', () => {
	const WAITING = [entry('entry-fr', FRANCE, 1, 'waiting')];

	it('is outlined during the opening while no roll call exists', () => {
		expect(isCallFilled(false, WAITING)).toBe(false);
	});

	it('is filled once a roll call exists', () => {
		expect(isCallFilled(true, WAITING)).toBe(true);
	});

	it('is filled once someone has been called, roll call or not', () => {
		expect(isCallFilled(false, [entry('entry-cn', CHINA, 1, 'spoken', 88)])).toBe(true);
		expect(isCallFilled(false, [entry('entry-cn', CHINA, 1, 'speaking')])).toBe(true);
	});
});

describe('speechesLatestFirst', () => {
	it('orders the speeches by when they ended, latest first', () => {
		const france = entry('entry-fr', FRANCE, 1, 'spoken', 85, '2026-10-01T10:01:00.000Z');
		const china = entry('entry-cn', CHINA, 2, 'spoken', 88, '2026-10-01T10:04:00.000Z');
		// A yield's entry is put at position 0, but it spoke in between.
		const kenya = entry('entry-ke', KENYA, 0, 'spoken', 30, '2026-10-01T10:02:30.000Z');

		expect(speechesLatestFirst([france, china, kenya]).map((speech) => speech.id)).toEqual([
			'entry-cn',
			'entry-ke',
			'entry-fr'
		]);
	});

	it('puts a speech a press has only just ended first', () => {
		const france = entry('entry-fr', FRANCE, 1, 'spoken', 85, '2026-10-01T10:01:00.000Z');
		const china = entry('entry-cn', CHINA, 2, 'spoken');

		expect(speechesLatestFirst([france, china]).map((speech) => speech.id)).toEqual([
			'entry-cn',
			'entry-fr'
		]);
		expect(speechesLatestFirst([china, france]).map((speech) => speech.id)).toEqual([
			'entry-cn',
			'entry-fr'
		]);
	});

	it('orders speeches with no end time by their place in the list', () => {
		const france = entry('entry-fr', FRANCE, 1, 'spoken');
		const china = entry('entry-cn', CHINA, 2, 'spoken');

		expect(speechesLatestFirst([france, china]).map((speech) => speech.id)).toEqual([
			'entry-cn',
			'entry-fr'
		]);
	});

	it('leaves out the entries that have not spoken', () => {
		expect(speechesLatestFirst([entry('entry-fr', FRANCE, 1, 'waiting')])).toEqual([]);
	});
});

describe('speechText', () => {
	it('writes the seat and how long it spoke', () => {
		expect(speechText(entry('entry-fr', FRANCE, 1, 'spoken', 85))).toBe('France 1:25');
	});

	it('writes the seat alone when the length is not known yet', () => {
		expect(speechText(entry('entry-fr', FRANCE, 1, 'spoken'))).toBe('France');
	});
});

describe('spokeLastText', () => {
	it('names the last speech and its length', () => {
		const entries = [
			entry('entry-fr', FRANCE, 1, 'spoken', 85, '2026-10-01T10:01:00.000Z'),
			entry('entry-cn', CHINA, 2, 'spoken', 88, '2026-10-01T10:04:00.000Z')
		];

		expect(spokeLastText(entries)).toBe('China spoke last · 1:28');
	});

	it('names the seat alone while its length is on its way', () => {
		expect(spokeLastText([entry('entry-cn', CHINA, 1, 'spoken')])).toBe('China spoke last');
	});

	it('says nothing before anyone has spoken', () => {
		expect(spokeLastText([entry('entry-fr', FRANCE, 1, 'waiting')])).toBeNull();
	});
});

describe('seatInitials', () => {
	it('takes the first letter of the first two words', () => {
		expect(seatInitials('Secretary-General')).toBe('SG');
		expect(seatInitials('World Bank Group')).toBe('WB');
		expect(seatInitials('press')).toBe('P');
	});
});

describe('gslFloorView', () => {
	const ENTRIES = [
		entry('entry-fr', FRANCE, 1, 'spoken', 85, '2026-10-01T10:01:00.000Z'),
		entry('entry-cn', CHINA, 2, 'speaking'),
		entry('entry-br', BRAZIL, 3, 'waiting'),
		entry('entry-ke', KENYA, 4, 'waiting')
	];
	const FACTS = {
		committeeState: {
			mode: 'formal_debate' as const,
			activeSpeakersListId: 'gsl',
			currentSpeakerEntryId: 'entry-cn'
		},
		listId: 'gsl',
		entries: ENTRIES,
		seats: [BRAZIL, CHINA, FRANCE, KENYA],
		attendance: { 'seat-ke': 'absent' as const },
		hasRollCall: true
	};

	it('shows who has the floor, who comes next and where a yield may go', () => {
		expect(gslFloorView(FACTS)).toEqual({
			isLive: true,
			speaking: ENTRIES[1],
			nextSeat: BRAZIL,
			spokeLast: 'France spoke last · 1:25',
			isCallFilled: true,
			// Present seats only, the speaker's own left out.
			yieldSeats: [BRAZIL, FRANCE]
		});
	});

	it('waits, with nobody on the floor, while another mode is live', () => {
		const caucus = {
			...FACTS,
			committeeState: {
				mode: 'moderated_caucus' as const,
				activeSpeakersListId: 'caucus',
				currentSpeakerEntryId: 'entry-elsewhere'
			}
		};
		const view = gslFloorView(caucus);

		expect(view.isLive).toBe(false);
		expect(view.speaking).toBeNull();
	});

	it('has nobody on the floor between speeches', () => {
		const between = {
			...FACTS,
			committeeState: { ...FACTS.committeeState, currentSpeakerEntryId: null }
		};

		expect(gslFloorView(between).speaking).toBeNull();
	});
});

describe('gslViewState', () => {
	const ENTRIES = [
		entry('entry-cn', CHINA, 1, 'speaking'),
		entry('entry-br', BRAZIL, 2, 'waiting')
	];
	const LIST = { id: 'gsl', name: "General Speakers' List", speakingTimeSeconds: 90, isOpen: true };
	const TIMER = { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 90 };
	const FACTS = {
		committeeState: {
			mode: 'formal_debate' as const,
			activeSpeakersListId: 'gsl',
			currentSpeakerEntryId: 'entry-cn',
			timer: TIMER
		},
		list: LIST,
		entries: ENTRIES,
		seats: [BRAZIL, CHINA],
		attendance: {},
		hasRollCall: true
	};
	const SHOWN_LIST = { id: 'gsl', entries: ENTRIES, speakingTimeSeconds: 90 };

	it('presses on the GSL and its floor while the GSL has the floor', () => {
		const { floor, pressRoom } = gslViewState(FACTS);

		expect(floor.speaking?.id).toBe('entry-cn');
		expect(pressRoom).toEqual({
			floor: {
				list: SHOWN_LIST,
				currentEntryId: 'entry-cn',
				timer: TIMER,
				startSeconds: 90,
				attendance: {}
			},
			queue: SHOWN_LIST,
			seats: [BRAZIL, CHINA]
		});
	});

	it('presses on the GSL alone while another mode has the floor', () => {
		const voting = {
			...FACTS,
			committeeState: { ...FACTS.committeeState, mode: 'voting' as const }
		};
		const { pressRoom } = gslViewState(voting);

		expect(pressRoom.floor.list).toBeNull();
		expect(pressRoom.floor.currentEntryId).toBeNull();
		expect(pressRoom.queue).toEqual(SHOWN_LIST);
	});
});
