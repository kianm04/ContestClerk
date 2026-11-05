import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import CommitteeResolutions from './CommitteeResolutions.svelte';

const RESOLUTION = {
	id: 'paper-1',
	name: 'Resolution 1.1',
	title: 'Human control over autonomous weapons',
	href: '/conferences/thimun-2027/committees/disec/resolutions/paper-1/print' as ResolvedPathname
};

describe('CommitteeResolutions', () => {
	it('links each adopted paper to its record copy, under the committee’s word for them', () => {
		render(CommitteeResolutions, { props: { title: 'Resolutions', resolutions: [RESOLUTION] } });

		const link = screen.getByRole('link', { name: 'Resolution 1.1' });

		expect(screen.getByRole('heading', { name: 'Resolutions' })).toBeTruthy();
		expect(link.getAttribute('href')).toBe(RESOLUTION.href);
		expect(screen.getByText('Human control over autonomous weapons')).toBeTruthy();
	});

	it('draws nothing until the committee has adopted something', () => {
		render(CommitteeResolutions, { props: { title: 'Resolutions', resolutions: [] } });

		expect(screen.queryByRole('heading', { name: 'Resolutions' })).toBeNull();
	});
});
