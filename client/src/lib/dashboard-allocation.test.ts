import { describe, expect, it } from 'vitest';
import { emptyProgrammeDays, shortOfSeats } from './dashboard-allocation';

describe('shortOfSeats', () => {
	it('keeps only the delegations holding fewer seats than they asked for', () => {
		const harbour = { id: 'harbour', name: 'Harbour View', requestedSeats: 3, givenSeats: 2 };
		const kingsway = { id: 'kingsway', name: 'Kingsway', requestedSeats: 2, givenSeats: 2 };
		const generous = { id: 'generous', name: 'Generous', requestedSeats: 1, givenSeats: 3 };

		expect(shortOfSeats([harbour, kingsway, generous])).toEqual([harbour]);
	});
});

describe('emptyProgrammeDays', () => {
	it('names every conference day no event starts on', () => {
		const eventStarts = ['2026-11-14T09:00:00Z', '2026-11-16T09:00:00Z'];

		expect(emptyProgrammeDays('2026-11-14', '2026-11-16', eventStarts, 'Europe/London')).toEqual([
			'2026-11-15'
		]);
	});

	it("reads each event's day in the conference timezone", () => {
		// 23:30 UTC on 14 November is already 15 November in Amsterdam.
		const eventStarts = ['2026-11-14T08:00:00Z', '2026-11-14T23:30:00Z'];

		expect(emptyProgrammeDays('2026-11-14', '2026-11-15', eventStarts, 'Europe/Amsterdam')).toEqual(
			[]
		);
	});

	it('crosses the end of a month', () => {
		expect(emptyProgrammeDays('2026-10-31', '2026-11-01', [], 'Europe/London')).toEqual([
			'2026-10-31',
			'2026-11-01'
		]);
	});
});
