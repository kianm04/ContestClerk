import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Flash } from '$lib/flash';
import {
	draftOfMembers,
	memberCountError,
	QUICK_SESSION_MESSAGES,
	readQuickSessionDraft
} from '$lib/quick-session';
import { requireOnboarded, requirePermission } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import { quickSessionDraftActions } from '$lib/server/quick-session-actions';
import {
	getQuickSession,
	membersOfSeats,
	saveQuickSessionDelegations,
	type QuickSession
} from '$lib/server/quick-sessions';
import { chairRoomUrl } from '$lib/urls';
// `./$types` is written by SvelteKit for this folder, so `load` and `actions`
// are checked against exactly what this page receives and returns.
import type { Actions, PageServerLoad } from './$types';

/** A request to this page or one of its actions: its address carries the quick session's slug. */
type DelegationsEvent = RequestEvent<{ slug: string }>;

/** The same 404 a chair page gives, so the page tells nobody what exists. */
const NO_SUCH_QUICK_SESSION = 'This committee does not exist.';

/**
 * The page's access rule, asked by `load` and again by every action, which
 * is its own request. A visitor is sent to sign in first rather than told
 * nothing exists; a slug that is not a quick session the reader can read is a
 * 404; then the reader must hold `manage_committees` on the whole conference,
 * which is what the `seats` policies ask of "Save delegations", so nobody is
 * shown a form whose save the database would refuse. `requirePermission` asks
 * the database, with the same 404 for anybody else.
 */
async function openQuickSession(event: DelegationsEvent): Promise<QuickSession> {
	await requireOnboarded(event.locals, event.url);

	const quickSession = await getQuickSession(event.locals.supabase, event.params.slug);

	if (quickSession === null) error(404, NO_SUCH_QUICK_SESSION);

	await requirePermission(event.locals, event.url, event.params.slug, 'manage_committees');

	return quickSession;
}

/** Back to the quick session's chair room with a message, which travels in a cookie. */
function returnToRoom(event: DelegationsEvent, quickSession: QuickSession, flash: Flash): never {
	setFlash(event.cookies, flash);

	// `redirect` throws, which is how it ends the request.
	redirect(303, chairRoomUrl(quickSession.conferenceSlug, quickSession.committeeSlug));
}

/** While a session runs the delegations cannot change, so the chair goes back to the room. */
function refuseWhileRunning(event: DelegationsEvent, quickSession: QuickSession): void {
	if (!quickSession.isSessionRunning) return;

	returnToRoom(event, quickSession, {
		tone: 'error',
		message: QUICK_SESSION_MESSAGES.sessionRunning
	});
}

/**
 * "Edit delegations" (`05-pages/chair/quick-session.md`). Runs on the server
 * before the page is drawn, and answers with a draft of the committee's
 * current members, the hidden ones left out.
 */
export const load: PageServerLoad = async (event) => {
	const quickSession = await openQuickSession(event);

	refuseWhileRunning(event, quickSession);

	return {
		draft: draftOfMembers(membersOfSeats(quickSession.seats)),
		committeeName: quickSession.committeeName,
		roomHref: chairRoomUrl(quickSession.conferenceSlug, quickSession.committeeSlug)
	};
};

export const actions = {
	// The ready-made lists, "+", "×", "Clear all", "Add these" and the search,
	// which only post without JavaScript and save nothing.
	...quickSessionDraftActions(openQuickSession),

	/**
	 * "Save delegations": the new members become seats and the removed ones
	 * are hidden, then back to the chair room with "Delegations saved."
	 */
	save: async (event) => {
		const quickSession = await openQuickSession(event);

		refuseWhileRunning(event, quickSession);

		const draft = readQuickSessionDraft(await event.request.formData());
		const membersError = memberCountError(draft.members, QUICK_SESSION_MESSAGES.tooFewToSave);

		if (membersError !== undefined) {
			return fail(400, { draft, errors: { members: membersError } });
		}

		try {
			await saveQuickSessionDelegations(event.locals.supabase, quickSession, draft.members);
		} catch (failure) {
			// Nothing above can be refused by the database for a reason the
			// reader could fix, so the real message goes to the server log.
			console.error(failure);

			const flash: Flash = { tone: 'error', message: QUICK_SESSION_MESSAGES.serverFailure };

			return fail(500, { draft, errors: {}, flash });
		}

		returnToRoom(event, quickSession, { tone: 'success', message: 'Delegations saved.' });
	}
} satisfies Actions;
