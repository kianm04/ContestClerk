import type { PageServerLoad } from './$types';

/**
 * Runs on the server before the page is rendered. Whatever it returns arrives
 * in `+page.svelte` as `data`.
 *
 * The page is public and nobody is turned away. Somebody who is already signed
 * in sees exactly the same page with no redirect. It asks who is signed in only
 * because that decides where "Create a conference" and "Run a quick session"
 * go: straight there, or through sign up first.
 *
 * It returns no `shareImageUrl`: the page's pictures are drawn rather than
 * photographed, so there is no one picture to share, and `PageMeta` leaves the
 * tag out when it is given none.
 */
export const load: PageServerLoad = async ({ locals: { getVerifiedClaims } }) => {
	const claims = await getVerifiedClaims();

	return { isSignedIn: claims !== null };
};
