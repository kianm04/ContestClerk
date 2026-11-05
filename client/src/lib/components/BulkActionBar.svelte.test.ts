import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import BulkActionBar from './BulkActionBar.svelte';

const children = createRawSnippet(() => ({
	render: () => '<button type="submit">Accept</button>'
}));

describe('BulkActionBar', () => {
	/*
		The bar is drawn whether or not anything is ticked. Without JavaScript
		nothing can appear in answer to a tick, so a bar that waited for one would
		put every bulk action out of reach of a page whose JavaScript never ran.
	*/
	it('shows its actions even while nothing is ticked', () => {
		render(BulkActionBar, { props: { selectedCount: 0, children } });

		expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
	});

	it('says plainly that nothing is ticked yet', () => {
		render(BulkActionBar, { props: { selectedCount: 0, children } });

		expect(screen.getByText('No rows selected')).toBeTruthy();
	});

	it('counts the ticked rows out loud', () => {
		render(BulkActionBar, { props: { selectedCount: 3, children } });

		expect(screen.getByRole('status').textContent).toContain('3 rows selected');
	});

	it('counts one row in the singular', () => {
		render(BulkActionBar, { props: { selectedCount: 1, children } });

		expect(screen.getByText('1 row selected')).toBeTruthy();
	});

	it('shows the actions it was given', () => {
		render(BulkActionBar, { props: { selectedCount: 2, children } });

		expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
	});
});
