import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Sidebar, { type SidebarGroup } from './Sidebar.svelte';

const groups: SidebarGroup[] = [
	{
		items: [{ label: 'Dashboard', href: '/manage', isActive: false }]
	},
	{
		heading: 'Set up',
		items: [
			{ label: 'Schedule', href: '/conferences', isActive: false },
			{ label: 'Team', href: '/create', isActive: true }
		]
	}
];

describe('Sidebar', () => {
	it('names the navigation after its title, so a screen reader can tell them apart', () => {
		render(Sidebar, { props: { groups, title: 'Manage' } });

		expect(screen.getByRole('navigation', { name: 'Manage' })).toBeTruthy();
	});

	it('shows one link per item, across every group', () => {
		render(Sidebar, { props: { groups, title: 'Manage' } });

		expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/manage');
		expect(screen.getByRole('link', { name: 'Schedule' }).getAttribute('href')).toBe(
			'/conferences'
		);
		expect(screen.getByRole('link', { name: 'Team' }).getAttribute('href')).toBe('/create');
	});

	it('puts a heading over a group that has one, and none over a group without', () => {
		render(Sidebar, { props: { groups, title: 'Manage' } });

		const headings = screen.getAllByRole('heading').map((heading) => heading.textContent);
		expect(headings).toEqual(['Set up']);
	});

	it('keeps the links in the order of their groups', () => {
		render(Sidebar, { props: { groups, title: 'Manage' } });

		const labels = screen.getAllByRole('link').map((link) => link.textContent?.trim());
		expect(labels).toEqual(['Dashboard', 'Schedule', 'Team']);
	});

	it('marks the active link as the current page and leaves the others alone', () => {
		render(Sidebar, { props: { groups, title: 'Manage' } });

		expect(screen.getByRole('link', { name: 'Team' }).getAttribute('aria-current')).toBe('page');
		expect(screen.getByRole('link', { name: 'Schedule' }).getAttribute('aria-current')).toBeNull();
	});

	it('draws the links as text only, with no icon beside them', () => {
		const { container } = render(Sidebar, { props: { groups, title: 'Manage' } });

		expect(container.querySelector('svg')).toBeNull();
	});

	it('draws every link as a row at least 44px tall', () => {
		render(Sidebar, { props: { groups, title: 'Manage' } });

		for (const link of screen.getAllByRole('link')) {
			expect(link.className).toContain('min-h-11');
		}
	});
});
