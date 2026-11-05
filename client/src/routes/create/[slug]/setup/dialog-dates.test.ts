import { describe, expect, it } from 'vitest';
import { formatPickedDay, openingTimes } from './dialog-dates';

describe('formatPickedDay', () => {
	it('names the day in British order', () => {
		expect(formatPickedDay('2027-04-02')).toBe('2 April 2027');
	});

	it('shows nothing for an empty or broken day', () => {
		expect(formatPickedDay('')).toBe('');
		expect(formatPickedDay('2 April')).toBe('');
	});
});

describe('openingTimes', () => {
	it('lists every half hour of the day', () => {
		const times = openingTimes('');
		expect(times).toHaveLength(48);
		expect(times[0]).toEqual({ value: '00:00', label: '00:00' });
		expect(times[19].value).toBe('09:30');
	});

	it('keeps a saved time between the half hours', () => {
		const values = openingTimes('09:15').map((time) => time.value);
		expect(values).toHaveLength(49);
		expect(values.indexOf('09:15')).toBe(values.indexOf('09:00') + 1);
	});
});
