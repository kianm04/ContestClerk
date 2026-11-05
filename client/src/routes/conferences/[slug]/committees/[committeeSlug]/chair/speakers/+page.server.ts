import { redirect } from '@sveltejs/kit';
import { chairGslUrl } from '$lib/urls';
import type { PageServerLoad } from './$types';

/**
 * The Speakers page is gone (S4): its queue and speaker panel are the GSL
 * view's, its list settings are the GSL view's list footer and its caucus
 * lists are the Mod view's. This `load` keeps old links and bookmarks
 * working by sending every address under this route to the GSL view, with a
 * permanent redirect (308), dropping `?list=` and `?yield=`
 * (`specs/05-pages/chair/speakers.md`).
 *
 * `parent()` waits for the chair layout's `load`, so its gate goes first: a
 * visitor is still sent to sign in, and anybody who may not run this room
 * still gets a 404, rather than a redirect that tells them the room exists.
 * The route has no actions, so a form still posting here from a page loaded
 * before the change is refused, and reloading brings the chair to the GSL.
 */
export const load: PageServerLoad = async ({ parent, params }) => {
	await parent();

	redirect(308, chairGslUrl(params.slug, params.committeeSlug));
};
