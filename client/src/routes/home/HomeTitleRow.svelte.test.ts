import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createConferenceUrl } from '$lib/urls';
import HomeTitleRow from './HomeTitleRow.svelte';

const GREETING = 'Good evening, Sofia.';

describe('HomeTitleRow', () => {
	it('greets the reader in a paragraph, not a heading, leaving the h1 to the hero', () => {
		render(HomeTitleRow, { props: { greeting: GREETING, link: null } });

		expect(screen.getByText(GREETING).tagName).toBe('P');
		expect(screen.queryByRole('heading')).toBeNull();
	});

	it('draws the one text link at the right, where it was told to lead', () => {
		render(HomeTitleRow, {
			props: {
				greeting: GREETING,
				link: { label: 'Create a conference', href: createConferenceUrl() }
			}
		});

		const link = screen.getByRole('link', { name: 'Create a conference' });

		expect(link.getAttribute('href')).toBe(createConferenceUrl());
		// A text link in link blue, never the filled button: the page's button is in the hero.
		expect(link.className).toContain('text-link');
		expect(link.className).not.toContain('bg-primary');
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('draws no link at all when given none, as for an organiser', () => {
		render(HomeTitleRow, { props: { greeting: GREETING, link: null } });

		expect(screen.queryByRole('link')).toBeNull();
	});
});
