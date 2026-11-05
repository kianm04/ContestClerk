import { describe, expect, it } from 'vitest';
import {
	committeeSubline,
	committeesSummary,
	countedWord,
	hasNoOpenSeats,
	papersLine
} from './committee-list';
import type { ManagedSeatCounts } from './committees';

/** Seat counts for a committee of fifteen seats, twelve of them filled. */
const FULL_COUNTS: ManagedSeatCounts = { available: 15, filled: 12, reserved: 2, total: 15 };

describe('countedWord', () => {
	it('keeps the word as it is for one', () => {
		expect(countedWord(1, 'seat')).toBe('1 seat');
	});

	it('adds an "s" for none and for more than one', () => {
		expect(countedWord(0, 'chair')).toBe('0 chairs');
		expect(countedWord(12, 'seat')).toBe('12 seats');
	});
});

describe('committeesSummary', () => {
	it('counts committees and seats in the plural', () => {
		expect(committeesSummary(2, 11)).toBe('2 committees · 11 seats');
	});

	it('says one committee and one seat in the singular', () => {
		expect(committeesSummary(1, 1)).toBe('1 committee · 1 seat');
	});

	it('says nothing yet in the plural', () => {
		expect(committeesSummary(0, 0)).toBe('0 committees · 0 seats');
	});
});

describe('committeeSubline', () => {
	it('joins the short name and the room', () => {
		expect(committeeSubline({ abbreviation: 'HRC', room: 'Room 1' })).toBe('HRC · Room 1');
	});

	it('leaves out a half the committee does not have', () => {
		expect(committeeSubline({ abbreviation: 'HRC', room: null })).toBe('HRC');
		expect(committeeSubline({ abbreviation: null, room: 'Room 1' })).toBe('Room 1');
	});

	it('is empty when the committee has neither', () => {
		expect(committeeSubline({ abbreviation: null, room: null })).toBe('');
	});
});

describe('hasNoOpenSeats', () => {
	it('warns about a committee with no seats at all', () => {
		const counts = { available: 0, filled: 0, reserved: 0, total: 0 };

		expect(hasNoOpenSeats({ seatCounts: counts })).toBe(true);
	});

	it('warns about a committee whose every seat is hidden', () => {
		const counts = { available: 0, filled: 0, reserved: 0, total: 4 };

		expect(hasNoOpenSeats({ seatCounts: counts })).toBe(true);
	});

	it('does not warn about a committee with a seat on offer', () => {
		expect(hasNoOpenSeats({ seatCounts: FULL_COUNTS })).toBe(false);
	});
});

describe('papersLine', () => {
	it('counts the papers handed in against the delegates seated', () => {
		expect(papersLine({ positionPaperCount: 9, seatCounts: FULL_COUNTS })).toBe('Papers 9/12');
	});

	it('is null while nobody has been seated', () => {
		const counts = { available: 15, filled: 0, reserved: 2, total: 15 };

		expect(papersLine({ positionPaperCount: 0, seatCounts: counts })).toBeNull();
	});
});
