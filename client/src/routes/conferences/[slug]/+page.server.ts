import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dayInTimezone } from '$lib/dates';
import { defaultShareImageUrl, publicMediaUrl } from '$lib/media';
import { getConferencePage } from '$lib/server/conferences';
import { listResources } from '$lib/server/resources';
import { isConferenceMember, NO_MEMBERSHIP, type AudienceMembership } from '$lib/schedule';
import { listPublicProgramme, readMyMembership } from '$lib/server/schedule';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before the page is shown, and again whenever the slug in the
 * URL changes. The folder is named `[slug]`, so SvelteKit hands us that part of the
 * URL as `params.slug`: for `/conferences/amsterdammun-2027` it is
 * `amsterdammun-2027`. Whatever it returns arrives in `+page.svelte` as `data`.
 */
export const load: PageServerLoad = async ({
	params,
	url,
	locals: { supabase, getVerifiedClaims }
}) => {
	// The page is public, so nobody is sent away for being signed out. Who is
	// reading only decides what the database is asked about them: whether they
	// already hold a seat, and whether they are staff of a conference that is
	// still a draft and so may see it at all.
	const claims = await getVerifiedClaims();
	const userId = claims ? String(claims.sub) : null;

	// Everything the page shows in one go. `$lib/server` only ever runs on the
	// server, so the database client and its access rules stay there.
	const conferencePage = await getConferencePage(supabase, params.slug, userId);

	if (!conferencePage) {
		// `error` stops here and shows SvelteKit's error page with a 404 status.
		error(404, 'This conference does not exist.');
	}

	// One moment for the whole page, so the badges in the hero and the apply
	// panel below them cannot disagree about what time it is.
	const now = new Date();

	// "Has it finished?" is asked in the conference's own timezone rather than in
	// the reader's, because a conference in Auckland is not over just because it
	// is still yesterday in London.
	const today = dayInTimezone(now, conferencePage.conference.timezone);

	// `og:image` has to be a whole address, and only the request knows ours. No
	// conference in the seed has a banner yet, so the fallback picture is the
	// ordinary case today rather than the exception.
	let shareImageUrl = defaultShareImageUrl(url.origin);

	if (conferencePage.conference.bannerPath) {
		shareImageUrl = publicMediaUrl(conferencePage.conference.bannerPath);
	}

	// None of these needs another's answer, so all three are sent at once.
	const [programme, resources, membership] = await Promise.all([
		// The public programme: `everyone` events, and none at all unless the
		// organisers ticked "Show programme publicly". Empty hides the section.
		listPublicProgramme(supabase, conferencePage.conference.id),
		// `listResources` asks Row Level Security the same question a signed-in
		// organiser's page does; here the reader is often a visitor, so RLS
		// answers with only the `audience: 'everyone'` files, `06-features/documents.md`.
		listResources(supabase, conferencePage.conference.id),
		// How the reader is part of this conference, which decides whether the
		// programme offers "Announcements". A visitor is part of nothing.
		readMembershipIfSignedIn(supabase, conferencePage.conference.id, userId)
	]);

	// The same question the announcements page asks before it answers with a
	// 404, so the link is offered to exactly the people that page lets in.
	const canReadAnnouncements = isConferenceMember(membership);

	// Spreading `conferencePage` hands the page its four parts (`conference`,
	// `committees`, `team` and `viewer`) at the top level of `data`.
	return {
		...conferencePage,
		programme,
		resources,
		canReadAnnouncements,
		now,
		today,
		shareImageUrl
	};
};

/** How a signed-in reader is part of the conference, and nothing for a visitor. */
async function readMembershipIfSignedIn(
	supabase: SupabaseClient,
	conferenceId: string,
	userId: string | null
): Promise<AudienceMembership> {
	if (userId === null) {
		return NO_MEMBERSHIP;
	}

	return readMyMembership(supabase, conferenceId, userId);
}
