import { fail, redirect } from '@sveltejs/kit';
import {
	describeSignInError,
	destinationAfterAuth,
	safeRedirectPath,
	UNEXPECTED_ERROR_TEXT,
	type AuthFormResult
} from '$lib/auth';
import { signedInHomeUrl } from '$lib/urls';
import type { Actions, PageServerLoad } from './$types';

/**
 * What `/auth/confirm` puts in the address when it confirmed somebody's email
 * while they were not signed in, so this page can congratulate them.
 */
const CONFIRMED_MESSAGE = 'confirmed';

export const load: PageServerLoad = async ({ url, locals: { getVerifiedClaims } }) => {
	const claims = await getVerifiedClaims();

	// The page the visitor was heading for when they were asked to sign in. It is
	// checked here, where it comes in, so that everything downstream of `load`
	// is working with an address that points inside this site. `safeRedirectPath`
	// answers `/` for anything else, which every reader of `next` treats as
	// "nowhere in particular".
	const next = safeRedirectPath(url.searchParams.get('next'));

	// Nobody needs a login page while they are already logged in.
	if (claims) {
		redirect(303, destinationAfterAuth(next, signedInHomeUrl()));
	}

	return {
		next,
		hasConfirmedEmail: url.searchParams.get('message') === CONFIRMED_MESSAGE
	};
};

export const actions: Actions = {
	/**
	 * An unnamed action, because there is only one form on this page. A plain
	 * `<form method="post">` with no `action` attribute posts to this.
	 *
	 * All of this runs on the server, which is the point: the password goes from
	 * here to Supabase and never through any script in the browser, and
	 * `locals.supabase` writes the session into cookies on the response. Those
	 * cookies are not hidden from the page's own JavaScript, because the browser
	 * client in `src/routes/+layout.ts` reads the session out of them; what guards
	 * them is `sameSite` and, over https, `Secure` (see `src/hooks.server.ts` and
	 * that layout).
	 */
	default: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = String(formData.get('email') ?? '');
		const password = String(formData.get('password') ?? '');
		const next = String(formData.get('next') ?? '');

		const { error } = await supabase.auth.signInWithPassword({ email, password });

		if (error) {
			const result: AuthFormResult = {
				email,
				message: {
					text: describeSignInError(error.code, UNEXPECTED_ERROR_TEXT),
					isSuccess: false
				}
			};

			// `fail` sends the page back with a 400 status and this result as `form`.
			// Only the address comes back: a password is never echoed to a screen.
			return fail(400, result);
		}

		// The session cookie was set by `supabase` above, through the cookie
		// handlers in `src/hooks.server.ts`.
		redirect(303, destinationAfterAuth(next, signedInHomeUrl()));
	}
};
