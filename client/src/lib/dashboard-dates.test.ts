import { describe, expect, it } from 'vitest';
import { countdownText, formatDayAndLongMonth, formatLongDay, noonOfDay } from './dashboard-dates';

describe('formatLongDay', () => {
	it('writes the weekday and the month in full, on the day of the timezone', () => {
		expect(formatLongDay('2026-10-25T12:00:00Z', 'Europe/London')).toBe('Sunday 25 October');
		// 23:30 UTC on 24 October is already the 25th in Amsterdam.
		expect(formatLongDay('2026-10-24T23:30:00Z', 'Europe/Amsterdam')).toBe('Sunday 25 October');
	});
});

describe('formatDayAndLongMonth', () => {
	it('writes the day and the month in full', () => {
		expect(formatDayAndLongMonth('2026-10-25T12:00:00Z', 'Europe/London')).toBe('25 October');
	});
});

describe('noonOfDay', () => {
	it('keeps a day the same day when read in UTC', () => {
		expect(formatLongDay(noonOfDay('2026-11-14'), 'UTC')).toBe('Saturday 14 November');
	});
});

describe('countdownText', () => {
	it('counts the days to go', () => {
		expect(countdownText(0)).toBe('later today');
		expect(countdownText(1)).toBe('tomorrow');
		expect(countdownText(12)).toBe('in 12 days');
	});
});
