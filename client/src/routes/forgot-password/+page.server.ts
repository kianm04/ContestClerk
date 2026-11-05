import { fail, redirect } from '@sveltejs/kit';
import { validateEmail, type AuthMessage } from '$lib/auth';
import { accountSettingsUrl, resetPasswordUrl } from '$lib/urls';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { getVerifiedClaims } }) => {
	const claims = await getVerifiedClaims();

	// Somebody already signed in does not need an email to change their
	// password; the settings page lets them do it straight away.
	if (claims) {
		redirect(303, accountSettingsUrl());
	}

	// Carried through so that choosing a new password still ends on the page the
	// visitor was heading for.
	return { next: url.searchParams.get('next') ?? '' };
};

export const actions: Actions = {
	// An unnamed action, because there is only one form on this page. A plain
	// `<form method="post">` with no `action` attribute posts to this.
	default: async ({ request, url, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = String(formData.get('email') ?? '');

		const problem = validateEmail(email);

		if (problem) {
			const message: AuthMessage = { text: problem, isSuccess: false };

			return fail(400, { email, message });
		}

		// Where the link in the email brings the visitor back to. It is always the
		// page that asks for the new password, never wherever they were heading
		// before: following the link signs them in, and anywhere else would leave
		// the password they came to change exactly as it was.
		const redirectTo = `${url.origin}/auth/confirm?next=${encodeURIComponent(resetPasswordUrl())}`;

		// The result is deliberately ignored. Telling the visitor "no account has
		// that address" would let anybody use this form to find out who has
		// registered, so the answer below is the same either way.
		await supabase.auth.resetPasswordForEmail(email, { redirectTo });

		const message: AuthMessage = {
			text: 'If that address has an account, a link to choose a new password is on its way.',
			isSuccess: true
		};

		return { email, message };
	}
};
