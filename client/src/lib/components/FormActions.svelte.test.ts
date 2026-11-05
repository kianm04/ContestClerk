import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import FormActions from './FormActions.svelte';

const children = createRawSnippet(() => ({
	render: () => '<button type="submit">Save changes</button>'
}));

describe('FormActions', () => {
	it('shows the buttons it was given', () => {
		render(FormActions, { props: { children } });

		expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
	});

	it('sticks to the bottom of a phone screen and not of a desktop one', () => {
		const { container } = render(FormActions, { props: { children } });

		const row = container.querySelector('div');
		expect(row?.className).toContain('sticky');
		expect(row?.className).toContain('md:static');
	});
});
