import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import type { MyQuickSession } from '$lib/my-quick-sessions';
import QuickSessionsSection from './QuickSessionsSection.svelte';

/**
 * `count` quick sessions, named by their place: the first with a session
 * running, the second with one that ended, the rest never run. The flag and
 * the line agree, as `toMyQuickSessions` keeps them.
 */
function quickSessions(count: number): MyQuickSession[] {
	const lines = ['Session 2 in progress', 'Last session 24 Oct 2026', 'No session yet'];

	return Array.from({ length: count }, (_, index) => ({
		committeeId: `committee-${index + 1}`,
		committeeName: `Practice ${index + 1}`,
		statusLine: lines[Math.min(index, lines.length - 1)],
		isInProgress: index === 0,
		href: `/conferences/quick-${index + 1}/committees/practice/chair` as MyQuickSession['href']
	}));
}

describe('QuickSessionsSection', () => {
	it('is a section called "Quick sessions" whose title link starts a new one', () => {
		render(QuickSessionsSection, { props: { rows: quickSessions(2), moreCount: 0 } });

		const section = screen.getByRole('region', { name: 'Quick sessions' });

		expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('Quick sessions');
		expect(
			within(section).getByRole('link', { name: 'New quick session' }).getAttribute('href')
		).toBe('/quick/new');
	});

	it('lists each quick session with its name, its line and a link into its chair room', () => {
		render(QuickSessionsSection, { props: { rows: quickSessions(2), moreCount: 0 } });

		const rows = screen.getAllByRole('listitem');

		expect(rows).toHaveLength(2);
		expect(within(rows[0]).getByText('Practice 1')).toBeTruthy();
		expect(within(rows[0]).getByText('Session 2 in progress')).toBeTruthy();
		expect(
			within(rows[0]).getByRole('link', { name: 'Open chair room' }).getAttribute('href')
		).toBe('/conferences/quick-1/committees/practice/chair');
		expect(within(rows[1]).getByText('Last session 24 Oct 2026')).toBeTruthy();
		expect(screen.getAllByRole('link', { name: 'Open chair room' })).toHaveLength(2);
	});

	it('marks the one with a session running "In progress" in light blue, and no other', () => {
		render(QuickSessionsSection, { props: { rows: quickSessions(3), moreCount: 0 } });

		const words = screen.getAllByText('In progress');
		const [running, ended, neverRun] = screen.getAllByRole('listitem');

		expect(words).toHaveLength(1);
		expect(words[0].querySelector('[aria-hidden="true"]')?.className).toContain('bg-ring');
		expect(within(running).getByText('In progress')).toBeTruthy();
		expect(within(ended).queryByText('In progress')).toBeNull();
		expect(within(neverRun).queryByText('In progress')).toBeNull();
	});

	it('gives the chair room link a 44px target and the underline every row verb has under the pointer', () => {
		render(QuickSessionsSection, { props: { rows: quickSessions(1), moreCount: 0 } });

		const link = screen.getByRole('link', { name: 'Open chair room' });

		expect(link.className).toContain('min-h-11');
		expect(link.className).toContain('hover:underline');
	});

	it('draws no "Show all" when every quick session is on the page', () => {
		render(QuickSessionsSection, { props: { rows: quickSessions(3), moreCount: 0 } });

		expect(screen.queryByRole('link', { name: /Show all/ })).toBeNull();
	});

	it('offers "Show all {n}" with the whole number when the limit left some out', () => {
		render(QuickSessionsSection, { props: { rows: quickSessions(3), moreCount: 2 } });

		const showAll = screen.getByRole('link', { name: 'Show all 5' });

		expect(showAll.getAttribute('href')).toBe('/home?all=quick');
		// The rows themselves are still the three handed in.
		expect(screen.getAllByRole('listitem')).toHaveLength(3);
	});
});
