import { describe, expect, it } from 'vitest';
import { fallbackTimezone, timezoneForLocation } from './location-timezone';
import { isTimezone, listTimezones } from './timezones';

describe('timezoneForLocation', () => {
	it('knows a country with one clock', () => {
		expect(timezoneForLocation('Delft', 'NL')).toBe('Europe/Amsterdam');
		expect(timezoneForLocation('Paris', 'fr')).toBe('Europe/Paris');
		expect(timezoneForLocation('', 'GB')).toBe('Europe/London');
	});

	it('decides a country with several clocks by its city', () => {
		expect(timezoneForLocation('Los Angeles', 'US')).toBe('America/Los_Angeles');
		expect(timezoneForLocation('Chicago', 'US')).toBe('America/Chicago');
		expect(timezoneForLocation('Perth', 'AU')).toBe('Australia/Perth');
	});

	it('falls back to the most populous zone of a many-clock country', () => {
		expect(timezoneForLocation('Springfield', 'US')).toBe('America/New_York');
		expect(timezoneForLocation('', 'CA')).toBe('America/Toronto');
	});

	it('answers null for a country it knows nothing about', () => {
		expect(timezoneForLocation('Nuuk', 'GL')).toBeNull();
		expect(timezoneForLocation('Delft', '')).toBeNull();
	});

	it('only ever suggests a zone the dropdown offers', () => {
		const offered = new Set(listTimezones().flatMap((group) => group.timezones));

		for (const code of ['NL', 'US', 'AU', 'BR', 'JP', 'ZA', 'CA', 'MX', 'RU', 'IN']) {
			const zone = timezoneForLocation('', code);

			expect(zone).not.toBeNull();
			expect(offered.has(zone ?? '')).toBe(true);
		}
	});
});

describe('fallbackTimezone', () => {
	it('is a zone the dropdown offers', () => {
		expect(isTimezone(fallbackTimezone())).toBe(true);
	});
});
