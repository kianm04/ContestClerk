import { requireOnboarded } from '$lib/server/access';
import { listMyCommittees } from '$lib/server/my-committees';
import type { PageServerLoad } from './$types';

/**
 * Whether the reader asked to see the conferences that are over as well.
 *
 * Only `?past=1` counts. Anything else — `?past=yes`, `?past=0`, or no `past`
 * at all — means the ordinary list, which hides conferences that have ended.
 */
function readIncludesPast(url: URL): boolean {
	return url.searchParams.get('past') === '1';
}

/**
 * Runs on the server before the page is rendered, and again every time we
 * navigate to a different `/committees` URL, which here means the "Show past
 * conferences" link being followed. Whatever it returns arrives in
 * `+page.svelte` as `data`.
 *
 * `requireOnboarded` is `requireUser` plus the onboarding gate: a brand-new
 * account is sent to `/welcome` first, and comes back here once it is filled in.
 *
 * Files under `$lib/server` only ever run on the server, so none of the queries
 * `listMyCommittees` makes can reach the browser.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireOnboarded(locals, url);
	const includesPast = readIncludesPast(url);

	// One moment for the whole page, so the "Next:" line on a card and the query
	// that picked that event cannot disagree about when "now" was. The root
	// layout has a `now` of its own, and this one deliberately replaces it on
	// this page for exactly that reason.
	const now = new Date();
	const rows = await listMyCommittees(locals.supabase, user.id, now, includesPast);

	return { rows, includesPast, now };
};
