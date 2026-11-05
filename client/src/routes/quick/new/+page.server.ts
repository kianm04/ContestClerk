import { fail, redirect } from '@sveltejs/kit';
import type { Flash } from '$lib/flash';
import { emptyDraft, QUICK_SESSION_MESSAGES, readQuickSessionForm } from '$lib/quick-session';
import { requireOnboarded } from '$lib/server/access';
import { quickSessionDraftActions } from '$lib/server/quick-session-actions';
import {
	createQuickSession,
	QuickSessionRefusal,
	type QuickSessionAddress
} from '$lib/server/quick-sessions';
import { chairRoomUrl } from '$lib/urls';
// `./$types` is written by SvelteKit for this folder, so `load` and `actions`
// are checked against exactly what this page receives and returns.
import type { Actions, PageServerLoad } from './$types';

/**
 * "Run a quick session" (`05-pages/chair/quick-session.md`). Runs on the
 * server before the page is drawn. Any signed-in user who has finished
 * onboarding may set one up; a visitor is sent to sign in first and comes
 * back here. Nothing is read from the database: the member states and the
 * ready-made lists are data in `$lib/seat-lists.ts`, which the page imports
 * itself.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	await requireOnboarded(locals, url);

	return { draft: emptyDraft() };
};

export const actions = {
	// The ready-made lists, "+", "×", "Clear all", "Add these" and the search,
	// which only post without JavaScript and save nothing.
	...quickSessionDraftActions((event) => requireOnboarded(event.locals, event.url)),

	/**
	 * "Start session": check every field, then make the committee and start
	 * "Session 1" in one transaction, and land on its chair room, which opens
	 * on Opening. A refusal keeps every field and member.
	 */
	start: async ({ locals, url, request }) => {
		await requireOnboarded(locals, url);

		const form = readQuickSessionForm(await request.formData());

		if (form.start === null) return fail(400, { draft: form.draft, errors: form.errors });

		let address: QuickSessionAddress;

		try {
			address = await createQuickSession(locals.supabase, form.start);
		} catch (failure) {
			// The function wrote nothing either way. What it refuses in a sentence
			// of its own is what the checks above cannot know, such as a chair
			// already running 25 quick sessions, and that sentence is shown.
			if (failure instanceof QuickSessionRefusal) {
				const flash: Flash = { tone: 'error', message: failure.message };

				return fail(400, { draft: form.draft, errors: {}, flash });
			}

			// Anything else is a failure of ours: the reader is told to try again
			// and the real message goes to the server log.
			console.error(failure);

			const flash: Flash = { tone: 'error', message: QUICK_SESSION_MESSAGES.serverFailure };

			return fail(500, { draft: form.draft, errors: {}, flash });
		}

		// `redirect` throws, which is how it ends the action.
		redirect(303, chairRoomUrl(address.conferenceSlug, address.committeeSlug));
	}
} satisfies Actions;
