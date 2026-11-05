import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CountrySelect from './CountrySelect.svelte';

describe('CountrySelect', () => {
	it('is labelled "Country" unless the page says otherwise', () => {
		render(CountrySelect, { props: { name: 'countryCode', value: '' } });

		expect(screen.getByLabelText('Country')).toBeTruthy();
	});

	it('takes another label when a page needs one', () => {
		render(CountrySelect, { props: { label: 'Where you live', name: 'countryCode', value: '' } });

		expect(screen.getByLabelText('Where you live')).toBeTruthy();
	});

	it('brings the country list with it', () => {
		render(CountrySelect, { props: { name: 'countryCode', value: '' } });

		expect(screen.getByRole('option', { name: 'Netherlands' })).toHaveProperty('value', 'NL');
	});

	it('sorts the countries by name, so people can find theirs', () => {
		render(CountrySelect, { props: { name: 'countryCode', value: '' } });

		// The first option is the placeholder, so the second is the first country.
		const names = screen.getAllByRole('option').map((option) => option.textContent);
		expect(names[1]).toBe('Afghanistan');
	});

	it('shows the country already chosen', () => {
		render(CountrySelect, { props: { name: 'countryCode', value: 'NL' } });

		expect(screen.getByRole('option', { name: 'Netherlands' })).toHaveProperty('selected', true);
	});

	it('offers "Pick a country" as its empty choice unless the page says otherwise', () => {
		render(CountrySelect, { props: { name: 'countryCode', value: '' } });

		expect(screen.getByRole('option', { name: 'Pick a country' })).toHaveProperty('value', '');
	});

	it('takes another empty choice, such as a filter bar\'s "Any country"', () => {
		render(CountrySelect, { props: { name: 'country', value: '', placeholder: 'Any country' } });

		const anyCountry = screen.getByRole('option', { name: 'Any country' });
		expect(anyCountry).toHaveProperty('value', '');
		expect(anyCountry).toHaveProperty('selected', true);
		expect(screen.queryByRole('option', { name: 'Pick a country' })).toBeNull();
	});

	it('shows what is wrong with the choice', () => {
		render(CountrySelect, {
			props: { name: 'countryCode', value: '', error: 'Pick a country.' }
		});

		expect(screen.getByText('Pick a country.')).toBeTruthy();
	});
});
