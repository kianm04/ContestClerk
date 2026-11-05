import { fail, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readAnnouncementLink } from '$lib/announcements';
import { safeRedirectPath } from '$lib/auth';
import { conferenceAnnouncementsUrl, notificationsUrl } from '$lib/urls';
import { requireOnboarded } from '$lib/server/access';
import { announcementExists } from '$lib/server/announcements';
import { setFlash } from '$lib/server/flash';
import {
	deleteNotification,
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead
} from '$lib/server/notifications';
import type { Actions, PageServerLoad } from './$types';

/** The page number in `?page=`, counting from 1. Anything odd means page 1. */
function readPageNumber(url: URL): number {
	const asNumber = Number(url.searchParams.get('page'));

	if (!Number.isInteger(asNumber) || asNumber < 1) {
		return 1;
	}

	return asNumber;
}

/** The notification an action was pressed for, or nothing when the form was empty. */
function readNotificationId(formData: FormData): string | null {
	const id = String(formData.get('notificationId') ?? '');

	return id === '' ? null : id;
}

/**
 * Runs on the server before the page is rendered, and again every time we
 * navigate to a different `/notifications?page=` URL. Whatever it returns
 * arrives in `+page.svelte` as `data`.
 *
 * The bell's own unread count and its latest eight are loaded once by the root
 * layout, so this page does not ask for them a second time.
 *
 * `requireOnboarded` is `requireUser` plus the onboarding gate: a brand-new
 * account is sent to `/welcome` first, and comes back here once it is filled in.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireOnboarded(locals, url);
	const page = readPageNumber(url);
	const { rows, total } = await listNotifications(locals.supabase, user.id, page);

	return { page, rows, total };
};

/**
 * Where an opened notification leads.
 *
 * An announcement's notification names its announcement in its link. When that
 * announcement has been deleted since, the reader lands on the conference's
 * announcements with "That announcement was removed." rather than on a list
 * that silently lacks it. Every other link is followed as it stands.
 */
async function notificationDestination(supabase: SupabaseClient, linkPath: string) {
	const announcementLink = readAnnouncementLink(linkPath);

	if (!announcementLink) {
		return safeRedirectPath(linkPath);
	}

	const isStillThere = await announcementExists(supabase, announcementLink.announcementId);

	if (isStillThere) {
		return safeRedirectPath(linkPath);
	}

	// Built here rather than read from the database, so it needs no checking. It
	// must not go through `safeRedirectPath` either: while the server draws a
	// page, `resolve()` answers a relative address such as `./conferences/…`,
	// which that check would take for a foreign one and turn into `/`.
	return conferenceAnnouncementsUrl(announcementLink.conferenceSlug, { isRemoved: true });
}

export const actions: Actions = {
	/**
	 * Open one: mark it read, then go where it points.
	 *
	 * The address comes from a database trigger rather than from the visitor, but
	 * it still goes through `safeRedirectPath`, which refuses anything pointing
	 * at another website. A notification whose target has since been removed
	 * still redirects; that page shows its own "removed" message, which for an
	 * announcement `notificationDestination` asks it for.
	 */
	open: async ({ request, url, locals }) => {
		await requireOnboarded(locals, url);

		const formData = await request.formData();
		const notificationId = readNotificationId(formData);

		if (!notificationId) {
			return fail(400, { message: 'That notification could not be opened.' });
		}

		const opened = await markNotificationRead(locals.supabase, notificationId);

		// Either it is not this person's notification or it no longer exists.
		// Both are the same to them: back to the list, with nothing said.
		if (!opened || !opened.linkPath) {
			redirect(303, notificationsUrl());
		}

		redirect(303, await notificationDestination(locals.supabase, opened.linkPath));
	},

	/** Mark everything read, which is what empties the bell. */
	markAllRead: async ({ cookies, url, locals }) => {
		const user = await requireOnboarded(locals, url);

		await markAllNotificationsRead(locals.supabase, user.id);

		// A redirect cannot carry a result back, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(cookies, { tone: 'success', message: 'All notifications marked as read.' });
		redirect(303, notificationsUrl());
	},

	/** Remove one for good. Only the person it belongs to may, which the policy enforces. */
	delete: async ({ request, url, locals }) => {
		await requireOnboarded(locals, url);

		const formData = await request.formData();
		const notificationId = readNotificationId(formData);

		if (!notificationId) {
			return fail(400, { message: 'That notification could not be removed.' });
		}

		await deleteNotification(locals.supabase, notificationId);

		redirect(303, notificationsUrl());
	}
};
