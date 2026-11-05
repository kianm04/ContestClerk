import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import Pagination from './Pagination.svelte';

/** Stands in for a helper from `$lib/urls.ts`, which is what a real page passes. */
function hrefForPage(page: number): ResolvedPathname {
	return `/conferences?page=${page}` as ResolvedPathname;
}

describe('Pagination', () => {
	it('shows nothing when everything fits on one page', () => {
		const { container } = render(Pagination, { props: { page: 1, pageCount: 1, hrefForPage } });

		expect(container.querySelector('nav')).toBeNull();
	});

	it('says which page of how many is on screen', () => {
		render(Pagination, { props: { page: 2, pageCount: 5, hrefForPage } });

		expect(screen.getByText('Page 2 of 5')).toBeTruthy();
	});

	it('links to the page before and the page after', () => {
		render(Pagination, { props: { page: 2, pageCount: 5, hrefForPage } });

		expect(screen.getByRole('link', { name: '← Previous' }).getAttribute('href')).toBe(
			'/conferences?page=1'
		);
		expect(screen.getByRole('link', { name: 'Next →' }).getAttribute('href')).toBe(
			'/conferences?page=3'
		);
	});

	it('offers no "Previous" on the first page', () => {
		render(Pagination, { props: { page: 1, pageCount: 5, hrefForPage } });

		expect(screen.queryByRole('link', { name: '← Previous' })).toBeNull();
	});

	it('offers no "Next" on the last page', () => {
		render(Pagination, { props: { page: 5, pageCount: 5, hrefForPage } });

		expect(screen.queryByRole('link', { name: 'Next →' })).toBeNull();
	});
});
