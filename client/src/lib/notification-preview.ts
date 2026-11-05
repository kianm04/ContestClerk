/**
 * What a press on `/notifications` changes, worked out in the browser so a row
 * shows as read, or disappears, the moment its button is pressed rather than
 * only once the server has answered (T125, T142).
 *
 * The page keeps one instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) for all its rows and for "Mark all as read".
 * Each press keeps the rows it changes as `RowChange`s, and the page draws the
 * rows `load` fetched with those laid on top (`rowsAfterPresses` in
 * `$lib/row-changes.ts`). The bell does the same with its own instant form, and
 * also works out its count and where an opened row leads from here.
 */
import { safeRedirectPath } from '$lib/auth';
import type { Notification } from '$lib/notifications';
import {
	pressedAction,
	pressedField,
	type RowChange,
	type RowPress,
	type PressedForm
} from '$lib/row-changes';

/**
 * A placeholder read time for a row shown as read before the server has said
 * when. Nothing ever shows this value; every reader only ever asks whether
 * `readAt` is `null`, so what it holds once it is not `null` does not matter.
 */
const PREVIEWED_READ_AT = 'preview';

/** One press on the page and the rows it changes. */
export type NotificationPress = RowPress<Notification>;

/** The change that marks one row read. */
function markedRead(id: string): RowChange<Notification> {
	return { id, changes: { readAt: PREVIEWED_READ_AT } };
}

/**
 * What a press will change, given the rows on screen when it was made:
 * "Mark all as read" marks every unread row read, opening a row marks it read
 * and "Remove" takes it away.
 */
export function expectNotificationChanges(
	input: PressedForm,
	rows: Notification[]
): RowChange<Notification>[] {
	const action = pressedAction(input.action);
	const notificationId = pressedField(input.formData, 'notificationId');

	if (action === '?/markAllRead') {
		const unreadRows = rows.filter((row) => row.readAt === null);
		return unreadRows.map((row) => markedRead(row.id));
	}

	if (action === '?/open') return [markedRead(notificationId)];

	if (action === '?/delete') return [{ id: notificationId, isDeleted: true }];

	return [];
}

/** What did not happen when a press failed, for its toast. */
export function describeNotificationFailure(press: NotificationPress): string {
	const action = pressedAction(press.action);

	if (action === '?/markAllRead') return 'The notifications were not marked as read.';

	if (action === '?/delete') return 'The notification was not removed.';

	return 'The notification was not opened.';
}

/**
 * The unread count with the presses still on their way taken off, for the
 * bell's badge. `loaded` and `previewed` are the same rows before and after
 * those presses: every row unread in the first but not in the second, because
 * it was opened or removed, no longer counts. The count is never below 0.
 */
export function unreadCountAfterPresses(
	unreadCount: number,
	loaded: Notification[],
	previewed: Notification[]
): number {
	const stillUnreadRows = previewed.filter((row) => row.readAt === null);
	const stillUnreadIds = stillUnreadRows.map((row) => row.id);
	const settledRows = loaded.filter(
		(row) => row.readAt === null && !stillUnreadIds.includes(row.id)
	);

	return Math.max(0, unreadCount - settledRows.length);
}

/**
 * Where opening `notification` leads, so the browser can go there at once
 * while the press marks it read in the background (Trello 1txzWHCK). It is the
 * same address the `open` action redirects to, checked by `safeRedirectPath`
 * in the same way. A notification with no link answers `null`: only the
 * server's answer says where that one goes.
 *
 * An announcement deleted since is the one case where the server sends the
 * reader somewhere else, to the same list with "That announcement was
 * removed.", and the instant form follows that answer when it comes back.
 */
export function openedNotificationPath(notification: Notification): string | null {
	if (notification.linkPath === null) return null;

	return safeRedirectPath(notification.linkPath);
}
