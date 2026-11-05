/**
 * The page-aware address the GSL view needs (`specs/05-pages/chair/gsl.md`):
 * the page drawing it with the list footer's speaking time field open
 * (`?time=change`), which is how "Change" works without JavaScript. Two pages
 * draw the view, the live room (`chair`) while it is in formal debate and
 * `chair/gsl` always, so the link is built for the page the chair is on and
 * "Save" lands them back there. The view's own route is `chairGslUrl` in
 * `$lib/urls.ts`.
 *
 * `resolve()` from `$app/paths` builds an internal link from a route's id and
 * its parameters, and refuses a route that does not exist.
 */

import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';

/** The two pages that draw the GSL view: the live room and the view's own route. */
export type GslPage = 'chair' | 'gsl';

/**
 * The page drawing the view with the speaking time field open, `…?time=change`.
 * The list footer's "Change" links here, so it works without JavaScript.
 */
export function speakingTimeFieldUrl(
	conferenceSlug: string,
	committeeSlug: string,
	page: GslPage
): ResolvedPathname {
	const parameters = { slug: conferenceSlug, committeeSlug };

	if (page === 'gsl') {
		return resolve(
			'/conferences/[slug]/committees/[committeeSlug]/chair/gsl?time=change',
			parameters
		);
	}

	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair?time=change', parameters);
}
