import { error } from '@sveltejs/kit';
import type { CommitteePageAward } from '$lib/awards';
import { papersPageTitle } from '$lib/committee-papers';
import { defaultShareImageUrl, publicMediaUrl } from '$lib/media';
import { committeePaperPrintUrl } from '$lib/urls';
import {
	listCommitteeAwards,
	listPublishedCommitteeAwards,
	readAwardsPublishedAt
} from '$lib/server/awards';
import { getCommitteePage } from '$lib/server/committee-page';
import { readCommitteeFormat } from '$lib/server/committee-papers';
import { mayAnswerDirectives } from '$lib/server/crisis-desk';
import { getBackgroundGuide } from '$lib/server/documents';
import { listPassedPapers } from '$lib/server/paper-votes';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before the page is shown, and returns everything the
 * committee page draws.
 *
 * The two route folders are named `[slug]` and `[committeeSlug]`, so SvelteKit
 * hands both parts of the address over as `params.slug` and
 * `params.committeeSlug`. For
 * `/conferences/amsterdammun-2027/committees/security-council` they are
 * `amsterdammun-2027` and `security-council`. `load` runs again whenever either
 * of them changes, so following a link from one committee to the next fetches
 * the new one.
 */
export const load: PageServerLoad = async ({
	params,
	url,
	locals: { supabase, getVerifiedClaims }
}) => {
	/*
		The page is public, so nobody is turned away for being signed out. Who is
		signed in only decides how much of the seat list the database is willing to
		hand back, so all this needs is somebody to ask it about.
	*/
	const claims = await getVerifiedClaims();
	const userId = claims ? String(claims.sub) : null;

	/*
		Anything under `$lib/server` only ever runs on the server. `supabase` is the
		database client for this one visitor (see `src/hooks.server.ts`), so the
		database's own access rules decide what comes back.
	*/
	const page = await getCommitteePage(supabase, params.slug, params.committeeSlug, userId);

	if (!page) {
		/*
			`error` stops here and shows SvelteKit's error page with a 404 status.
			An unknown conference, an unknown committee and a conference this reader
			is not allowed to see all end up here on purpose, so the page can never
			reveal what exists (`specs/02-architecture/permissions.md`, "Never a
			403").
		*/
		error(404, 'This committee does not exist.');
	}

	/*
		The committee's background guide, with a one-minute download link. Row
		Level Security decides who gets it: a guide marked for everyone comes back
		for a signed-out visitor too, one marked for delegates only for the people
		taking part, and otherwise `null` comes back as if there were none.
	*/
	const backgroundGuide = await getBackgroundGuide(supabase, page.committee.id);

	/*
		The committee's awards come two ways. The `awards` table answers only the
		people who propose or confirm awards, with every award of the committee;
		everybody else signed in reads the `published_awards` view, which carries
		the confirmed ones once the conference's publish moment has come and
		nothing about who proposed or holds them. A visitor is not granted the
		view, so it is not asked. The committee's format comes in the same wave,
		since it needs nothing else either.
	*/
	const [staffAwards, publishedAwards, awardsPublishedAt, format] = await Promise.all([
		listCommitteeAwards(supabase, page.committee.id),
		claims === null ? [] : listPublishedCommitteeAwards(supabase, page.committee.id),
		readAwardsPublishedAt(supabase, page.conference.id),
		readCommitteeFormat(supabase, page.committee.id)
	]);
	// Whatever the view lists is among what the table gives its readers, so when
	// the table answered nothing the view's answer is the whole of this reader's.
	const awards: CommitteePageAward[] = staffAwards.length > 0 ? staffAwards : publishedAwards;
	// Only a crisis committee has crisis staff, and only somebody signed in can be one of them.
	const isCrisisStaff =
		format === 'crisis' &&
		claims !== null &&
		(await mayAnswerDirectives(supabase, page.committee.id));

	/*
		What the committee adopted, each linked to its record copy
		(`docs/committee-papers.md`, step 8). Row Level Security only lets the
		committee's delegates and the conference's staff read its papers, so a
		visitor is not even asked about, and anybody else gets an empty list.
	*/
	const passedPapers = claims === null ? [] : await listPassedPapers(supabase, page.committee.id);
	const resolutions = passedPapers.map((paper) => ({
		...paper,
		href: committeePaperPrintUrl(page.conference.slug, page.committee.slug, paper.id)
	}));

	/*
		The picture a shared link shows has to be a whole web address, because the
		site reading it is somebody else's. The conference's banner is the best one
		this page has; most conferences have none, and those share the fallback.
	*/
	const { bannerPath } = page.conference;
	const shareImageUrl = bannerPath ? publicMediaUrl(bannerPath) : defaultShareImageUrl(url.origin);

	/*
		`isSignedIn` travels with the rest because an empty `chairs` list means two
		different things: "no chairs yet" for somebody signed in, and "not for you
		to see" for a visitor, who is never shown a profile at all. Only the header
		knows which sentence to write, and only this function knows which case it is.
	*/
	return {
		...page,
		backgroundGuide,
		awards,
		awardsPublishedAt,
		isSignedIn: claims !== null,
		shareImageUrl,
		// The role links' way to the committee's papers: "Resolutions", or
		// "Directives" in a crisis committee (`docs/committee-papers.md`, section 6).
		papersTitle: papersPageTitle(format),
		resolutions,
		// Who answers a crisis committee's directives, for the way to the crisis staff's page.
		isCrisisStaff
	};
};
