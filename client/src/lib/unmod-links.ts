/**
 * The page-aware address the Unmod view needs (`specs/05-pages/chair/unmod.md`,
 * "The list beside it"): the page drawing it with the speaking time field of
 * "After the caucus" open (`?time=change`), which is how the list footer's
 * "Change" works without JavaScript. Two pages draw the view, `chair/unmod`
 * and the live room while an unmoderated caucus runs, so the link is built
 * for the page the chair is on. The GSL view's own is `$lib/gsl-links.ts`.
 *
 * `resolve()` from `$app/paths` builds an internal link from a route's id and
 * its parameters, and refuses a route that does not exist.
 */

import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import { speakingTimeFieldUrl } from '$lib/gsl-links';

/** The two pages that draw the Unmod view: the live room and the view's own route. */
export type UnmodPage = 'chair' | 'unmod';

/** The page drawing the Unmod view with the speaking time field open, `…?time=change`. */
export function unmodTimeFieldUrl(
	conferenceSlug: string,
	committeeSlug: string,
	page: UnmodPage
): ResolvedPathname {
	if (page === 'chair') return speakingTimeFieldUrl(conferenceSlug, committeeSlug, 'chair');

	return resolve('/conferences/[slug]/committees/[committeeSlug]/chair/unmod?time=change', {
		slug: conferenceSlug,
		committeeSlug
	});
}
