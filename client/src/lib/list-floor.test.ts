import { describe, expect, it } from 'vitest';
import type { RoomSeat } from '$lib/committee-room';
import type { GslEntry } from '$lib/gsl-floor';
import type { InstantPress } from '$lib/instant-form.svelte';
import { emptyList } from './caucus-presses';
import {
	isTypedName,
	modFloorView,
	modView,
	shownAttendance,
	singleSpeakerFloorView,
	singleSpeakerView,
	speechNoteHref,
	type ListModeFacts
} from './list-floor';

const KENYA: RoomSeat = { id: 'seat-ke', name: 'Kenya', countryCode: 'KE' };
const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR' };

/** An entry of the list. */
function entry(
	seat: RoomSeat,
	position: number,
	status: GslEntry['status'],
	spoke: number | null = null
): GslEntry {
	return { id: `entry-${seat.id}`, seat, position, status, spokeSeconds: spoke, finishedAt: null };
}

/** A typed name's entry, which stands in a seat whose id is the entry's. */
const SECRETARY_GENERAL: GslEntry = {
	id: 'entry-sg',
	seat: { id: 'entry-sg', name: 'Secretary-General', countryCode: null },
	position: 1,
	status: 'speaking',
	spokeSeconds: null,
	finishedAt: null
};

/** A list floor's facts: Kenya speaking, France waiting. */
function factsWith(changes: Partial<ListModeFacts> = {}): ListModeFacts {
	return {
		committeeState: {
			mode: 'moderated_caucus',
			activeSpeakersListId: 'list-1',
			currentSpeakerEntryId: 'entry-seat-ke',
			timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 60 }
		},
		list: { id: 'list-1', name: 'Corridors', speakingTimeSeconds: 60, isOpen: true },
		entries: [
			entry(BRAZIL, 1, 'spoken', 58),
			entry(KENYA, 2, 'speaking'),
			entry(FRANCE, 3, 'waiting')
		],
		seats: [BRAZIL, FRANCE, KENYA],
		attendance: {},
		isSuspended: false,
		generalListId: 'gsl-1',
		...changes
	};
}

describe('modFloorView', () => {
	it('calls the next seat while there is time: "Next: France"', () => {
		const floor = modFloorView(factsWith(), false);

		expect(floor.speaking?.seat.name).toBe('Kenya');
		expect(floor.nextSeat?.name).toBe('France');
		expect(floor.primary).toBe('next');
		expect(floor.words).toBeNull();
		expect(floor.yieldSeats).toEqual([]);
	});

	it('makes "End caucus" the primary once the time is up, whoever speaks or waits', () => {
		expect(modFloorView(factsWith(), true).primary).toBe('endCaucus');
	});

	it('says who spoke last over an empty floor with a seat waiting', () => {
		const state = { ...factsWith().committeeState, currentSpeakerEntryId: null };
		const entries = [entry(BRAZIL, 1, 'spoken', 58), entry(FRANCE, 3, 'waiting')];
		const floor = modFloorView(factsWith({ committeeState: state, entries }), false);

		expect(floor.words).toEqual({
			title: 'Nobody has the floor',
			line: 'Brazil spoke last · 0:58'
		});
		expect(floor.primary).toBe('next');
	});

	it('asks for a delegation to be recognised, with no primary, while nobody speaks or waits', () => {
		const state = { ...factsWith().committeeState, currentSpeakerEntryId: null };
		const floor = modFloorView(factsWith({ committeeState: state, entries: [] }), false);

		expect(floor.words?.title).toBe('Recognise a delegation to speak');
		expect(floor.words?.line).toContain('Enter gives them the floor');
		expect(floor.primary).toBeNull();
	});

	it('waits for the session while the room is suspended in the caucus', () => {
		const floor = modFloorView(factsWith({ isSuspended: true }), false);

		expect(floor.isLive).toBe(false);
		expect(floor.speaking).toBeNull();
		expect(floor.primary).toBeNull();
		expect(floor.words?.title).toBe('The caucus resumes with the session');
	});
});

