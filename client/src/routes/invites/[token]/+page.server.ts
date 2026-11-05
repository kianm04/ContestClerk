/**
 * The page an invitation link lands on: `/invites/<token>`.
 *
 * The token in the address is the invitation's only secret, so it is never
 * written to a log, an error message or a notification here. It travels in the
 * address and in the form post and nowhere else.
 */

import { fail, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	destinationAfterAccepting,
	invitedToName,
	inviteProblem,
	type ChairedCommittee,
	type InviteView
} from '$lib/invites';
import { loginUrl, registerUrl } from '$lib/urls';
import { requireOnboarded } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import { acceptInvite, getInvite, listMyChairedCommittees } from '$lib/server/invites';
import type { Actions, PageServerLoad } from './$types';

/** What the page says when the token in the address matches no invitation. */
const NO_SUCH_INVITE_TEXT = 'This invite does not exist.';

/** What it says when the database turned down an invitation that looked fine here. */
const REFUSED_TEXT =
	'This invite could not be accepted. Ask the person who invited you for a new one.';

/**
 * The committees the reader chairs, which only an invitation to a role that
 * works per committee, naming a committee, needs: `destinationAfterAccepting` finds that committee among them
 * to send the new chair to its room. Every other invitation skips the query.
 */
async function chairedCommitteesFor(
	supabase: SupabaseClient,
	invite: InviteView,
	userId: string
): Promise<ChairedCommittee[]> {
	if (invite.roleScope !== 'committees' || invite.committeeName === null) {
		return [];
	}

	return listMyChairedCommittees(supabase, userId);
}

/**
 * Runs on the server before the page is rendered, and again after the action
 * below. Whatever it returns arrives in `+page.svelte` as `data`.
 *
 * The order of the three steps is the whole design of this page.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
	// The invitation is looked up before anybody is asked who they are. The
	// `get_invite` function is granted to `anon` for exactly this reason: what
	// it says about the token decides whether a signed-out visitor is sent to
	// create an account or to sign in. That is all a visitor gets from it: the
	// address an invitation was sent to is shown only to somebody signed in,
	// and never travels in a redirect.
	const invite = await getInvite(locals.supabase, params.token);

	// `getVerifiedClaims` is the only way server code asks who is signed in. It
	// checks the token the browser sent rather than believing it.
	const claims = await locals.getVerifiedClaims();

	if (!claims) {
		/*
			The way back here is `url.pathname`, which is this page's own address,
			and not `inviteUrl(params.token)`. `resolve()` answers a *relative*
			address while a page is being built on the server — `../invites/abc`
			rather than `/invites/abc` — and `safeRedirectPath`, which both helpers
			below run it through, throws away anything that does not start with a
			slash. So a `next` built by `resolve()` would silently vanish and
			nobody would come back to the invitation. `requireUser` builds its own
			`next` from `url.pathname` for the same reason.
		*/
		const wayBackHere = url.pathname;

		if (invite?.status === 'pending') {
			// An open invitation is usually to somebody with no account yet, so
			// they are sent to create one and brought back here once it exists.
			// Only the way back travels with them. The invited address used to
			// be put in the form for them, which handed it to whoever held the
			// link (security review L18); they type the address they were
			// invited at, and the page says so if it is the wrong one.
			redirect(303, registerUrl(wayBackHere));
		}

		// A token that matches nothing, or an invitation that has been used or
		// has run out, sends a signed-out visitor to the sign in page, and says
		// nothing at all about the token. "This invite does not exist." is for
		// somebody already signed in: telling a stranger which tokens exist is
		// the one thing keeping the token secret prevents.
		redirect(303, loginUrl(wayBackHere));
	}

	// `requireOnboarded` rather than `requireUser`. `05-pages/auth/invite.md`
	// says somebody who has not finished the welcome page is sent to
	// `/welcome?next=/invites/<token>` and comes back to accept afterwards,
	// which is exactly what this function does. `02-architecture/stack.md` used
	// to list this page beside `/logout` and `/settings`, the pages that skip
	// the gate, and now says why it does not: the exception this page really
	// needs is the signed-*out* one handled just above.
	const user = await requireOnboarded(locals, url);

	// `invite` may be `null`, which is the page's empty state.
	//
	// `now` is the moment the server rendered the page. The page needs it to
	// work out whether the invitation has expired, and reading the browser's
	// own clock there would let the server and the browser draw two different
	// pages from the same invitation.
	return { invite, myEmail: user.email, now: new Date().toISOString() };
};

export const actions: Actions = {
	/**
	 * Join the organisation or the conference team this invitation is for.
	 *
	 * It is the page's only action; "Not now" is a plain link.
	 */
	accept: async ({ params, url, cookies, locals }) => {
		// A form action is its own request, so the gate is asked again rather
		// than trusted from whenever `load` last ran.
		const user = await requireOnboarded(locals, url);
		const invite = await getInvite(locals.supabase, params.token);

		if (!invite) {
			// `fail` sends the page back with this status and this result as
			// `form`. `load` runs again with it, finds nothing again, and the page
			// draws its empty state.
			return fail(404, { message: NO_SUCH_INVITE_TEXT });
		}

		// This check is only about the words. `accept_invite` in the database
		// refuses a mismatched address, an expired invitation and a used one on
		// its own, and that refusal is the real guard; what it cannot do is say
		// which of the three it was in a sentence the reader can act on.
		const problem = inviteProblem(invite, user.email, new Date());

		if (problem) {
			return fail(400, { problem });
		}

		const isAccepted = await acceptInvite(locals.supabase, params.token);

		if (!isAccepted) {
			return fail(400, { message: REFUSED_TEXT });
		}

		// Read after accepting, because the new chair's row is what accepting
		// has just written.
		const chairedCommittees = await chairedCommitteesFor(locals.supabase, invite, user.id);

		// A redirecting action cannot return anything, so the message travels in
		// a one-shot cookie that the root layout reads and throws away.
		setFlash(cookies, { tone: 'success', message: `You joined ${invitedToName(invite)}.` });
		redirect(303, destinationAfterAccepting(invite, chairedCommittees));
	}
};
