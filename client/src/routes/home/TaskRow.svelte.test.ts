import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { HomeTask } from '$lib/tasks';
import { chairPapersUrl, positionPaperUrl } from '$lib/urls';
import TaskRow from './TaskRow.svelte';

/** The moment every row is drawn at: midday on 10 January 2027, in Amsterdam. */
const NOW = new Date('2027-01-10T12:00:00Z');

const paperTask: HomeTask = {
	id: 'position_paper:seat-1',
	kind: 'position_paper',
	conferenceId: 'conference-1',
	title: 'Submit position paper (UNSC)',
	detail: 'Riverside MUN 2027 · Morocco',
	actionLabel: 'Write paper',
	deadline: { day: '2027-01-15', timezone: 'Europe/Amsterdam' },
	href: positionPaperUrl('riverside-mun-2027', 'unsc')
};

const reviewTask: HomeTask = {
	id: 'review_papers:committee-1',
	kind: 'review_papers',
	conferenceId: 'conference-2',
	title: 'Review 3 position papers (DISEC)',
	detail: 'The Hague International MUN Junior',
	actionLabel: 'Review papers',
	deadline: null,
	href: chairPapersUrl('thimun-junior-2026', 'disec')
};

/** The coloured dot `StatusDot` draws before a word, or `null` when there is none. */
function statusDot(container: HTMLElement): Element | null {
	return container.querySelector('.rounded-full');
}

describe('TaskRow', () => {
	it('names the task and says what it is about', () => {
		render(TaskRow, { props: { task: paperTask, now: NOW } });

		expect(screen.getByText('Submit position paper (UNSC)')).toBeTruthy();
		expect(screen.getByText('Riverside MUN 2027 · Morocco')).toBeTruthy();
	});

	it('says when it is due, with an amber dot while it is soon', () => {
		const { container } = render(TaskRow, { props: { task: paperTask, now: NOW } });

		expect(screen.getByText('In 5 days')).toBeTruthy();
		expect(statusDot(container)?.className).toContain('bg-warning');
	});

	it('says "Overdue" with a red dot once the day has passed', () => {
		const { container } = render(TaskRow, {
			props: {
				task: { ...paperTask, deadline: { day: '2027-01-05', timezone: 'Europe/Amsterdam' } },
				now: NOW
			}
		});

		expect(screen.getByText('Overdue')).toBeTruthy();
		expect(statusDot(container)?.className).toContain('bg-destructive');
	});

	it('writes a far-off deadline as a date, with no dot', () => {
		const { container } = render(TaskRow, {
			props: {
				task: { ...paperTask, deadline: { day: '2027-07-25', timezone: 'Europe/Amsterdam' } },
				now: NOW
			}
		});

		expect(screen.getByText('By 25 Jul 2027')).toBeTruthy();
		expect(statusDot(container)).toBeNull();
	});

	it('says nothing about when for a task with no deadline', () => {
		const { container } = render(TaskRow, { props: { task: reviewTask, now: NOW } });

		// The right-hand slot holds the verb and nothing else.
		expect(screen.getByRole('link').parentElement?.textContent?.trim()).toBe('Review papers');
		expect(statusDot(container)).toBeNull();
	});

	it("links the task's verb to where it is done", () => {
		render(TaskRow, { props: { task: paperTask, now: NOW } });

		const link = screen.getByRole('link', { name: 'Write paper' });

		expect(link.getAttribute('href')).toBe(paperTask.href);
		expect(link.className).toContain('min-h-11');
	});

	it('has no tick box, no icon and no button', () => {
		const { container } = render(TaskRow, { props: { task: paperTask, now: NOW } });

		expect(container.querySelector('input, svg, button')).toBeNull();
	});

	it('leaves the second line out when the task has none', () => {
		const { container } = render(TaskRow, {
			props: { task: { ...reviewTask, detail: null }, now: NOW }
		});

		expect(container.querySelectorAll('p')).toHaveLength(1);
	});

	it('leaves the verb out when the task has nowhere to go', () => {
		render(TaskRow, { props: { task: { ...reviewTask, href: undefined }, now: NOW } });

		expect(screen.queryByRole('link')).toBeNull();
		expect(screen.queryByText('Review papers')).toBeNull();
	});
});
