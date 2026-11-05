import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES } from '$lib/countries';
import { countryCodesInRegions, isConferenceRegion, REGION_OPTIONS } from '$lib/regions';

/** All six regions. */
const EVERY_REGION = REGION_OPTIONS.map((option) => option.value);

describe('countryCodesInRegions', () => {
	it('puts every country but Antarctica in exactly one region', () => {
		const regionCountries = countryCodesInRegions(EVERY_REGION);
		const withoutAntarctica = COUNTRY_CODES.filter((code) => code !== 'AQ');

		// Sorted, so a country listed twice or left out shows up as a difference.
		expect([...regionCountries].sort()).toEqual([...withoutAntarctica].sort());
	});

	it('follows the United Nations grouping, with the Caribbean in North America', () => {
		expect(countryCodesInRegions(['europe'])).toContain('NL');
		expect(countryCodesInRegions(['north_america'])).toEqual(
			expect.arrayContaining(['US', 'CA', 'MX', 'CU'])
		);
		expect(countryCodesInRegions(['asia'])).toEqual(expect.arrayContaining(['JP', 'AE', 'TR']));
		expect(countryCodesInRegions(['oceania'])).toContain('AU');
	});

	it('joins the countries of several regions, and has none for no region', () => {
		const europeAndAfrica = countryCodesInRegions(['europe', 'africa']);

		expect(europeAndAfrica).toEqual(expect.arrayContaining(['DE', 'KE']));
		expect(europeAndAfrica).not.toContain('US');
		expect(countryCodesInRegions([])).toEqual([]);
	});
});

describe('isConferenceRegion', () => {
	it('knows the six regions and nothing else', () => {
		expect(isConferenceRegion('south_america')).toBe(true);
		expect(isConferenceRegion('Europe')).toBe(false);
		expect(isConferenceRegion('antarctica')).toBe(false);
	});
});
