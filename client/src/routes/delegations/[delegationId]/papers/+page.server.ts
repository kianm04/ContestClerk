import { requireOnboarded } from '$lib/server/access';
import { listDelegationPapers } from '$lib/server/delegation-papers';
// `./$types` holds the types SvelteKit generates for this one route, so
// `PageServerLoad` already knows this address has a `delegationId` in it and
// what the layout above hands down.
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before the "Position papers" view is drawn (T147): the
 * paper of every seat a member of this delegation holds.
 *
 * `parent()` waits for the layout's own `load`, which has already turned away
 * anybody who is not in this delegation with a 404. Heads and plain members
 * both get the page. The list comes from `delegation_papers`, which answers a
 * member of the delegation only, so nothing here could show a stranger a row.
 */
export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const { delegation } = await parent();
	const user = await requireOnboarded(locals, url);

	return {
		/** One row per seat a member holds, by the member's name and then the committee. */
		papers: await listDelegationPapers(locals.supabase, delegation.id),
		/** The reader's own id, so their own row opens their own position paper page. */
		readerId: user.id
	};
};
