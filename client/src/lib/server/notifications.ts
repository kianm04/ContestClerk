/**
 * Reading and marking notifications.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the Supabase client as its first argument, and pages pass in
 * `locals.supabase`, the client that knows who is signed in, so Row Level
 * Security decides what each person may see and change. The policies say: read
 * your own rows and only those already due, change nothing but `read_at`,
 * delete your own. Nothing here may insert a row, because only database
 * triggers do that; see `specs/02-architecture/notifications.md`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	BELL_NOTIFICATION_COUNT,
	NOTIFICATIONS_PER_PAGE,
	type Notification,
	type NotificationKind
} from '$lib/notifications';

/**
 * The columns every query asks for. `conferences(name)` tells Supabase to
 * follow `conference_id` to the conferences table and bring its name back, so
 * a row can show which conference it is about.
 */
const NOTIFICATION_COLUMNS =
	'id, kind, title, body, link_path, read_at, created_at, conferences(name)';

/** One row as Supabase hands it back, with the conference name attached. */
type NotificationRow = {
	id: string;
	kind: NotificationKind;
	title: string;
	body: string | null;
	link_path: string | null;
	read_at: string | null;
	created_at: string;
	/** One object, not a list: a notification belongs to at most one conference. */
	conferences: { name: string } | null;
};

/** The error code Supabase sends when a page number is past the last page of results. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

/** Turn a database row (snake_case names) into the shape the pages use. */
function toNotification(row: NotificationRow): Notification {
	return {
		id: row.id,
		kind: row.kind,
		title: row.title,
		body: row.body,
		linkPath: row.link_path,
		readAt: row.read_at,
		createdAt: row.created_at,
		conferenceName: row.conferences?.name ?? null
	};
}

/** One page of somebody's notifications, and how many they have altogether. */
export type NotificationPage = {
	rows: Notification[];
	/** Every notification they have, not just the ones on this page. */
	total: number;
};

/**
 * One page of the signed-in person's notifications, newest first.
 *
 * `page` counts from 1. Asking for a page past the end gives an empty list
 * rather than an error, which is what happens when a bookmark outlives the rows
 * it pointed at.
 *
 * The `user_id` filter looks redundant beside the select policy, and it is; it
 * is here so that the database can use the `(user_id, read_at, created_at desc)`
 * index instead of reading every row and filtering afterwards.
 */
export async function listNotifications(
	supabase: SupabaseClient,
	userId: string,
	page: number
): Promise<NotificationPage> {
	// `range` counts from 0 and includes both ends, so page 1 is rows 0 to 29.
	const firstIndex = (page - 1) * NOTIFICATIONS_PER_PAGE;
	const lastIndex = firstIndex + NOTIFICATIONS_PER_PAGE - 1;

	const { data, error, count } = await supabase
		.from('notifications')
		// `count: 'exact'` also asks for the number of matches in total, not just
		// the ones on this page, which is what the pager needs.
		.select(NOTIFICATION_COLUMNS, { count: 'exact' })
		.eq('user_id', userId)
		.order('created_at', { ascending: false })
		.range(firstIndex, lastIndex)
		// Without generated database types, Supabase guesses the shape of a row
		// from the text in `select`, and it guesses that `conferences(name)` is a
		// list. It is really one object, so this replaces the guess. It comes last.
		.overrideTypes<NotificationRow[], { merge: false }>();

	// Somebody asked for a page past the last one, for example by editing the URL.
	if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
		return { rows: [], total: count ?? 0 };
	}

	// A failed query means a bug (a wrong column name, a missing policy), not
	// something the reader can fix. Throwing shows SvelteKit's error page, and
	// the real message ends up in the server log.
	if (error) {
		throw new Error(`Could not list notifications: ${error.message}`);
	}

	const rows: NotificationRow[] = data ?? [];

	return { rows: rows.map(toNotification), total: count ?? 0 };
}

/**
 * The latest few for the bell dropdown, read or unread.
 *
 * The dropdown always lists these, even when nothing is unread, so that
 * somebody who has just read everything can still find what they read.
 */
export async function listRecentNotifications(
	supabase: SupabaseClient,
	userId: string
): Promise<Notification[]> {
	const { data, error } = await supabase
		.from('notifications')
		.select(NOTIFICATION_COLUMNS)
		.eq('user_id', userId)
		.order('created_at', { ascending: false })
		.limit(BELL_NOTIFICATION_COUNT)
		.overrideTypes<NotificationRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the latest notifications: ${error.message}`);
	}

	const rows: NotificationRow[] = data ?? [];

	return rows.map(toNotification);
}

/**
 * How many are still unread. This is the number on the bell.
 *
 * `head: true` asks for the count without any of the rows themselves, so the
 * database sends back a number and nothing else. Rows dated in the future are
 * left out by the select policy rather than by anything here.
 */
export async function countUnreadNotifications(
	supabase: SupabaseClient,
	userId: string
): Promise<number> {
	const { count, error } = await supabase
		.from('notifications')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', userId)
		.is('read_at', null);

	if (error) {
		throw new Error(`Could not count unread notifications: ${error.message}`);
	}

	return count ?? 0;
}

/**
 * Mark one as read, and say where it wanted to send the reader.
 *
 * The row is read first, because it is the row that says where to go next and
 * because an update that changes nothing hands nothing back: opening something
 * twice has to work. `null` means there is no such row for this person, which
 * is what Row Level Security answers for somebody else's notification.
 *
 * `link_path` is whatever a database trigger wrote. The page still passes it
 * through `safeRedirectPath` before redirecting, because a redirect is worth
 * being careful about wherever the address came from.
 */
export async function markNotificationRead(
	supabase: SupabaseClient,
	notificationId: string
): Promise<{ linkPath: string | null } | null> {
	const { data, error } = await supabase
		.from('notifications')
		.select('link_path')
		.eq('id', notificationId)
		.maybeSingle()
		.overrideTypes<{ link_path: string | null }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the notification: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	// `is('read_at', null)` leaves an already-read row exactly as it was, so the
	// moment it was first opened is the moment that is kept.
	const { error: updateError } = await supabase
		.from('notifications')
		.update({ read_at: new Date().toISOString() })
		.eq('id', notificationId)
		.is('read_at', null);

	if (updateError) {
		throw new Error(`Could not mark the notification as read: ${updateError.message}`);
	}

	return { linkPath: data.link_path };
}

/** Mark everything still unread as read. This is what empties the bell. */
export async function markAllNotificationsRead(
	supabase: SupabaseClient,
	userId: string
): Promise<void> {
	const { error } = await supabase
		.from('notifications')
		.update({ read_at: new Date().toISOString() })
		.eq('user_id', userId)
		.is('read_at', null);

	if (error) {
		throw new Error(`Could not mark the notifications as read: ${error.message}`);
	}
}

/** Remove one for good. The policy allows this only for the person's own rows. */
export async function deleteNotification(
	supabase: SupabaseClient,
	notificationId: string
): Promise<void> {
	const { error } = await supabase.from('notifications').delete().eq('id', notificationId);

	if (error) {
		throw new Error(`Could not remove the notification: ${error.message}`);
	}
}
