import { applicationListConference, mergeIntoApplicationList } from '$lib/applications';
import { buildApplicationCards } from '$lib/application-cards';
import {
	countApplicationTabs,
	parseMyApplicationsQuery,
	visibleApplicationCards
} from '$lib/my-applications-query';
import { requireOnboarded } from '$lib/server/access';
import { readApplicationCardFacts } from '$lib/server/application-card-facts';
import { listMyApplications } from '$lib/server/applications';
import { listMyDelegationMemberships } from '$lib/server/delegations';
import { countMyApplicationsAtUnpublishedConferences } from '$lib/server/unpublished-conference-applications';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before the page is rendered, and again every time we
 * navigate to a different `/applications` URL: a search typed, a tab chosen,
 * or the order changed. Whatever it returns arrives in `+page.svelte` as `data`.
 *
 * `requireOnboarded` is `requireUser` plus the onboarding gate: a brand-new
 * account is sent to `/welcome` first, and comes back here once it is filled in.
 *
 * Files under `$lib/server` only ever run on the server, so none of the queries
 * the list functions make can reach the browser.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireOnboarded(locals, url);
	const query = parseMyApplicationsQuery(url.searchParams);

	// One moment for the whole page, so the "closes in 3 days" line on a card and
	// the check that decided whether that card still offers "Finish application"
	// cannot disagree about when "now" was.
	const now = new Date();

	// None of the three needs another's answer, so all are sent at once and the
	// page waits for the slowest rather than for the sum. The third counts the
	// rows the two lists cannot show, because the organisers have unpublished
	// their conference and the reader may no longer read it.
	const [applications, memberships, unpublishedCount] = await Promise.all([
		listMyApplications(locals.supabase, user.id),
		listMyDelegationMemberships(locals.supabase, user.id),
		countMyApplicationsAtUnpublishedConferences(locals.supabase, user.id)
	]);

	const entries = mergeIntoApplicationList(applications, memberships);

	// The place, the position paper, the invoices and the delegations' dates the
	// cards show, which the two lists above do not read.
	const facts = await readApplicationCardFacts(
		locals.supabase,
		user.id,
		entries.map((entry) => applicationListConference(entry).id),
		memberships.map((membership) => membership.id)
	);

	const allCards = buildApplicationCards(entries, facts, now);

	return {
		cards: visibleApplicationCards(allCards, query),
		counts: countApplicationTabs(allCards, query.q),
		query,
		hasAnyApplication: allCards.length > 0,
		unpublishedCount
	};
};
