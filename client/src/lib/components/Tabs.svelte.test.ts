import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Tabs, { type Tab } from './Tabs.svelte';

const tabs: Tab[] = [
	{ label: 'All', href: '/conferences', isActive: true },
	{ label: 'Under review', href: '/conferences/thimun-2027', isActive: false }
];

describe('Tabs', () => {
	it('shows every tab as a real link', () => {
		render(Tabs, { props: { tabs } });

		expect(screen.getByRole('link', { name: 'All' }).getAttribute('href')).toBe('/conferences');
		expect(screen.getAllByRole('link')).toHaveLength(2);
	});

	it('marks the open tab as the current page', () => {
		render(Tabs, { props: { tabs } });

		expect(screen.getByRole('link', { name: 'All' }).getAttribute('aria-current')).toBe('page');
	});

	it('shows a count beside the label when the tab has one', () => {
		const withCount: Tab[] = [{ label: 'Waiting', href: '/create', isActive: false, count: 7 }];

		render(Tabs, { props: { tabs: withCount } });

		expect(screen.getByText('7')).toBeTruthy();
	});

	it('shows no count when the tab has none', () => {
		const { container } = render(Tabs, { props: { tabs } });

		expect(container.querySelectorAll('span')).toHaveLength(0);
	});
});
