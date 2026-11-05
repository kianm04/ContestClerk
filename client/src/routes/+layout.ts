import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import type { LayoutLoad } from './$types';

/**
 * A "universal" load function: unlike `+layout.server.ts` next to it, this one
 * runs on the server for the first page view and then in the browser for every
 * navigation after that. It exists to give components a Supabase client that
 * works in either place.
 *
 * `data` is whatever `+layout.server.ts` returned.
 */
export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	// The same label as in `+layout.server.ts`, so that one call to
	// `invalidate('supabase:auth')` in `+layout.svelte` re-runs both of them
	// when the visitor signs in or out.
	depends('supabase:auth');

	// In the browser the client reads the session straight from `document.cookie`.
	// On the server there is no such thing, so it is handed the cookies that
	// `+layout.server.ts` read off the request instead.
	//
	// The cookies the browser client writes itself, such as a refreshed session,
	// carry `Secure` wherever the site is served over https, so a plain-http
	// request can never carry the session along (security review L40). Local
	// development runs over plain http, where a browser drops a `Secure` cookie,
	// so the flag follows the page's own protocol. `sameSite: 'lax'` is what the
	// library does anyway, said out loud: the cookie is not sent on requests
	// another website starts.
	const supabase = isBrowser()
		? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
				global: { fetch },
				cookieOptions: { sameSite: 'lax', secure: window.location.protocol === 'https:' }
			})
		: createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
				global: { fetch },
				cookies: { getAll: () => data.cookies }
			});

	// Everything except the client itself is passed straight through from the
	// server. `claims` was already confirmed there by Supabase, and nothing
	// re-checks it here. Whatever this function returns is what the layout and
	// every page see as `data`, so anything left out here never reaches them.
	return {
		supabase,
		claims: data.claims,
		person: data.person,
		bellNotifications: data.bellNotifications,
		unreadCount: data.unreadCount,
		hasOrganiserArea: data.hasOrganiserArea,
		hasApplications: data.hasApplications,
		flash: data.flash,
		now: data.now
	};
};
