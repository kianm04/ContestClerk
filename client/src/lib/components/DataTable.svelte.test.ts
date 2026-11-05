import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import type { ResolvedPathname } from '$app/types';
import DataTable from './DataTable.svelte';

const columns = [
	{ key: 'name', label: 'Name', isSortable: true },
	{ key: 'country', label: 'Country' }
];

const children = createRawSnippet(() => ({
	render: () => '<tr><td>Mariam</td><td>France</td></tr>'
}));

/** Stands in for a helper from `$lib/urls.ts`, which is what a real page passes. */
function hrefForSort(key: string): ResolvedPathname {
	return `/manage/thimun-2027/applications?sort=${key}` as ResolvedPathname;
}

describe('DataTable', () => {
	it('draws a heading for every column', () => {
		render(DataTable, { props: { columns, children } });

		expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'Country' })).toBeTruthy();
	});

	it('sits in a white card with rounded corners, the way every other list does', () => {
		const { container } = render(DataTable, { props: { columns, children } });

		const wrapper = container.querySelector('table')?.parentElement;
		expect(wrapper?.className).toContain('rounded-2xl');
		expect(wrapper?.className).toContain('border-border');
		expect(wrapper?.className).toContain('bg-background');
		// A table wider than the screen scrolls inside the card, not the page.
		expect(wrapper?.className).toContain('overflow-x-auto');
	});

	it('shows the rows the page wrote', () => {
		render(DataTable, { props: { columns, children } });

		expect(screen.getByText('Mariam')).toBeTruthy();
	});

	it('makes a sortable heading a real link, so sorting works without JavaScript', () => {
		render(DataTable, { props: { columns, children, hrefForSort } });

		expect(screen.getByRole('link', { name: 'Name' }).getAttribute('href')).toBe(
			'/manage/thimun-2027/applications?sort=name'
		);
	});

	it('leaves a column that cannot be sorted as plain words', () => {
		render(DataTable, { props: { columns, children, hrefForSort } });

		expect(screen.queryByRole('link', { name: 'Country' })).toBeNull();
	});

	it('tells a screen reader which column the rows are sorted by, and which way', () => {
		render(DataTable, {
			props: { columns, children, hrefForSort, sort: { key: 'name', direction: 'asc' } }
		});

		expect(screen.getByRole('columnheader', { name: /Name/ }).getAttribute('aria-sort')).toBe(
			'ascending'
		);
		expect(
			screen.getByRole('columnheader', { name: 'Country' }).getAttribute('aria-sort')
		).toBeNull();
	});

	it('points the arrow the other way when the sort is reversed', () => {
		render(DataTable, {
			props: { columns, children, hrefForSort, sort: { key: 'name', direction: 'desc' } }
		});

		expect(screen.getByRole('link', { name: /Name/ }).textContent).toContain('↓');
	});
});
