import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import ShowAllLink from './ShowAllLink.svelte';

/** The home page asked for every "Also coming up" row. */
const FULL_LIST_ADDRESS = '/home?all=conferences' as ResolvedPathname;

describe('ShowAllLink', () => {
	it('names the whole number of rows and leads to the full list', () => {
		render(ShowAllLink, { props: { count: 11, href: FULL_LIST_ADDRESS } });

		const link = screen.getByRole('link', { name: 'Show all 11' });

		expect(link.getAttribute('href')).toBe(FULL_LIST_ADDRESS);
	});

	it('is tall enough to press on a phone', () => {
		render(ShowAllLink, { props: { count: 5, href: FULL_LIST_ADDRESS } });

		expect(screen.getByRole('link').className).toContain('min-h-11');
	});
});
