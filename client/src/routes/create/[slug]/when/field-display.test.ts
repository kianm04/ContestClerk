import { describe, expect, it } from 'vitest';
import { bothClocks, longDate, longDateRange, timeOptions } from './field-display';

describe('longDate', () => {
	it('spells the month out', () => {
		expect(longDate('2027-04-16')).toBe('16 April 2027');
	});

	it('is empty for an empty or broken field', () => {
		expect(longDate('')).toBe('');
		expect(longDate('2027-02-31x')).toBe('');
	});
});

describe('longDateRange', () => {
	it('writes the month and year once inside one month', () => {
		expect(longDateRange('2027-04-16', '2027-04-18')).toBe('16 – 18 April 2027');
	});

	it('writes both months across a month', () => {
		expect(longDateRange('2027-04-30', '2027-05-02')).toBe('30 April – 2 May 2027');
	});

	it('writes both days in full across a new year', () => {
		expect(longDateRange('2026-12-30', '2027-01-02')).toBe('30 December 2026 – 2 January 2027');
	});

	it('is one day for a one-day conference', () => {
		expect(longDateRange('2027-04-16', '2027-04-16')).toBe('16 April 2027');
	});
});

describe('bothClocks', () => {
	it('gives the 24-hour clock and the 12-hour one', () => {
		expect(bothClocks('10:00')).toBe('10:00 (10:00 AM)');
		expect(bothClocks('17:00')).toBe('17:00 (5:00 PM)');
		expect(bothClocks('00:30')).toBe('00:30 (12:30 AM)');
		expect(bothClocks('12:15')).toBe('12:15 (12:15 PM)');
	});

	it('is empty for an empty field', () => {
		expect(bothClocks('')).toBe('');
	});
});

describe('timeOptions', () => {
	it('offers every quarter of an hour, written both ways', () => {
		const options = timeOptions('');
		expect(options).toHaveLength(96);
		expect(options[40]).toEqual({ value: '10:00', label: '10:00 (10:00 AM)' });
	});

	it('keeps a saved time that falls between them, in its place', () => {
		const values = timeOptions('10:10').map((option) => option.value);
		expect(values.slice(40, 43)).toEqual(['10:00', '10:10', '10:15']);
	});
});
