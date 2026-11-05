import { redirect } from '@sveltejs/kit';
import { pickScheduleConference } from '$lib/schedule-conference';
import { requireOnboarded } from '$lib/server/access';
import { listMyConferences } from '$lib/server/my-conferences';
import { conferenceScheduleUrl } from '$lib/urls';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before `/schedule` is drawn.
 *
 * The top bar's "Schedule" leads here, but there is no schedule of its own
 * here: every conference has one, `/conferences/<slug>/schedule`, so the reader
 * is sent straight on to the one of their current conference
 * (`pickScheduleConference` says which). Only a reader who is part of no
 * conference stays on this page, which tells them so.
 *
 * `requireOnboarded` sends a signed-out visitor to sign in first. Files under
 * `$lib/server` only ever run on the server.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireOnboarded(locals, url);

	const conferences = await listMyConferences(locals.supabase, user.id);
	const conference = pickScheduleConference(conferences, new Date());

	if (conference !== null) {
		// `redirect` stops the load here; the browser goes to the new address instead.
		redirect(303, conferenceScheduleUrl(conference.slug));
	}

	return {};
};
