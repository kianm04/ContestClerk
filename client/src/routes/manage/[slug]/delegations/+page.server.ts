import { DELEGATIONS_PAGE_SIZE, parseDelegationListQuery } from '$lib/delegations';
import { requireManagePage } from '$lib/server/access';
import { listDelegationsForOrganiser, summariseDelegations } from '$lib/server/delegations';
// `./$types` holds the types SvelteKit generates for this one route, so
// `PageServerLoad` already knows which parameters this address has and what the
// layout above it hands down.
import type { PageServerLoad } from './$types';

/**
 * Everything the delegations table shows: one page of rows, and the counts on
 * the tabs above them.
 *
 * The filters, the open tab, the sort and the page number are all read out of
 * the address, so the back button, a refresh and a shared link all show the
 * same rows. `05-pages/organiser/delegations.md` asks for that.
 *
 * `$lib/server/delegations` only ever runs on the server, so the queries below
 * cannot be reached by anything the browser does.
 */
export const load: PageServerLoad = async ({ parent, url, locals }) => {
	// `parent()` is how a page's `load` reads what the layout above it returned.
	// `/manage/[slug]` has already read the reader's permissions, so checking
	// this page's line against them needs no second query.
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'delegations');

	const query = parseDelegationListQuery(url.searchParams);

	// Neither of these needs the other's answer, so they run side by side.
	const [page, summary] = await Promise.all([
		listDelegationsForOrganiser(locals.supabase, conference.id, query),
		summariseDelegations(locals.supabase, conference.id)
	]);

	/*
		There are no form actions on this page. Accepting or turning down a
		delegation happens on its own review page, so that the seat picker is in
		view while the decision is made; that page is task T73. The only form
		here is the GET filter form.
	*/
	return {
		query,
		rows: page.rows,
		/**
		 * How many pages of 25 there are, kept at 1 rather than 0 on an empty
		 * tab so the number always reads as a count of pages. Nothing on screen
		 * depends on the clamp: `Pagination` draws no pager at all below two
		 * pages, and an empty tab draws the empty state instead of the table.
		 */
		pageCount: Math.max(1, Math.ceil(page.total / DELEGATIONS_PAGE_SIZE)),
		summary
	};
};
