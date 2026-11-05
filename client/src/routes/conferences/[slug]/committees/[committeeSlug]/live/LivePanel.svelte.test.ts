import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import LivePanel from './LivePanel.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>China</p>' }));

describe('LivePanel', () => {
	it('is a region named by its title, holding what it is given', () => {
		render(LivePanel, { props: { title: 'Speakers’ list', children } });

		const panel = screen.getByRole('region', { name: 'Speakers’ list' });
		expect(panel.textContent).toContain('China');
	});

	it('has no heading without a title', () => {
		render(LivePanel, { props: { children } });

		expect(screen.queryByRole('heading')).toBeNull();
		expect(screen.getByText('China')).toBeTruthy();
	});
});
