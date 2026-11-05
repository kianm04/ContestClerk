import { describe, expect, it } from 'vitest';
import {
	NOTE_REFUSALS,
	chooseNoteSeatId,
	countNotesBySeat,
	filterSeatsByName,
	hasSeatedDelegate,
	isAboutEarlierDelegate,
	noteAuthorLabel,
	noteBodyProblem,
	noteSeatOptions,
	notesOfSeat,
	type ChairNote,
	type SeatAllocation
} from './chair-notes';
import type { RoomSeat } from './committee-room';

const SEATS: RoomSeat[] = [
	{ id: 'seat-fr', name: 'France', countryCode: 'FR', delegateName: null },
	{ id: 'seat-de', name: 'Germany', countryCode: 'DE', delegateName: 'Jo' },
	{ id: 'seat-gh', name: 'Ghana', countryCode: 'GH', delegateName: 'Kofi' }
];

/** France is empty; Germany and Ghana have delegates. */
const ALLOCATIONS: SeatAllocation[] = [
	{ seatId: 'seat-fr', isFilled: false, allocatedAt: null },
	{ seatId: 'seat-de', isFilled: true, allocatedAt: '2026-01-01T08:00:00Z' },
	{ seatId: 'seat-gh', isFilled: true, allocatedAt: '2026-01-01T08:00:00Z' }
];

/** A note written by `authorId` on `seatId`; everything else is fixed. */
function makeNote(overrides: Partial<ChairNote> = {}): ChairNote {
	return {
		id: 'note-1',
		seatId: 'seat-de',
		authorId: 'chair-1',
		authorName: 'Ada',
		authorTitle: 'Chair',
		body: 'Strong speech.',
		bodyHtml: '<p>Strong speech.</p>\n',
		createdAt: '2026-01-01T10:00:00Z',
		...overrides
	};
}

describe('noteBodyProblem', () => {
	it('refuses a note of nothing but spaces', () => {
		expect(noteBodyProblem('   \n ')).toBe(NOTE_REFUSALS.emptyBody);
	});

	it('refuses a note over 1000 characters, not counting the spaces around it', () => {
		expect(noteBodyProblem('x'.repeat(1001))).toBe(NOTE_REFUSALS.longBody);
		expect(noteBodyProblem(` ${'x'.repeat(1000)} `)).toBeNull();
	});
});

describe('countNotesBySeat and notesOfSeat', () => {
	const notes = [
		makeNote({ id: 'a' }),
		makeNote({ id: 'b', seatId: 'seat-gh' }),
		makeNote({ id: 'c' })
	];

	it('counts the notes of each seat, leaving out seats with none', () => {
		expect(countNotesBySeat(notes)).toEqual({ 'seat-de': 2, 'seat-gh': 1 });
	});

	it('keeps one seat notes in the order they came', () => {
		expect(notesOfSeat(notes, 'seat-de').map((note) => note.id)).toEqual(['a', 'c']);
		expect(notesOfSeat(notes, null)).toEqual([]);
	});
});

describe('chooseNoteSeatId', () => {
	it('takes the seat the address names when it is one of the committee', () => {
		expect(chooseNoteSeatId(SEATS, ALLOCATIONS, 'seat-fr')).toBe('seat-fr');
	});

	it('otherwise takes the first seat with a delegate', () => {
		expect(chooseNoteSeatId(SEATS, ALLOCATIONS, null)).toBe('seat-de');
		expect(chooseNoteSeatId(SEATS, ALLOCATIONS, 'seat-elsewhere')).toBe('seat-de');
	});

	it('is null while nobody is seated', () => {
		const empty = ALLOCATIONS.map((each) => ({ ...each, isFilled: false, allocatedAt: null }));

		expect(chooseNoteSeatId(SEATS, empty, null)).toBeNull();
		expect(hasSeatedDelegate(empty)).toBe(false);
		expect(hasSeatedDelegate(ALLOCATIONS)).toBe(true);
	});
});

describe('isAboutEarlierDelegate', () => {
	it('marks a note older than the current delegate seating', () => {
		expect(isAboutEarlierDelegate('2026-01-01T07:00:00Z', '2026-01-01T08:00:00Z')).toBe(true);
		expect(isAboutEarlierDelegate('2026-01-01T09:00:00Z', '2026-01-01T08:00:00Z')).toBe(false);
	});

	it('marks nothing on an empty seat', () => {
		expect(isAboutEarlierDelegate('2026-01-01T07:00:00Z', null)).toBe(false);
	});
});

describe('noteAuthorLabel', () => {
	it('calls the reader own notes "You"', () => {
		expect(noteAuthorLabel(makeNote(), 'chair-1')).toBe('You');
	});

	it('names another chair with their title', () => {
		const note = makeNote({ authorName: 'Sara', authorTitle: 'Vice Chair' });

		expect(noteAuthorLabel(note, 'chair-2')).toBe('Sara (Vice Chair)');
	});

	it('names an organiser without a title, and a nameless author as "A chair"', () => {
		expect(noteAuthorLabel(makeNote({ authorTitle: null }), 'chair-2')).toBe('Ada');
		expect(noteAuthorLabel(makeNote({ authorName: null, authorTitle: null }), 'x')).toBe('A chair');
	});
});

describe('filterSeatsByName', () => {
	it('keeps the seats whose name contains the text, ignoring case', () => {
		expect(filterSeatsByName(SEATS, ' GER ').map((seat) => seat.id)).toEqual(['seat-de']);
	});

	it('keeps every seat for an empty search', () => {
		expect(filterSeatsByName(SEATS, '')).toHaveLength(3);
	});
});

describe('noteSeatOptions', () => {
	it('labels every seat with its note count', () => {
		expect(noteSeatOptions(SEATS, { 'seat-de': 3 })).toEqual([
			{ value: 'seat-fr', label: 'France (0)' },
			{ value: 'seat-de', label: 'Germany (3)' },
			{ value: 'seat-gh', label: 'Ghana (0)' }
		]);
	});
});
