import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import type { PaperSource } from '$lib/committee-papers';
import BasedOnList from './BasedOnList.svelte';

const SOURCES: PaperSource[] = [
	{
		id: 'working-paper-1',
		kind: 'working_paper',
		topicNumber: 1,
		sequence: 1,
		title: 'Meaningful human control'
	},
	{
		id: 'working-paper-2',
		kind: 'working_paper',
		topicNumber: 1,
		sequence: 2,
		title: 'Export controls'
	}
];

function hrefFor(sourceId: string): ResolvedPathname {
	return `/resolutions/draft-1?source=${sourceId}` as ResolvedPathname;
}

describe('BasedOnList', () => {
	it('links each working paper by its number, marking the one open', () => {
		render(BasedOnList, { sources: SOURCES, selectedId: 'working-paper-2', hrefFor });

		expect(screen.getByRole('heading', { name: 'Based on' })).toBeTruthy();
		const first = screen.getByRole('link', { name: 'Working paper 1.1' });
		const second = screen.getByRole('link', { name: 'Working paper 1.2' });
		expect(first.getAttribute('href')).toBe('/resolutions/draft-1?source=working-paper-1');
		expect(first.getAttribute('aria-current')).toBeNull();
		expect(second.getAttribute('aria-current')).toBe('true');
	});

	it('marks none while none is open', () => {
		render(BasedOnList, { sources: SOURCES, selectedId: null, hrefFor });

		for (const link of screen.getAllByRole('link')) {
			expect(link.getAttribute('aria-current')).toBeNull();
		}
	});
});
