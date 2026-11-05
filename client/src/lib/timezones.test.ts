import { describe, expect, it } from 'vitest';
import { isTimezone, listTimezones, timezoneOptions } from './timezones';

/** Every name in the list, flattened out of its groups. */
const everyTimezone = listTimezones().flatMap((group) => group.timezones);

describe('listTimezones', () => {
	it('groups the timezones by region', () => {
		const regions = listTimezones().map((group) => group.region);

		expect(regions).toContain('Europe');
		expect(regions).toContain('Americas');
		expect(regions).toContain('Asia');
	});

	it('offers UTC for a conference that belongs to no region', () => {
		expect(everyTimezone).toContain('UTC');
	});

	it('gives every group at least one timezone', () => {
		for (const group of listTimezones()) {
			expect(group.timezones.length).toBeGreaterThan(0);
		}
	});

	it('lists no timezone twice', () => {
		expect(new Set(everyTimezone).size).toBe(everyTimezone.length);
	});

	it('spells every name the way Intl does', () => {
		// A misspelled name would be saved happily and then throw the first time
		// a schedule tried to show a time in it, so every name is checked here.
		for (const timezone of everyTimezone) {
			expect(() => new Intl.DateTimeFormat('en-GB', { timeZone: timezone })).not.toThrow();
		}
	});

	it('sorts each group alphabetically', () => {
		for (const group of listTimezones()) {
			expect(group.timezones).toEqual([...group.timezones].sort());
		}
	});
});

describe('isTimezone', () => {
	it('accepts a timezone we offer', () => {
		expect(isTimezone('Europe/Amsterdam')).toBe(true);
		expect(isTimezone('UTC')).toBe(true);
	});

	it('refuses a real timezone that is not on the list', () => {
		expect(isTimezone('Antarctica/Troll')).toBe(false);
	});

	it('refuses anything that is not a timezone at all', () => {
		expect(isTimezone('')).toBe(false);
		expect(isTimezone('Amsterdam')).toBe(false);
	});
});

describe('timezoneOptions', () => {
	it('offers one option for every timezone on the list', () => {
		expect(timezoneOptions()).toHaveLength(everyTimezone.length);
	});

	it('sends the IANA name and shows that same name', () => {
		expect(timezoneOptions()).toContainEqual({ value: 'UTC', label: 'UTC' });
		expect(timezoneOptions()).toContainEqual({
			value: 'Europe/Amsterdam',
			label: 'Europe/Amsterdam'
		});
	});

	it('keeps the order of the groups, so UTC is the first option', () => {
		expect(timezoneOptions()[0]).toEqual({ value: 'UTC', label: 'UTC' });
	});

	it('offers nothing `isTimezone` would then refuse', () => {
		for (const option of timezoneOptions()) {
			expect(isTimezone(option.value)).toBe(true);
		}
	});
});
