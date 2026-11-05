import { error } from '@sveltejs/kit';
import { defaultShareImageUrl, publicMediaUrl } from '$lib/media';
import { getOrganizationPage } from '$lib/server/organizations';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before the page is shown, and again whenever the slug in the
 * URL changes. The folder is named `[slug]`, so SvelteKit hands us that part of the
 * URL as `params.slug`: for `/organizations/sample-europe-mun-network` it is
 * `sample-europe-mun-network`. Whatever it returns arrives in `+page.svelte` as `data`.
 */
export const load: PageServerLoad = async ({
	params,
	url,
	locals: { supabase, getVerifiedClaims }
}) => {
	// The page is public, so nobody is sent away for being signed out. Who is
	// reading only decides one thing: whether they may edit this organisation,
	// and so whether the page offers them that button.
	const claims = await getVerifiedClaims();
	const userId = claims ? String(claims.sub) : null;

	// One moment for the whole page, so the split between upcoming and past
	// conferences and the badges on the cards cannot disagree about what time it is.
	const now = new Date();

	// Everything the page shows in one go. `$lib/server` only ever runs on the
	// server, so the database client and its access rules stay there.
	const organizationPage = await getOrganizationPage(supabase, params.slug, userId, now);

	if (!organizationPage) {
		// `error` stops here and shows SvelteKit's error page with a 404 status.
		error(404, 'This organisation does not exist.');
	}

	// `og:image` has to be a whole address, and only the request knows ours. No
	// organisation in the seed has a logo yet, so the fallback picture is the
	// ordinary case today rather than the exception.
	let shareImageUrl = defaultShareImageUrl(url.origin);

	if (organizationPage.organization.logoPath) {
		shareImageUrl = publicMediaUrl(organizationPage.organization.logoPath);
	}

	// Spreading `organizationPage` hands the page its four parts (`organization`,
	// `upcoming`, `past` and `isAdmin`) at the top level of `data`.
	return { ...organizationPage, now, shareImageUrl };
};
