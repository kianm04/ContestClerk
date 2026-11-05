import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import type { ResolvedPathname } from '$app/types';
import ManageSection from './ManageSection.svelte';

/*
	`createRawSnippet` builds the markup a page would write between
	`<ManageSection>` and `</ManageSection>`, so the test can hand the component
	its `children` prop. It is the only way to pass a snippet from plain TypeScript.
*/
const children = createRawSnippet(() => ({ render: () => '<ul><li>One row</li></ul>' }));

const ALL_APPLICATIONS = '/manage/model-un/applications' as ResolvedPathname;

describe('ManageSection', () => {
	it('is a region named after its title, with the title as its heading and the rows under it', () => {
		render(ManageSection, { props: { title: 'Waiting for a decision', children } });

		const section = screen.getByRole('region', { name: 'Waiting for a decision' });

		expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe(
			'Waiting for a decision'
		);
		expect(within(section).getByText('One row')).toBeTruthy();
	});

	it('draws the link beside the title, a 44px target on a phone', () => {
		render(ManageSection, {
			props: {
				title: 'Waiting for a decision',
				link: { label: 'All applications', href: ALL_APPLICATIONS },
				children
			}
		});

		const link = screen.getByRole('link', { name: 'All applications' });

		expect(link.getAttribute('href')).toBe(ALL_APPLICATIONS);
		// 44px tall below `sm`, the height of its words from `sm` up: the heading row never grows.
		expect(link.className).toContain('min-h-11');
		expect(link.className).toContain('sm:min-h-0');
	});

	it('draws no link when given none', () => {
		render(ManageSection, { props: { title: 'Needs you', children } });

		expect(screen.queryByRole('link')).toBeNull();
	});
});
