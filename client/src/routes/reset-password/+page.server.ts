import { fail, redirect, type Cookies } from '@sveltejs/kit';
import type { JwtPayload } from '@supabase/supabase-js';
import { passwordRecoveryState, validatePassword, type AuthMessage } from '$lib/auth';
import { setFlash } from '$lib/server/flash';
import { forgotPasswordUrl, signedInHomeUrl } from '$lib/urls';
import type { Actions, PageServerLoad } from './$types';

/** What `/forgot-password` says to somebody whose reset link was opened too long ago. */
const STALE_LINK_MESSAGE = 'That reset link has run out. Ask for a new one.';

/**
 * The verified claims of a session that opened a reset link in the last fifteen
 * minutes, or a redirect away from this page. `redirect` throws, so this either
 * returns real claims or never returns at all.
 *
 * You reach this page by pressing the button on the link in the reset email,
 * which signs you in (`src/routes/auth/confirm/+page.server.ts`). A session is
 * not enough on its own, though: anyone signed in with their password has a
 * session too, and letting them set a new password here would skip the current
 * one that `/settings` asks for (security review L37). `passwordRecoveryState`
 * reads how and when the session was signed in.
 */
async function requireRecentResetLink(locals: App.Locals, cookies: Cookies): Promise<JwtPayload> {
	const claims = await locals.getVerifiedClaims();

	// No session means the visitor came here some other way and needs a link.
	if (!claims) {
		redirect(303, forgotPasswordUrl());
	}

	const recovery = passwordRecoveryState(claims.amr, new Date());

	if (recovery === 'recent') {
		return claims;
	}

	if (recovery === 'stale') {
		// The link was opened, but too long ago. The session it made is still
		// live and can do nothing useful now, so it ends here, and the person is
		// told why on the page that sends a new link.
		await locals.supabase.auth.signOut();
		setFlash(cookies, { tone: 'warning', message: STALE_LINK_MESSAGE });
	}

	// A session that never came from a reset link stays signed in and goes the
	// same way: `/forgot-password` sends somebody signed in on to `/settings`,
	// where the password form asks for the current one.
	redirect(303, forgotPasswordUrl());
}

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const claims = await requireRecentResetLink(locals, cookies);

	// The heading says whose password is about to change, so that somebody with
	// two accounts can see they are on the right one.
	return { email: String(claims.email ?? '') };
};

export const actions: Actions = {
	default: async ({ request, cookies, locals }) => {
		// Checked again here, because a form action is its own request: the check
		// in `load` above says nothing about who is posting this form.
		await requireRecentResetLink(locals, cookies);

		const formData = await request.formData();
		const password = String(formData.get('password') ?? '');
		const confirmation = String(formData.get('confirmPassword') ?? '');

		const problem = validatePassword(password);

		if (problem) {
			const message: AuthMessage = { text: problem, isSuccess: false };

			// Neither password comes back: a password is never echoed to a screen.
			return fail(400, { message });
		}

		if (password !== confirmation) {
			const message: AuthMessage = { text: 'The two passwords do not match.', isSuccess: false };

			return fail(400, { message });
		}

		// `updateUser` changes the password of whoever the session belongs to.
		const { error } = await locals.supabase.auth.updateUser({ password });

		if (error) {
			const message: AuthMessage = { text: error.message, isSuccess: false };

			return fail(400, { message });
		}

		// A redirecting action cannot return anything, so the message travels in
		// a one-shot cookie the root layout reads on the next request.
		setFlash(cookies, { tone: 'success', message: 'Your password is saved.' });

		redirect(303, signedInHomeUrl());
	}
};
