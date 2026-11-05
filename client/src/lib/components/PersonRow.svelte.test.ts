import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import PersonRow from './PersonRow.svelte';

describe('PersonRow', () => {
	it('shows the name and an avatar for it', () => {
		render(PersonRow, { props: { name: 'Daniel Perez' } });

		expect(screen.getByText('Daniel Perez')).toBeTruthy();
		expect(screen.getByRole('img', { name: 'Daniel Perez' })).toBeTruthy();
	});

	it('shows the subtitle when there is one', () => {
		render(PersonRow, { props: { name: 'Daniel Perez', subtitle: 'Rotterdam Grammar School' } });

		expect(screen.getByText('Rotterdam Grammar School')).toBeTruthy();
	});

	it('shows what the page put on the right of the row', () => {
		const children = createRawSnippet(() => ({ render: () => '<button>Remove</button>' }));

		render(PersonRow, { props: { name: 'Daniel Perez', children } });

		expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
	});
});
