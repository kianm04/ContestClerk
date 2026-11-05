import { describe, expect, it } from 'vitest';
import type { PressedForm } from '$lib/row-changes';
import type { Notification } from '$lib/notifications';
import { rowsAfterPresses } from '$lib/row-changes';
import {
	describeNotificationFailure,
	expectNotificationChanges,
	openedNotificationPath,
	unreadCountAfterPresses,
	type NotificationPress
} from './notification-preview';

/** A notification with everything filled in, so each test only changes what it needs to. */
function makeNotification(overrides: Partial<Notification> = {}): Notification {
	return {
		id: 'a0000000-0000-4000-8000-000000000001',
		kind: 'application_decided',
		title: 'Your application to Riverside MUN 2027 was accepted',
		body: null,
		linkPath: '/applications/1',
		readAt: null,
		createdAt: '2026-02-12T10:00:00Z',
		conferenceName: null,
		...overrides
	};
}

/** A press of `action` about `notificationId`, as `use:enhance` hands it over. */
function pressInput(action: string, notificationId = ''): PressedForm {
	const formData = new FormData();
	formData.set('notificationId', notificationId);

	return {
		action: new URL(`http://localhost/notifications${action}`),
		formData
	};
}

/** The press as the instant form keeps it, with its expectation. */
function keptPress(input: PressedForm, rows: Notification[]): NotificationPress {
	return {
		id: 1,
		formData: input.formData,
		action: input.action,
		expected: expectNotificationChanges(input, rows)
	};
}

describe('expectNotificationChanges', () => {
	it('marks the opened row read, and leaves the rest', () => {
		const opened = makeNotification({ id: 'row-1' });
		const untouched = makeNotification({ id: 'row-2' });
		const rows = [opened, untouched];

		const shown = rowsAfterPresses(rows, [keptPress(pressInput('?/open', 'row-1'), rows)]);

		expect(shown[0].readAt).not.toBeNull();
		expect(shown[1].readAt).toBeNull();
	});

	it('marks every unread row read for "Mark all as read"', () => {
		const unread = makeNotification({ id: 'row-1', readAt: null });
		const alreadyRead = makeNotification({ id: 'row-2', readAt: '2026-02-12T09:00:00Z' });
		const rows = [unread, alreadyRead];

		const shown = rowsAfterPresses(rows, [keptPress(pressInput('?/markAllRead'), rows)]);

		expect(shown[0].readAt).not.toBeNull();
		expect(shown[1].readAt).toBe('2026-02-12T09:00:00Z');
	});

	it('takes a removed row away', () => {
		const removed = makeNotification({ id: 'row-1' });
		const kept = makeNotification({ id: 'row-2' });
		const rows = [removed, kept];

		const shown = rowsAfterPresses(rows, [keptPress(pressInput('?/delete', 'row-1'), rows)]);

		expect(shown.map((row) => row.id)).toEqual(['row-2']);
	});
});

describe('describeNotificationFailure', () => {
	it('names what did not happen for each action', () => {
		const rows = [makeNotification()];

		expect(describeNotificationFailure(keptPress(pressInput('?/markAllRead'), rows))).toBe(
			'The notifications were not marked as read.'
		);
		expect(describeNotificationFailure(keptPress(pressInput('?/delete', 'x'), rows))).toBe(
			'The notification was not removed.'
		);
	});
});

describe('unreadCountAfterPresses', () => {
	it('takes an opened row off the count at once', () => {
		const opened = makeNotification({ id: 'row-1' });
		const untouched = makeNotification({ id: 'row-2' });
		const rows = [opened, untouched];

		const shown = rowsAfterPresses(rows, [keptPress(pressInput('?/open', 'row-1'), rows)]);

		// Twelve are unread in all, more than the bell lists.
		expect(unreadCountAfterPresses(12, rows, shown)).toBe(11);
	});

	it('does not count a row that was read already, or one taken away while read', () => {
		const alreadyRead = makeNotification({ id: 'row-1', readAt: '2026-02-12T09:00:00Z' });
		const rows = [alreadyRead];

		const opened = rowsAfterPresses(rows, [keptPress(pressInput('?/open', 'row-1'), rows)]);
		const removed = rowsAfterPresses(rows, [keptPress(pressInput('?/delete', 'row-1'), rows)]);

		expect(unreadCountAfterPresses(3, rows, opened)).toBe(3);
		expect(unreadCountAfterPresses(3, rows, removed)).toBe(3);
	});

	it('takes an unread row that was taken away off the count', () => {
		const rows = [makeNotification({ id: 'row-1' })];

		const shown = rowsAfterPresses(rows, [keptPress(pressInput('?/delete', 'row-1'), rows)]);

		expect(unreadCountAfterPresses(1, rows, shown)).toBe(0);
	});

	it('never goes below nothing, even when the count was already behind the rows', () => {
		const rows = [makeNotification({ id: 'row-1' }), makeNotification({ id: 'row-2' })];

		const shown = rowsAfterPresses(rows, [keptPress(pressInput('?/markAllRead'), rows)]);

		expect(unreadCountAfterPresses(1, rows, shown)).toBe(0);
	});
});

describe('openedNotificationPath', () => {
	it('leads where the notification links to', () => {
		const notification = makeNotification({ linkPath: '/conferences/riverside-mun/apply' });

		expect(openedNotificationPath(notification)).toBe('/conferences/riverside-mun/apply');
	});

	it('leaves a notification with no link to the server', () => {
		expect(openedNotificationPath(makeNotification({ linkPath: null }))).toBeNull();
	});

	it('never leads to another website, as the server refuses to as well', () => {
		const notification = makeNotification({ linkPath: '//example.com/phish' });

		expect(openedNotificationPath(notification)).toBe('/');
	});
});
