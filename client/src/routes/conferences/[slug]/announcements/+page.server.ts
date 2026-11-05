import { error, redirect } from '@sveltejs/kit';
import { announcementPageCount, readAnnouncementsPage } from '$lib/announcements';
import { isConferenceMember } from '$lib/schedule';
import { listAnnouncementsFor, markAnnouncementNotificationsRead } from '$lib/server/announcements';
import { getConferenceBySlug } from '$lib/server/conferences';
import { readMyMembership } from '$lib/server/schedule';
import { loginUrl } from '$lib/urls';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before one conference's announcements are drawn, and
 * again whenever the address changes, which here means the pager being used.
 *
 * Only somebody taking part in the conference or on its staff may read them.
 * A visitor is asked to sign in first; anybody else is told the page is not
 * there, the way the schedule page tells them.
 *
 * Opening the page is reading the announcements, so this conference's
 * announcement notifications are marked read in the same request.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
	const conference = await getConferenceBySlug(locals.supabase, params.slug);

	if (!conference) {
		error(404, 'This conference does not exist.');
	}

	const claims = await locals.getVerifiedClaims();

	if (!claims) {
		redirect(303, loginUrl(url.pathname + url.search));
	}

	const userId = String(claims.sub);
	const membership = await readMyMembership(locals.supabase, conference.id, userId);

	if (!isConferenceMember(membership)) {
		error(404, 'This page does not exist.');
	}

	const page = readAnnouncementsPage(url.searchParams.get('page'));

	// Neither needs the other's answer, so they run side by side.
	const [announcements] = await Promise.all([
		listAnnouncementsFor(locals.supabase, conference.id, page),
		markAnnouncementNotificationsRead(locals.supabase, userId, conference.id)
	]);

	return {
		conference: { name: conference.name, slug: conference.slug, timezone: conference.timezone },
		announcements: announcements.rows,
		page,
		pageCount: announcementPageCount(announcements.total),
		/** Set when a notification led here for an announcement that has since been deleted. */
		isRemoved: url.searchParams.get('removed') === '1',
		/** One moment for every "3 hours ago" on the page, so they all agree. */
		now: new Date().toISOString()
	};
};
