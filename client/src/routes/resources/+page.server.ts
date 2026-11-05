import { groupResourcesByConference, resourceConferenceOptions } from '$lib/resources';
import { requireOnboarded } from '$lib/server/access';
import { listMyResources } from '$lib/server/my-resources';
import type { PageServerLoad } from './$types';

/**
 * Runs on the server before `/resources` is drawn: every resource and
 * background guide the reader may see, grouped by conference.
 *
 * `requireOnboarded` sends a signed-out visitor to sign in first. Files under
 * `$lib/server` only ever run on the server, so `listMyResources`'s queries
 * never reach the browser. `?conference=<slug>` narrows the page to one
 * conference; it is read here, from the URL, rather than kept in any state,
 * so the back button, a refresh and a shared link all show the same page.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireOnboarded(locals, url);

	const resources = await listMyResources(locals.supabase, user.id);
	const groups = groupResourcesByConference(resources);

	const conferenceFilter = url.searchParams.get('conference');
	const visibleGroups = conferenceFilter
		? groups.filter((group) => group.conferenceSlug === conferenceFilter)
		: groups;

	return {
		groups: visibleGroups,
		conferenceOptions: resourceConferenceOptions(groups),
		conferenceFilter: conferenceFilter ?? ''
	};
};
