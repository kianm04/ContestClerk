import { profileCompleteness } from '$lib/profiles';
import { requireOnboarded } from '$lib/server/access';
import { listMyAwards } from '$lib/server/awards';
import { getMyProfile, listMyConferenceHistory } from '$lib/server/profiles';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before the page is rendered. Whatever it returns arrives
 * in `+page.svelte` as `data`.
 *
 * `requireOnboarded` is `requireUser` plus the onboarding gate. `/profile` is
 * an ordinary signed-in page, so it uses that one: a brand-new account is sent
 * to `/welcome` first and comes back here once it is filled in.
 *
 * Files under `$lib/server` only ever run on the server, so neither of the
 * queries below can reach the browser.
 *
 * There are no form actions on this page. All three forms, and the actions
 * behind them, live on `/profile/edit`.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireOnboarded(locals, url);

	// None of the queries needs another's answer, so all three start at once.
	// Awards only count once their conference's publish moment has arrived,
	// which is why the awards query is told what time it is. It is not told who
	// is asking: the view it reads knows which awards are the reader's own.
	const [profileAndDetails, history, awards] = await Promise.all([
		getMyProfile(locals.supabase, user.id),
		listMyConferenceHistory(locals.supabase, user.id),
		listMyAwards(locals.supabase, new Date())
	]);

	const { profile, details } = profileAndDetails;

	// The page file's Data table says `load` derives this, so it is worked out
	// once here and `ProfileHeader` only draws what it is handed.
	const completeness = profileCompleteness(profile);

	return { profile, details, history, awards, completeness };
};
