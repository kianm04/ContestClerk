/**
 * What the bell and the `/notifications` page need to know about a
 * notification, without knowing anything about Supabase or Svelte.
 *
 * Rows are only ever put in the table by database triggers, so nothing here
 * ever makes one. See `specs/02-architecture/notifications.md` for the list of
 * triggers and what each one says.
 */

import { dayLabel, groupByDay } from '$lib/dates';
import type { Database } from '$lib/database.types';

/** One of the eleven things the app tells a person about. */
export type NotificationKind = Database['public']['Enums']['notification_kind'];

/** One row of the `notifications` table, in the shape the pages use. */
export type Notification = {
	id: string;
	kind: NotificationKind;
	/** A full sentence under 100 characters: "Your application was accepted". */
	title: string;
	body: string | null;
	/** An app path such as `/applications/42`, or nothing when there is nowhere to go. */
	linkPath: string | null;
	/** When it was opened, or `null` while it is still unread. */
	readAt: string | null;
	createdAt: string;
	/** The conference it is about, shown as a small badge. `null` for account news. */
	conferenceName: string | null;
};

/** One day of notifications, under the heading the page shows above them. */
export type NotificationDay = {
	/** The day itself, as `YYYY-MM-DD`. */
	day: string;
	/** "Today", "Yesterday", or the date. */
	label: string;
	notifications: Notification[];
};

/** How many the `/notifications` page shows at once. */
export const NOTIFICATIONS_PER_PAGE = 30;

/** How many the bell dropdown lists. */
export const BELL_NOTIFICATION_COUNT = 8;

/**
 * The timezone the notifications page counts days in.
 *
 * Everywhere else in the app a moment is shown in the conference's own
 * timezone, because a session that starts at 13:30 starts at 13:30 for
 * everybody there. A notification list is not one conference, so there is no
 * such timezone to use, and neither `profiles` nor an account setting holds the
 * reader's own. UTC is therefore what "Today" and "Yesterday" are counted in
 * until a per-person timezone exists; the relative time on each row
 * ("2 hours ago") is right wherever it is read.
 */
export const NOTIFICATION_TIME_ZONE = 'UTC';

/**
 * Split a list that is already newest first into one group per day, each with
 * the heading the page shows above it.
 *
 * `groupByDay` and `dayLabel` in `$lib/dates.ts` do the work; this wraps them
 * so that the page and the tests agree on which timezone the days are counted
 * in. `now` is given rather than read from the clock, because a pure function
 * may not read it.
 */
export function groupNotificationsByDay(
	notifications: Notification[],
	now: Date
): NotificationDay[] {
	const groups = groupByDay(
		notifications,
		(notification) => notification.createdAt,
		NOTIFICATION_TIME_ZONE
	);

	return groups.map((group) => ({
		day: group.day,
		label: dayLabel(group.day, now, NOTIFICATION_TIME_ZONE),
		notifications: group.items
	}));
}

/** How many pages of notifications there are altogether. At least one, even when empty. */
export function notificationPageCount(total: number): number {
	return Math.max(1, Math.ceil(total / NOTIFICATIONS_PER_PAGE));
}
