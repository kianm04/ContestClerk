import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES } from './countries';
import { countryFilterOptions } from './filter-options';

describe('countryFilterOptions', () => {
	it('offers every country once, sent as its code and read as its name', () => {
		const options = countryFilterOptions();

		expect(options).toHaveLength(COUNTRY_CODES.length);
		expect(options).toContainEqual({ value: 'FR', label: 'France' });
	});

	it('sorts the countries by name, so a country is where a reader looks for it', () => {
		const labels = countryFilterOptions().map((option) => option.label);
		const sorted = [...labels].sort((first, second) => first.localeCompare(second));

		expect(labels).toEqual(sorted);
	});
});
