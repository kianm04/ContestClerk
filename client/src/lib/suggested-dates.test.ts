import { describe, expect, it } from 'vitest';
import { describeDateSpan, suggestNextEditionDates } from './suggested-dates';

describe('suggestNextEditionDates', () => {
	it('keeps the weekday, the week of the month and the length a year on', () => {
		// 17 April 2026 is the third Friday of April; 16 April 2027 is too.
		expect(suggestNextEditionDates('2026-04-17', '2026-04-19')).toEqual({
			startDate: '2027-04-16',
			endDate: '2027-04-18'
		});
	});

	it('keeps a one-day conference one day', () => {
		// 7 March 2026 is the first Saturday of March; 6 March 2027 is too.
		expect(suggestNextEditionDates('2026-03-07', '2026-03-07')).toEqual({
			startDate: '2027-03-06',
			endDate: '2027-03-06'
		});
	});

	it('falls back a week when next year has no fifth such weekday', () => {
		// 31 January 2026 is a fifth Saturday; January 2027 has only five Saturdays
		// up to the 30th, so the fifth is the 30th.
		expect(suggestNextEditionDates('2026-01-31', '2026-02-01')?.startDate).toBe('2027-01-30');
		// 29 May 2027 is the fifth Saturday of May 2027; May 2028 has only four, so
		// the suggestion falls back to the fourth.
		expect(suggestNextEditionDates('2027-05-29', '2027-05-30')?.startDate).toBe('2028-05-27');
	});

	it('refuses dates that are not dates, or an end before its start', () => {
		expect(suggestNextEditionDates('', '')).toBeNull();
		expect(suggestNextEditionDates('2026-04-19', '2026-04-17')).toBeNull();
	});
});

describe('describeDateSpan', () => {
	it('names the weekdays and counts the days', () => {
		expect(describeDateSpan('2027-04-16', '2027-04-18')).toBe('Fri – Sun (3 days)');
		expect(describeDateSpan('2027-04-16', '2027-04-16')).toBe('Fri (1 day)');
		expect(describeDateSpan('', '2027-04-16')).toBe('');
	});
});
