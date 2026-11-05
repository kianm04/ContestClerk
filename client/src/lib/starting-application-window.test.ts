import { describe, expect, it } from 'vitest';
import { startingApplicationWindow } from './starting-application-window';

/** The conference timezone most of these tests use. */
const AMSTERDAM = 'Europe/Amsterdam';

/** The moment the conference is created in most of these tests. */
const NOW = new Date('2026-09-28T10:00:00Z');

describe('startingApplicationWindow', () => {
	it('opens now and closes at 23:59 seven days before the first day', () => {
		const window = startingApplicationWindow('2026-11-10', AMSTERDAM, NOW);

		// 3 November is after the clocks go back, so Amsterdam is one hour ahead of UTC.
		expect(window).toEqual({
			opensAt: '2026-09-28T10:00:00.000Z',
			closesAt: '2026-11-03T22:59:00.000Z'
		});
	});

	it('closes at 23:59 on the conference’s own clock, whatever its timezone', () => {
		const window = startingApplicationWindow('2026-11-10', 'America/New_York', NOW);

		// New York is five hours behind UTC in November, so 23:59 there is the next day in UTC.
		expect(window.closesAt).toBe('2026-11-04T04:59:00.000Z');
	});

	it('closes the day before the first day when seven days before has passed', () => {
		const window = startingApplicationWindow('2026-10-02', AMSTERDAM, NOW);

		// 1 October is still summer time, so Amsterdam is two hours ahead of UTC.
		expect(window).toEqual({
			opensAt: '2026-09-28T10:00:00.000Z',
			closesAt: '2026-10-01T21:59:00.000Z'
		});
	});

	it('falls back to the day before when seven days before closes at this very moment', () => {
		const exactlyAtClosing = new Date('2026-11-03T22:59:00.000Z');

		const window = startingApplicationWindow('2026-11-10', AMSTERDAM, exactlyAtClosing);

		expect(window.closesAt).toBe('2026-11-09T22:59:00.000Z');
	});

	it('sets no window at all when the day before the first day has passed too', () => {
		const window = startingApplicationWindow('2026-09-28', AMSTERDAM, NOW);

		expect(window).toEqual({ opensAt: null, closesAt: null });
	});

	it('sets no window for a conference that began long ago', () => {
		const window = startingApplicationWindow('2020-05-03', AMSTERDAM, NOW);

		expect(window).toEqual({ opensAt: null, closesAt: null });
	});

	it('sets no window when the first day is not a day at all', () => {
		const window = startingApplicationWindow('', AMSTERDAM, NOW);

		expect(window).toEqual({ opensAt: null, closesAt: null });
	});
});
