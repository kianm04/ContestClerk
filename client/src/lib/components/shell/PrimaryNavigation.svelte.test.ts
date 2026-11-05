import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PrimaryNavigation from './PrimaryNavigation.svelte';
import type { NavigationLink } from '$lib/navigation';

const LINKS: NavigationLink[] = [
	{ label: 'Conferences', href: '/conferences' },
	{ label: 'Create', href: '/create' }
];

describe('PrimaryNavigation', () => {
	it('draws every link it is given', () => {
		render(PrimaryNavigation, {
			props: { links: LINKS, pathname: '/conferences', direction: 'row' }
		});

		expect(screen.getByRole('link', { name: 'Conferences' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Create' })).toBeTruthy();
	});

	it('marks the page the reader is on, for a screen reader as well as in colour', () => {
		render(PrimaryNavigation, {
			props: { links: LINKS, pathname: '/conferences', direction: 'row' }
		});

		const active = screen.getByRole('link', { name: 'Conferences' });

		expect(active.getAttribute('aria-current')).toBe('page');
		expect(active.className).toContain('border-ring');
		expect(active.className).toContain('text-primary');
	});

	it('leaves the other links alone', () => {
		render(PrimaryNavigation, {
			props: { links: LINKS, pathname: '/conferences', direction: 'row' }
		});

		const other = screen.getByRole('link', { name: 'Create' });

		expect(other.getAttribute('aria-current')).toBeNull();
		expect(other.className).toContain('border-transparent');
	});

	it('keeps the page underlined while reading something inside it', () => {
		render(PrimaryNavigation, {
			props: { links: LINKS, pathname: '/conferences/thimun-2027', direction: 'row' }
		});

		expect(screen.getByRole('link', { name: 'Conferences' }).getAttribute('aria-current')).toBe(
			'page'
		);
	});

	it('stacks the links when the slide-in menu asks for a column', () => {
		const { container } = render(PrimaryNavigation, {
			props: { links: LINKS, pathname: '/conferences', direction: 'column' }
		});

		expect(container.querySelector('ul')?.className).toContain('flex-col');
	});
});
