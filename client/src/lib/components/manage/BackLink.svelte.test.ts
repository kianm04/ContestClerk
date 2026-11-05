import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import BackLink from './BackLink.svelte';

const LIST_ADDRESS = '/manage/model-un/applications' as ResolvedPathname;

describe('BackLink', () => {
	it('links back to the list by its name alone', () => {
		render(BackLink, { props: { href: LIST_ADDRESS, label: 'Applications' } });

		const link = screen.getByRole('link', { name: 'Applications' });

		expect(link.getAttribute('href')).toBe(LIST_ADDRESS);
	});

	it('hides its arrow from a screen reader, because the words already say it', () => {
		const { container } = render(BackLink, {
			props: { href: LIST_ADDRESS, label: 'Applications' }
		});

		expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	});
});
