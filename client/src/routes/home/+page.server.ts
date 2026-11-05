import { requireOnboarded } from '$lib/server/access';
import { loadHomeDashboard, readShowAll } from '$lib/server/home';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before the page is rendered. Whatever it returns arrives
 * in `+page.svelte` as `data`.
 *
 * `requireOnboarded` is `requireUser` plus the onboarding gate. `/home` is an
 * ordinary signed-in page, so it uses that one: a brand-new account is sent to
 * `/welcome` first and comes back here once it is filled in.
 *
 * Files under `$lib/server` only ever run on the server, so none of the queries
 * `loadHomeDashboard` makes can reach the browser.
 *
 * The root layout already gives every page `now` and `person`, so this `load`
 * returns neither of them a second time.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireOnboarded(locals, url);

	// One moment for the whole page, so the hero's countdown, a task's due word
	// and the query that found them cannot disagree.
	const now = new Date();

	// "Show all 11" under "Also coming up" links to `?all=conferences`, and the
	// one under "Quick sessions" to `?all=quick`. The page lifts that list's
	// limit; the address is the only state the page has, so the back button and
	// a shared link both work.
	const showAll = readShowAll(url.searchParams.get('all'));

	return loadHomeDashboard(locals.supabase, user.id, now, showAll);
};
