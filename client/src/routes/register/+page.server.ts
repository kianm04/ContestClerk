import { fail, redirect } from '@sveltejs/kit';
import {
	destinationAfterAuth,
	safeRedirectPath,
	SIGN_UP_REFUSED_TEXT,
	validateEmail,
	validateFullName,
	validatePassword,
	type AuthMessage,
	type RegisterFormResult
} from '$lib/auth';
import { signedInHomeUrl, welcomeUrl } from '$lib/urls';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { getVerifiedClaims } }) => {
	const claims = await getVerifiedClaims();

	// The page the visitor was heading for when they were asked to sign up. It is
	// checked here, where it comes in, so that everything downstream of `load`
	// is working with an address that points inside this site. `safeRedirectPath`
	// answers `/` for anything else, which every reader of `next` treats as
	// "nowhere in particular".
	const next = safeRedirectPath(url.searchParams.get('next'));

	// Nobody needs to create an account while they are already logged in.
	if (claims) {
		redirect(303, destinationAfterAuth(next, signedInHomeUrl()));
	}

	// An invite link puts the address it was sent to in `?email=`, so the person
	// does not have to type it. They may still change it.
	return { next, email: url.searchParams.get('email') ?? '' };
};

export const actions: Actions = {
	/**
	 * An unnamed action, because there is only one form on this page. A plain
	 * `<form method="post">` with no `action` attribute posts to this.
	 */
	default: async ({ request, url, locals: { supabase } }) => {
		const formData = await request.formData();
		const fullName = String(formData.get('fullName') ?? '');
		const email = String(formData.get('email') ?? '');
		const password = String(formData.get('password') ?? '');
		const next = String(formData.get('next') ?? '');

		// A ticked box sends the word `on`; an unticked one sends nothing at all.
		const hasAgreed = formData.get('agree') !== null;

		const problem =
			validateFullName(fullName) ??
			validateEmail(email) ??
			validatePassword(password) ??
			(hasAgreed ? null : 'Please agree to the terms to continue.');

		if (problem) {
			// `fail` sends the page back with a 400 status and this result as `form`.
			return fail(400, buildResult(fullName, email, { text: problem, isSuccess: false }, false));
		}

		// Where the link in the confirmation email brings the visitor back to.
		// `url.origin` is this site, so it works in development and in production
		// without anybody editing it.
		const confirmPath = destinationAfterAuth(next, welcomeUrl());
		const emailRedirectTo = `${url.origin}/auth/confirm?next=${encodeURIComponent(confirmPath)}`;

		const { data, error } = await supabase.auth.signUp({
			email,
			password,
			// `full_name` is copied into `profiles.full_name` by the
			// `handle_new_user` trigger the moment the account is created.
			options: { data: { full_name: fullName.trim() }, emailRedirectTo }
		});

		if (error) {
			// Supabase's own wording is not shown: `03-design/writing-style.md`
			// asks for a sentence the visitor can act on instead. With email
			// confirmation off Supabase refuses an address that already has an
			// account, so the answer offers the way to log in, without saying
			// whether that was the reason (`05-pages/auth/register.md`).
			const refusal = { text: SIGN_UP_REFUSED_TEXT, isSuccess: false };

			return fail(400, buildResult(fullName, email, refusal, true));
		}

		// If the Supabase project has email confirmation turned off, signing up
		// signs you straight in and there is a session to prove it.
		if (data.session) {
			redirect(303, confirmPath);
		}

		// Otherwise say the same thing whether or not that address already has an
		// account. Supabase deliberately does not tell us which it was, so that
		// this page cannot be used to find out who has registered. Somebody who
		// already has one gets no email to wait for, which is why the answer also
		// offers "Log in instead".
		const almostDone = {
			text: `Almost done. Open the confirmation link we sent to ${email}.`,
			isSuccess: true
		};

		return buildResult(fullName, email, almostDone, true);
	}
};

/** What the page needs to draw the form again, or to replace it with the good news. */
function buildResult(
	fullName: string,
	email: string,
	message: AuthMessage,
	offersLogIn: boolean
): RegisterFormResult {
	return { fullName, email, message, offersLogIn };
}
