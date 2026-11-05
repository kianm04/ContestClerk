import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import FilterBar from './FilterBar.svelte';

const children = createRawSnippet(() => ({
	render: () => '<label>Country<select></select></label>'
}));

describe('FilterBar', () => {
	it('shows the controls it was given', () => {
		render(FilterBar, { props: { children } });

		expect(screen.getByLabelText('Country')).toBeTruthy();
	});

	it('offers a reset link back to the unfiltered list', () => {
		render(FilterBar, { props: { children, resetHref: '/conferences' } });

		expect(screen.getByRole('link', { name: 'Reset' }).getAttribute('href')).toBe('/conferences');
	});

	it('offers no reset link when the page did not say where it goes', () => {
		render(FilterBar, { props: { children } });

		expect(screen.queryByRole('link', { name: 'Reset' })).toBeNull();
	});
});
