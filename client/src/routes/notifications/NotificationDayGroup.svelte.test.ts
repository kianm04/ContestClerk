import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import NotificationDayGroup from './NotificationDayGroup.svelte';
import type { Notification, NotificationDay } from '$lib/notifications';

/** The moment every test pretends the page was built at. */
const NOW = new Date('2026-02-12T12:00:00Z');

/** A notification with everything filled in, so each test changes one thing. */
function makeNotification(overrides: Partial<Notification> = {}): Notification {
	return {
		id: 'a0000000-0000-4000-8000-000000000001',
		kind: 'announcement',
		title: 'New announcement: Dress code',
		body: null,
		linkPath: '/conferences',
		readAt: null,
		createdAt: '2026-02-12T10:00:00Z',
		conferenceName: null,
		...overrides
	};
}

/** Today's group, with one unread and one read row. */
const TODAY: NotificationDay = {
	day: '2026-02-12',
	label: 'Today',
	notifications: [
		makeNotification(),
		makeNotification({
			id: 'a0000000-0000-4000-8000-000000000002',
			title: 'Invoice DELFTMUN-2026-0031 is ready',
			readAt: '2026-02-12T11:00:00Z'
		})
	]
};

describe('NotificationDayGroup', () => {
	it('names the day in a heading above its rows', () => {
		render(NotificationDayGroup, { props: { day: TODAY, now: NOW } });

		const section = screen.getByRole('region', { name: 'Today' });

		expect(within(section).getByRole('heading', { name: 'Today' })).toBeTruthy();
	});

	it('lists every row of the day, in order', () => {
		render(NotificationDayGroup, { props: { day: TODAY, now: NOW } });

		const rows = screen.getAllByRole('listitem');

		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain('New announcement: Dress code');
		expect(rows[1].textContent).toContain('Invoice DELFTMUN-2026-0031 is ready');
	});

	it('draws the rows as one card with a rule between each row and the next', () => {
		render(NotificationDayGroup, { props: { day: TODAY, now: NOW } });

		const list = screen.getByRole('list');

		expect(list.classList.contains('divide-y')).toBe(true);
		expect(list.classList.contains('rounded-2xl')).toBe(true);
		expect(list.classList.contains('border')).toBe(true);
		expect(list.classList.contains('overflow-hidden')).toBe(true);
		expect(list.className).not.toContain('gap-');
	});
});
