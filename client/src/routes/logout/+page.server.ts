import { redirect } from '@sveltejs/kit';
import { setFlash } from '$lib/server/flash';
import { getShellProfile } from '$lib/server/profiles';
import { landingUrl, loginUrl } from '$lib/urls';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getVerifiedClaims } }) => {
	const claims = await getVerifiedClaims();

	// Nobody can log out while they are already logged out.
	if (!claims) {
		redirect(303, loginUrl());
	}

	const email = String(claims.email ?? '');
	const profile = await getShellProfile(supabase, String(claims.sub));

	// The card says whose account is about to be logged out. An account made
	// before the `handle_new_user` trigger existed has no profile row, and the
	// address is the best name we have for it.
	return { email, fullName: profile?.fullName ?? email, avatarPath: profile?.avatarPath ?? null };
};

/**
 * This page has only one action, so it is called `default` and the form on the
 * page needs no `action` attribute.
 *
 * Logging out is a POST rather than a plain link on purpose. If it were a link,
 * a browser quietly fetching links in the background could log somebody out
 * without them asking.
 */
export const actions: Actions = {
	default: async ({ cookies, locals: { supabase } }) => {
		// This clears the session cookies through the handlers in `src/hooks.server.ts`.
		// A sign out that failed still sends the visitor away: the layout's auth
		// listener puts the header right again on the next request.
		await supabase.auth.signOut();

		// A redirecting action cannot return anything, so the message travels in
		// a one-shot cookie the root layout reads on the next request.
		setFlash(cookies, { tone: 'info', message: 'You are logged out.' });

		redirect(303, landingUrl());
	}
};
