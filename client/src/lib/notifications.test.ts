import { describe, expect, it } from 'vitest';
import { groupNotificationsByDay, notificationPageCount, type Notification } from './notifications';

/** A notification with everything filled in, so each test changes one thing. */
function makeNotification(overrides: Partial<Notification> = {}): Notification {
	return {
		id: 'a0000000-0000-4000-8000-000000000001',
		kind: 'application_decided',
		title: 'Your application to Riverside MUN 2027 was accepted',
		body: null,
		linkPath: '/applications/1',
		readAt: null,
		createdAt: '2026-02-12T09:00:00Z',
		conferenceName: 'Riverside MUN 2027',
		...overrides
	};
}

describe('groupNotificationsByDay', () => {
	const now = new Date('2026-02-12T12:00:00Z');

	it('puts the notifications of one day under one heading', () => {
		const days = groupNotificationsByDay(
			[
				makeNotification({ id: '1', createdAt: '2026-02-12T09:00:00Z' }),
				makeNotification({ id: '2', createdAt: '2026-02-12T08:00:00Z' }),
				makeNotification({ id: '3', createdAt: '2026-02-11T22:00:00Z' })
			],
			now
		);

		expect(days.map((day) => day.label)).toEqual(['Today', 'Yesterday']);
		expect(days[0].notifications.map((one) => one.id)).toEqual(['1', '2']);
		expect(days[1].notifications.map((one) => one.id)).toEqual(['3']);
	});

	it('writes the date out once a day has no name of its own', () => {
		const days = groupNotificationsByDay(
			[makeNotification({ createdAt: '2026-02-04T09:00:00Z' })],
			now
		);

		expect(days[0].label).toBe('4 Feb 2026');
		expect(days[0].day).toBe('2026-02-04');
	});

	it('gives back nothing for an empty list', () => {
		expect(groupNotificationsByDay([], now)).toEqual([]);
	});
});

describe('notificationPageCount', () => {
	it('counts thirty to a page', () => {
		expect(notificationPageCount(30)).toBe(1);
		expect(notificationPageCount(31)).toBe(2);
		expect(notificationPageCount(90)).toBe(3);
	});

	it('is one page when there is nothing at all, so the pager has a number to show', () => {
		expect(notificationPageCount(0)).toBe(1);
	});
});
