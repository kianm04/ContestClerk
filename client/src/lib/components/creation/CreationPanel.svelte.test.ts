import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Sparkles from '@lucide/svelte/icons/sparkles';
import CreationPanel from './CreationPanel.svelte';

// A snippet built in plain TypeScript, standing in for the markup a page would
// write between the panel's tags.
const body = createRawSnippet(() => ({ render: () => '<p>The body</p>' }));

describe('CreationPanel', () => {
	it('draws the title and the body under it, at the large size by default', () => {
		const { container } = render(CreationPanel, {
			props: { title: 'Ready to launch', icon: Sparkles, children: body }
		});

		expect(screen.getByRole('heading', { name: 'Ready to launch' })).toBeTruthy();
		expect(screen.getByText('The body')).toBeTruthy();
		// The first three steps' panel: 18 design pixels above the title row.
		expect(container.querySelector('section')?.classList.contains('pt-4.5')).toBe(true);
	});

	it('draws only the header when there is no body', () => {
		const { container } = render(CreationPanel, {
			props: { title: 'Optional before launch', icon: Sparkles }
		});

		// The section holds the header row and nothing under it.
		expect(container.querySelector('section')?.children).toHaveLength(1);
	});

	it('is roomier at the small size, and a padding passed in replaces its own', () => {
		const { container } = render(CreationPanel, {
			props: {
				title: 'Committees',
				icon: Sparkles,
				children: body,
				size: 'small',
				class: 'pb-0.25'
			}
		});

		const section = container.querySelector('section');
		expect(section?.classList.contains('pt-3')).toBe(true);
		expect(section?.classList.contains('pt-4.5')).toBe(false);
		expect(section?.classList.contains('pb-0.25')).toBe(true);
		expect(section?.classList.contains('pb-4')).toBe(false);
	});
});
