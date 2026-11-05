import { describe, expect, it } from 'vitest';
import { calendarDay, calendarOpeningDay, calendarRange } from './calendar-range';

describe('calendarDay', () => {
	it('reads a day, and nothing from an empty or impossible one', () => {
		expect(calendarDay('2027-04-16')?.toString()).toBe('2027-04-16');
		expect(calendarDay('')).toBeUndefined();
		expect(calendarDay('16/04/2027')).toBeUndefined();
		expect(calendarDay('2027-02-31')).toBeUndefined();
	});
});

describe('calendarRange', () => {
	it('is half empty while half picked', () => {
		const range = calendarRange('2027-04-16', '');

		expect(range.start?.toString()).toBe('2027-04-16');
		expect(range.end).toBeUndefined();
	});
});

describe('calendarOpeningDay', () => {
	it('opens on the first day, else the suggestion, else today', () => {
		expect(calendarOpeningDay('2027-05-07', '2027-04-16', '2026-10-04').toString()).toBe(
			'2027-05-07'
		);
		expect(calendarOpeningDay('', '2027-04-16', '2026-10-04').toString()).toBe('2027-04-16');
		expect(calendarOpeningDay('', null, '2026-10-04').toString()).toBe('2026-10-04');
	});
});
