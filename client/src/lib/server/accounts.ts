/**
 * The three things `/settings` does to an account: change its email address,
 * change its password, and delete it.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the Supabase client as its first argument, and the page passes in
 * `locals.supabase`, the client that reads and writes this visitor's own auth
 * cookies. That is what makes "the signed-in person" the account being changed:
 * none of these functions is told a user id, because none of them may change
 * anybody else's account.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

/**
 * The address the person has asked to move to but has not confirmed yet, or
 * `null` when there is no change waiting.
 *
 * This is the one place in the app allowed to call `auth.getUser()`, which asks
 * Supabase over the network rather than reading the signed token the browser
 * sent. `02-architecture/auth-and-onboarding.md` names the exception and the
 * reason: a pending address is not in the token's claims, so there is no other
 * way to see it.
 */
export async function readPendingEmailChange(supabase: SupabaseClient): Promise<string | null> {
	const { data, error } = await supabase.auth.getUser();

	// Nobody signed in, or Supabase could not be reached. Neither is worth
	// stopping the page for: the line about a pending change is extra
	// information, and the rest of the page works without it.
	if (error || !data.user) {
		return null;
	}

	// `new_email` is empty text rather than missing when there is no change
	// waiting, so both are turned into the same "nothing to say".
	return data.user.new_email || null;
}

/**
 * Ask Supabase to send a confirmation link to a new address.
 *
 * Nothing changes until the person opens that link: Supabase keeps the address
 * as `new_email` until then, which is what `readPendingEmailChange` above
 * reports. `confirmUrl` is where the link brings them back to, and is built by
 * the page from `url.origin` so that it works in development and in production
 * without anybody editing it.
 *
 * Returns Supabase's own message when it refuses, or `null` when the email is
 * on its way. `05-pages/delegate/settings.md` asks for that message to be shown
 * under the field, because it is the one that says something the person can act
 * on, such as the address already belonging to another account.
 */
export async function changeMyEmail(
	supabase: SupabaseClient,
	newEmail: string,
	confirmUrl: string
): Promise<string | null> {
	const { error } = await supabase.auth.updateUser(
		{ email: newEmail },
		{ emailRedirectTo: confirmUrl }
	);

	return error ? error.message : null;
}

/**
 * A Supabase client with nobody signed in and nowhere to keep a session: it
 * holds whatever it signs in only in memory, for as long as the request lasts.
 *
 * `isMyCurrentPassword` below signs in on one of these rather than on
 * `locals.supabase`, the client that reads and writes the visitor's cookies.
 * A sign-in on that one writes the session cookies afresh, so the check and the
 * visitor's real session stay apart (security review L43). It uses the same
 * publishable key as every other client, so Row Level Security treats it as it
 * treats a visitor; nothing here is the service role.
 */
export function createThrowawayAuthClient(): SupabaseClient {
	return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}

/**
 * Is this really the password on the account?
 *
 * There is no "check this password" call in Supabase, so signing in with it is
 * the check: it either works or it does not. `throwawayClient` comes from
 * `createThrowawayAuthClient` above, so the sign-in touches nothing the visitor
 * is holding; the page passes it in rather than this function making one, so
 * a test can hand over a stand-in.
 *
 * This runs before the password is changed, so that somebody at an unlocked
 * laptop cannot change it; deleting the account checks the password with
 * `signInAgain` instead.
 */
export async function isMyCurrentPassword(
	throwawayClient: SupabaseClient,
	email: string,
	password: string
): Promise<boolean> {
	const { data, error } = await throwawayClient.auth.signInWithPassword({ email, password });

	if (error) {
		return false;
	}

	// The check minted a session on Supabase's side as well, and it is not wanted.
	if (data.session) {
		await endThrowawaySession(throwawayClient);
	}

	return true;
}

/**
 * Sign the person in again with their current password, on `throwawayClient`,
 * and keep the session that makes. Answers whether the password was right.
 *
 * Deleting the account needs this rather than `isMyCurrentPassword`.
 * `delete_my_account()` asks how long ago the session behind its own request
 * was signed in, and refuses anything older than fifteen minutes (security
 * review L43). The session in the visitor's cookies is often days old; the one
 * made here is seconds old and is the same person, so the page asks for the
 * deletion through `throwawayClient` afterwards. When the account is kept, the
 * page ends this session with `endThrowawaySession`.
 */
export async function signInAgain(
	throwawayClient: SupabaseClient,
	email: string,
	password: string
): Promise<boolean> {
	const { data, error } = await throwawayClient.auth.signInWithPassword({ email, password });

	return !error && data.session !== null;
}

/**
 * End the session a sign-in on a throwaway client made, and only that one.
 *
 * Revoking it keeps the account's list of sessions honest. `local` names only
 * this session, where the default `global` would end the visitor's real one
 * too. It never throws: a revocation that fails changes nothing the person
 * asked for, and the session lapses on its own.
 */
export async function endThrowawaySession(throwawayClient: SupabaseClient): Promise<void> {
	try {
		await throwawayClient.auth.signOut({ scope: 'local' });
	} catch {
		// Nothing to do: the session will lapse on its own.
	}
}

/**
 * Save a new password for the signed-in person.
 *
 * Returns Supabase's own message when it refuses, or `null` when the password
 * is saved. The caller decides what to show; `03-design/writing-style.md` asks
 * for our own wording rather than a raw error, and the page's own checks have
 * already caught everything a person can do something about.
 */
export async function changeMyPassword(
	supabase: SupabaseClient,
	newPassword: string
): Promise<string | null> {
	const { error } = await supabase.auth.updateUser({ password: newPassword });

	return error ? error.message : null;
}

/**
 * PostgreSQL's code for an exception a function raised on purpose with
 * `raise exception`: "P0001", which it calls `raise_exception`. Every refusal
 * in `delete_my_account()` is raised that way, in a sentence written to be read
 * by the person, and the code is what tells those apart from a failure nobody
 * planned for, such as the database being unreachable.
 */
const DELIBERATE_REFUSAL_CODE = 'P0001';

/**
 * Why the account was not deleted.
 *
 * A `refused` deletion is the database saying no on purpose: the person is the
 * only owner of an organisation or the only head of a delegation, or they
 * signed in too long ago. Its `message` is the function's own sentence, which
 * names what stands in the way and is written for the screen. A `failed` one is
 * anything else, and its message is for the log.
 */
export type DeletionRefusal = {
	kind: 'refused' | 'failed';
	message: string;
};

/**
 * Delete the signed-in person's account for good.
 *
 * The app may not touch `auth.users`, so this calls the `delete_my_account()`
 * function in the database, which runs as its owner and does it. Deleting the
 * account cascades to the profile, the memberships, the applications and the
 * notifications, and takes the invitations waiting for the person with it;
 * seats and invoices keep their row and forget the person.
 *
 * The database refuses while the person is the only owner of an organisation
 * or the only head of a live delegation, because each must keep one, and when
 * they signed in more than fifteen minutes ago, so that a session left open or
 * stolen cannot end the account on its own. Returns why in those cases, or
 * `null` when the account is gone.
 */
export async function deleteMyAccount(supabase: SupabaseClient): Promise<DeletionRefusal | null> {
	const { error } = await supabase.rpc('delete_my_account');

	if (!error) {
		return null;
	}

	return {
		kind: error.code === DELIBERATE_REFUSAL_CODE ? 'refused' : 'failed',
		message: error.message
	};
}
