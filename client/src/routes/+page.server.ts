import { redirect } from '@sveltejs/kit';
import type { Conference } from '$lib/conferences';
import { LANDING_CONFERENCE_LIMIT } from '$lib/landing';
import { parseShowcaseView } from '$lib/landing-showcase';
import { defaultShareImageUrl } from '$lib/media';
import { listConferencesToExplore } from '$lib/server/conferences';
import { signedInHomeUrl } from '$lib/urls';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before the page is rendered. Whatever it returns arrives
 * in `+page.svelte` as `data`. It runs again whenever the address changes, which
 * on this page means the switch above the example moving between
 * `/` and `/?view=organiser`.
 *
 * Somebody who is already signed in never sees this page at all: they are sent
 * to `/home` instead.
 *
 * The example under the hero is a picture of the product drawn from sample
 * content (`$lib/landing-showcase.ts`), so the only thing read from the
 * address is whose view of it to show. One thing on the page comes from the
 * database: the conferences a visitor could apply to today, for the "Taking
 * applications now" section. Files under `$lib/server` only ever run on the
 * server, so the query never reaches the browser.
 *
 * The sharing picture is the site's own default rather than one belonging to
 * this page, because the landing page is the site.
 */
export const load: PageServerLoad = async ({ url, locals: { supabase, getVerifiedClaims } }) => {
	const claims = await getVerifiedClaims();

	if (claims) {
		redirect(303, signedInHomeUrl());
	}

	// The moment the conferences were read. The cards decide their
	// applications pill from it, so the server and the browser draw the same
	// card; `/conferences` does the same.
	const now = new Date();

	return {
		showcaseView: parseShowcaseView(url.searchParams),
		conferences: await conferencesTakingApplications(supabase, now),
		now,
		// `og:image` has to be a whole address, and only the request knows ours.
		shareImageUrl: defaultShareImageUrl(url.origin)
	};
};

/**
 * The soonest few conferences taking applications, or none at all if the
 * database cannot answer. The landing page is the front door, and one section
 * of it not loading is no reason to show a visitor an error page instead; the
 * section then says there is nothing to show. The failure is still written to
 * the server's log, so it is not lost.
 *
 * A visitor is part of no conference, so there is nothing to leave out.
 */
async function conferencesTakingApplications(
	supabase: App.Locals['supabase'],
	now: Date
): Promise<Conference[]> {
	try {
		return await listConferencesToExplore(supabase, [], now, LANDING_CONFERENCE_LIMIT);
	} catch (error) {
		console.error('The landing page could not list the conferences taking applications.', error);

		return [];
	}
}
