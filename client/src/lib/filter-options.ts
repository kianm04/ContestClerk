/**
 * Choices for the dropdowns of the management pages' filter rows
 * (`$lib/components/manage/FilterSelect.svelte`) that more than one page offers.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { COUNTRY_CODES, toCountryOptions } from '$lib/countries';

/** One choice in a filter dropdown: the value is sent, the label is read. */
export type FilterOption = {
	value: string;
	label: string;
};

/**
 * Every country, sorted by name, as filter choices whose value is the
 * two-letter code. `CountrySelect` builds the same list for a form field; a
 * filter row needs it in `FilterSelect`'s shape instead.
 */
export function countryFilterOptions(): FilterOption[] {
	const countries = toCountryOptions(COUNTRY_CODES);

	return countries.map((country) => ({ value: country.code, label: country.name }));
}