describe('singleSpeakerFloorView', () => {
	const singleFacts = (changes: Partial<ListModeFacts> = {}) =>
		factsWith({
			committeeState: {
				mode: 'single_speaker',
				activeSpeakersListId: 'list-1',
				currentSpeakerEntryId: 'entry-sg',
				timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 60 }
			},
			entries: [SECRETARY_GENERAL, entry(FRANCE, 2, 'waiting')],
			...changes
		});

	it('calls the next speaker while one waits, and offers the yields', () => {
		const floor = singleSpeakerFloorView(singleFacts());

		expect(floor.primary).toBe('next');
		expect(floor.nextSeat?.name).toBe('France');
		expect(floor.yieldSeats.map((seat) => seat.name)).toEqual(['Brazil', 'France', 'Kenya']);
	});

	it('returns to the GSL once nobody waits, whether or not someone speaks', () => {
		const speaking = singleSpeakerFloorView(singleFacts({ entries: [SECRETARY_GENERAL] }));

		expect(speaking.primary).toBe('returnToGsl');
	});

	it('says the last speaker has finished, and who spoke last', () => {
		const state = { ...singleFacts().committeeState, currentSpeakerEntryId: null };
		const spoken = { ...SECRETARY_GENERAL, status: 'spoken' as const, spokeSeconds: 58 };
		const floor = singleSpeakerFloorView(singleFacts({ committeeState: state, entries: [spoken] }));

		expect(floor.words).toEqual({
			title: 'The last speaker has finished',
			line: 'Secretary-General spoke last · 0:58'
		});
		expect(floor.primary).toBe('returnToGsl');
	});

	it('waits for the session while suspended', () => {
		const floor = singleSpeakerFloorView(singleFacts({ isSuspended: true }));

		expect(floor.words?.title).toBe('The single speaker resumes with the session');
		expect(floor.isLive).toBe(false);
	});
});

describe('modView and singleSpeakerView', () => {
	it('presses on the mode’s own list and floor, and knows the GSL it returns to', () => {
		const { pressRoom } = modView(factsWith(), false);

		expect(pressRoom.queue?.id).toBe('list-1');
		expect(pressRoom.floor.list?.id).toBe('list-1');
		expect(pressRoom.floor.currentEntryId).toBe('entry-seat-ke');
		expect(pressRoom.generalListId).toBe('gsl-1');
	});

	it('leaves only the list’s presses while suspended', () => {
		const { pressRoom } = singleSpeakerView(factsWith({ isSuspended: true }));

		expect(pressRoom.floor.list).toBeNull();
		expect(pressRoom.queue?.id).toBe('list-1');
	});
});

describe('the small helpers', () => {
	it('tells a typed name from a seat', () => {
		expect(isTypedName(SECRETARY_GENERAL)).toBe(true);
		expect(isTypedName(entry(KENYA, 1, 'speaking'))).toBe(false);
	});

	it('leads "Note on this speech" to the seat, or to the Notes page for a typed name', () => {
		const frame = { conference: { slug: 'thimun-2027' }, committee: { slug: 'unsc' } };
		const notes = '/conferences/thimun-2027/committees/unsc/chair/notes';

		expect(speechNoteHref(frame, entry(KENYA, 1, 'speaking'))).toBe(`${notes}?seat=seat-ke`);
		expect(speechNoteHref(frame, SECRETARY_GENERAL)).toBe(notes);
		expect(speechNoteHref(frame, null)).toBeNull();
	});

	it('draws an empty list in the moment before the real one is made', () => {
		expect(emptyList('list-9', 60)).toEqual({
			speakersList: { id: 'list-9', name: '', speakingTimeSeconds: 60, isOpen: true },
			speakers: []
		});
	});
});

describe('shownAttendance', () => {
	const SEATS = [BRAZIL, FRANCE, KENYA];

	/** A press of the roll call's form, answering for one seat, on the roll call `rollCallId` or none. */
	function rollCallPress(seatId: string, status: string, rollCallId: string | null): InstantPress {
		const formData = new FormData();
		formData.set('seatId', seatId);
		formData.set('status', status);
		if (rollCallId !== null) formData.set('rollCallId', rollCallId);

		return {
			id: 1,
			formData,
			action: new URL('?/setStatus', 'http://localhost/chair/roll-call'),
			expected: null
		};
	}

	it('says nobody is absent before the session’s first roll call', () => {
		expect(shownAttendance({ attendance: {}, latestRollCallId: null, seats: SEATS }, [])).toEqual(
			{}
		);
	});

	it('lays an answer still on its way over the latest roll call', () => {
		const frame = {
			attendance: { 'seat-br': 'present', 'seat-fr': 'absent', 'seat-ke': 'present' } as const,
			latestRollCallId: 'roll-1',
			seats: SEATS
		};

		expect(shownAttendance(frame, [rollCallPress('seat-fr', 'present', 'roll-1')])).toEqual({
			'seat-br': 'present',
			'seat-fr': 'present',
			'seat-ke': 'present'
		});
	});

	it('counts every other seat absent once the first answer makes the session’s first roll call', () => {
		const frame = { attendance: {}, latestRollCallId: null, seats: SEATS };

		expect(shownAttendance(frame, [rollCallPress('seat-ke', 'present', null)])).toEqual({
			'seat-br': 'absent',
			'seat-fr': 'absent',
			'seat-ke': 'present'
		});
	});
});
