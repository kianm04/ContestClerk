import { fail, redirect } from '@sveltejs/kit';
import {
	validateCurrentPassword,
	validateDeleteConfirmation,
	validateEmailChange,
	validateNewPassword,
	type SettingsMessage
} from '$lib/accounts';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import { accountSettingsUrl, landingUrl } from '$lib/urls';
import { requireUser } from '$lib/server/access';
import {
	changeMyEmail,
	changeMyPassword,
	createThrowawayAuthClient,
	deleteMyAccount,
	endThrowawaySession,
	isMyCurrentPassword,
	signInAgain,
	readPendingEmailChange
} from '$lib/server/accounts';
import { setFlash } from '$lib/server/flash';
import { listMyOwnerships } from '$lib/server/organizations';
import type { Actions, PageServerLoad } from './$types';

/** What the page says once the account is gone, on the front page it lands on. */
const DELETED_FLASH = 'Your account was deleted.';

/** What both password-guarded cards say when the current password was wrong. */
const WRONG_PASSWORD_TEXT = 'Your current password is not right.';

/** A message for one of the three cards, ready to be returned from an action. */
function messageFor(
	card: SettingsMessage['card'],
	tone: SettingsMessage['tone'],
	text: string
): SettingsMessage {
	return { card, tone, text };
}

