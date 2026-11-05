import { parseConferenceQuery } from '$lib/conferences';
import { defaultShareImageUrl } from '$lib/media';
import { listConferences, listCountries } from '$lib/server/conferences';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before the page is rendered: once on the first visit, and
 * again every time we navigate to a different `/conferences?...` URL. Whatever
 * it returns arrives in `+page.svelte` as `data`.
 */
export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	const query = parseConferenceQuery(url.searchParams);

	// One moment for the whole page, so the "Applications open" badge on a card
	// and the `open` filter that found it cannot disagree.
	const now = new Date();

	// Neither lookup needs the other's result, so start them both at once.
	// `supabase` is the database client for this one visitor (see
	// `src/hooks.server.ts`), so the database's access rules apply to them.
	const [{ rows, total }, countries] = await Promise.all([
		listConferences(supabase, query, now),
		listCountries(supabase, now)
	]);

	// `query` is sent back to the page as well, so the form shows exactly the
	// filters the results were built from, even if the URL held something odd.
	return {
		query,
		rows,
		total,
		countries,
		now,
		// `og:image` has to be a whole address, and only the request knows ours.
		shareImageUrl: defaultShareImageUrl(url.origin)
	};
};
