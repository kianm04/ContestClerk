import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FilterSearch from './FilterSearch.svelte';

describe('FilterSearch', () => {
	it('has a label a screen reader can read, although none is drawn', () => {
		render(FilterSearch, {
			props: { name: 'q', value: '', placeholder: 'Name or school', label: 'Search applicants' }
		});

		const box = screen.getByLabelText('Search applicants');

		expect(box.getAttribute('name')).toBe('q');
		expect(box.getAttribute('placeholder')).toBe('Name or school');
	});

	it('shows the search the page is already on', () => {
		render(FilterSearch, {
			props: { name: 'q', value: 'Riverside', placeholder: 'Search', label: 'Search' }
		});

		expect(screen.getByLabelText('Search')).toHaveProperty('value', 'Riverside');
	});
});