/**
 * Runs on the server before the page is rendered, and again after every action
 * on it, so the address and the pending change below are never stale. Whatever
 * it returns arrives in `+page.svelte` as `data`.
 *
 * `requireUser` rather than `requireOnboarded`:
 * `02-architecture/auth-and-onboarding.md` makes this page one of the
 * exceptions to the onboarding gate, so that somebody stuck on the welcome form
 * with the wrong email address can still change it or leave.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const user = await requireUser(locals, url);

	// Neither answer needs the other, so both start at once.
	const [pendingEmail, soleOwnerships] = await Promise.all([
		readPendingEmailChange(locals.supabase),
		listMyOwnerships(locals.supabase, user.id)
	]);

	return { email: user.email, pendingEmail, soleOwnerships };
};

export const actions: Actions = {
	/**
	 * Ask for a different email address.
	 *
	 * Nothing changes here and now: Supabase keeps the new address to one side
	 * and sends a link to it, and the address only moves once that link is
	 * opened. That is why the page says "check your inbox" rather than "changed".
	 */
	changeEmail: async ({ request, url, locals }) => {
		const user = await requireUser(locals, url);

		const formData = await request.formData();
		const email = String(formData.get('email') ?? '');
		const problem = validateEmailChange(email, user.email);

		if (problem) {
			// `fail` sends the page back with a 400 status and this result as
			// `form`, so the field keeps what was typed and shows the message.
			return fail(400, { message: messageFor('email', 'error', problem), email });
		}

		// Where the link in the confirmation email brings the person back to.
		// `url.origin` is this site, so it works in development and in production
		// without anybody editing it.
		const confirmUrl = `${url.origin}/auth/confirm?next=${encodeURIComponent(accountSettingsUrl())}`;
		const refusal = await changeMyEmail(locals.supabase, email, confirmUrl);

		if (refusal) {
			// `05-pages/delegate/settings.md` asks for Supabase's own message here.
			// It is the one that says something worth acting on, such as the
			// address already belonging to another account.
			return fail(400, { message: messageFor('email', 'error', refusal), email });
		}

		return {
			message: messageFor('email', 'success', `Check ${email} for a link to confirm the change.`)
		};
	},

	/**
	 * Choose a different password.
	 *
	 * The current password is asked for and checked, so that somebody who walks
	 * up to an unlocked laptop cannot take the account over. No password is ever
	 * sent back to the page, so all three fields come back empty.
	 */
	changePassword: async ({ request, url, locals }) => {
		const user = await requireUser(locals, url);

		const formData = await request.formData();
		const currentPassword = String(formData.get('currentPassword') ?? '');
		const newPassword = String(formData.get('newPassword') ?? '');
		const repeatPassword = String(formData.get('repeatPassword') ?? '');

		const problem =
			validateCurrentPassword(currentPassword) ?? validateNewPassword(newPassword, repeatPassword);

		if (problem) {
			return fail(400, { message: messageFor('password', 'error', problem) });
		}

		// Checked after the cheap rules above, because it is a network call, and
		// before the change itself, because it is what permits the change. The
		// sign-in that does the checking happens on a client of its own, so the
		// visitor's session cookies are not rewritten by it (security review L43).
		const isRight = await isMyCurrentPassword(
			createThrowawayAuthClient(),
			user.email,
			currentPassword
		);

		if (!isRight) {
			return fail(400, { message: messageFor('password', 'error', WRONG_PASSWORD_TEXT) });
		}

		const refusal = await changeMyPassword(locals.supabase, newPassword);

		if (refusal) {
			return fail(400, { message: messageFor('password', 'error', UNEXPECTED_ERROR_TEXT) });
		}

		// This action stays on its own page, so the message travels back in the
		// result rather than in a cookie: the root layout shows whatever arrives
		// as `flash` in `page.form`.
		return { flash: { tone: 'success' as const, message: 'Password changed.' } };
	},

	/**
	 * Delete the account for good.
	 *
	 * Four things stand in the way. The word DELETE has to be typed, so that this
	 * cannot happen by accident; the current password has to be right, so that
	 * somebody at an unlocked laptop cannot do it either (security review L43);
	 * the database wants a sign-in less than fifteen minutes old, so that a
	 * session left open on a shared machine cannot end the account on its own,
	 * which the page meets by signing in again with that password; and the
	 * database refuses while the person is the only owner of an organisation or
	 * the only head of a live delegation, because each must keep one.
	 */
	deleteAccount: async ({ request, cookies, url, locals }) => {
		const user = await requireUser(locals, url);

		const formData = await request.formData();
		const confirmation = String(formData.get('confirmation') ?? '');
		const currentPassword = String(formData.get('currentPassword') ?? '');
		const problem =
			validateDeleteConfirmation(confirmation) ?? validateCurrentPassword(currentPassword);

		if (problem) {
			return fail(400, { message: messageFor('delete', 'error', problem) });
		}

		// The password is checked by signing in with it on a client of its own,
		// as the password card does, but this sign-in is kept: the deletion is
		// asked through it, because `delete_my_account()` refuses a sign-in older
		// than fifteen minutes and the one in the visitor's cookies may be days
		// old. `signInAgain` in `$lib/server/accounts.ts` says more. The password
		// itself is never sent back to the page.
		const freshlySignedIn = createThrowawayAuthClient();
		const isRight = await signInAgain(freshlySignedIn, user.email, currentPassword);

		if (!isRight) {
			return fail(400, { message: messageFor('delete', 'error', WRONG_PASSWORD_TEXT) });
		}

		const refusal = await deleteMyAccount(freshlySignedIn);

		if (refusal) {
			await endThrowawaySession(freshlySignedIn);

			// Sole ownership is explained by the page itself: `load` runs again
			// after this and puts the warning naming each organisation back, so the
			// only thing left to say is that nothing happened.
			const soleOwnerships = await listMyOwnerships(locals.supabase, user.id);

			if (soleOwnerships.length > 0) {
				return fail(400, {
					message: messageFor('delete', 'warning', 'Your account was not deleted.')
				});
			}

			// The database's other refusals are written for this card: each names
			// what stands in the way and the way past it, such as the delegation
			// the person is the only head of. Anything else is a fault of ours and
			// gets the same apology every form gives.
			if (refusal.kind === 'refused') {
				return fail(400, { message: messageFor('delete', 'warning', refusal.message) });
			}

			return fail(400, { message: messageFor('delete', 'error', UNEXPECTED_ERROR_TEXT) });
		}

		// The account is gone, so the session cookies have to go with it. A sign
		// out that failed still sends the visitor away, exactly as `/logout` does.
		await locals.supabase.auth.signOut();

		// A redirecting action cannot return anything, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(cookies, { tone: 'success', message: DELETED_FLASH });
		redirect(303, landingUrl());
	}
};
