import { redirect } from '@sveltejs/kit';
import {
	describeEmailLink,
	destinationAfterAuth,
	parseEmailLinkType,
	type AuthErrorReason,
	type EmailLinkType
} from '$lib/auth';
import {
	accountSettingsUrl,
	authErrorUrl,
	loginConfirmedUrl,
	resetPasswordUrl,
	welcomeUrl
} from '$lib/urls';
import type { Actions, PageServerLoad } from './$types';

/**
 * Where every link Supabase emails us lands: the "confirm your address" link
 * after signing up, the "choose a new password" link after asking for a reset,
 * and the link that confirms a new email address.
 *
 * There are two shapes of link, and which one arrives depends on the email
 * templates in the Supabase dashboard:
 *
 * - `?token_hash=...&type=...` is the recommended one. We verify it ourselves,
 *   which means the link also works when it is opened on a different device
 *   from the one that asked for it. Use this template:
 *   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/welcome`
 * - `?code=...` is what the default templates produce. Supabase has already
 *   verified it and we swap the code for a session.
 *
 * A `token_hash` link is not acted on by opening it. Opening a link is a GET,
 * and anything that fetches links in the background, such as a mail client
 * drawing previews, or a page another website put the address on, would
 * consume the token and sign that browser in (security review L42). So `load`
 * draws one button, and the button's post is what verifies the token. A `code`
 * link needs no such step: the code only works with a verifier cookie that the
 * browser which asked for it holds.
 *
 * Either way the visitor ends up signed in, then goes on to `next`. A link that
 * worked but left them without a session goes to the sign in page instead, which
 * says the address is confirmed and asks them to log in.
 */
export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	const tokenHash = url.searchParams.get('token_hash');
	const type = parseEmailLinkType(url.searchParams.get('type'));
	const code = url.searchParams.get('code');

	if (tokenHash && type) {
		// Nothing is checked yet. The words name what the one button will do.
		return describeEmailLink(type);
	}

	if (code) {
		const { data, error } = await supabase.auth.exchangeCodeForSession(code);

		if (error) {
			redirect(303, authErrorUrl(reasonForError(error.code)));
		}

		// A `code` link carries no type, so it goes where a sign up link goes.
		const next = destinationAfterAuth(url.searchParams.get('next'), defaultPathForLinkType(null));

		redirect(303, data.session ? next : loginConfirmedUrl());
	}

	// The link carried neither a token nor a code, so there is nothing to check.
	redirect(303, authErrorUrl('invalid'));
};

export const actions: Actions = {
	/**
	 * The button on a `token_hash` link. An unnamed action, because there is only
	 * one form on this page: a plain `<form method="post">` with no `action`
	 * attribute posts back to the address the link opened, so the token and the
	 * type are read from the query string here just as `load` read them.
	 */
	default: async ({ url, locals: { supabase } }) => {
		const tokenHash = url.searchParams.get('token_hash');
		const type = parseEmailLinkType(url.searchParams.get('type'));

		if (!tokenHash || !type) {
			redirect(303, authErrorUrl('invalid'));
		}

		// Where to go when the link carried no `next` of its own, which depends on
		// what the link was for.
		const next = destinationAfterAuth(url.searchParams.get('next'), defaultPathForLinkType(type));

		const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

		if (error) {
			redirect(303, authErrorUrl(reasonForError(error.code)));
		}

		redirect(303, data.session ? next : loginConfirmedUrl());
	}
};

/**
 * Where each kind of email link goes when it names no page of its own.
 *
 * A `?code=` link carries no type at all, and those are sign-up confirmations
 * far more often than anything else, so they go the same way as `signup`.
 */
function defaultPathForLinkType(type: EmailLinkType | null): string {
	if (type === 'recovery') {
		return resetPasswordUrl();
	}

	if (type === 'email_change') {
		return accountSettingsUrl();
	}

	return welcomeUrl();
}

/**
 * Which of the `/auth/error` reasons to show. Supabase says `otp_expired` when
 * the link is simply too old, which is worth explaining; anything else we
 * cannot tell apart from a link that was copied wrongly.
 */
function reasonForError(code: string | undefined): AuthErrorReason {
	return code === 'otp_expired' ? 'expired' : 'invalid';
}
