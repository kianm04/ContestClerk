import { error } from '@sveltejs/kit';
import { requireCommitteePermission, requireCommitteeTool } from '$lib/server/access';
import { readSessionNotes } from '$lib/server/session-notes';
import { sessionNotesActions } from '$lib/server/session-notes-actions';
import type { Actions, PageServerLoad } from './$types';

/**
 * Runs on the server, after the chair layout's `load` has checked the reader
 * and read the committee's sessions. `parent()` hands over what it returned.
 *
 * One session's Chair Notes, the same notes the room shows while the session
 * runs (T130). They stay here, and can still be written, after it has ended.
 */
export const load: PageServerLoad = async ({ parent, locals, params }) => {
	const { sessions, committeeTools } = await parent();
	// The console opened for `run_room`; this page asks its own permission too.
	requireCommitteeTool(committeeTools, 'mayWriteNotes');

	// `sessions` holds only this committee's sessions, so an id from anywhere else is not found.
	const session = sessions.find((each) => each.id === params.sessionId);

	if (!session) error(404, 'That session is not in this committee.');

	const sessionNotes = await readSessionNotes(locals.supabase, session.id);

	return { session, sessionNotes };
};

// A plain Save without JavaScript comes back to this same page.
const { saveSessionNotes } = sessionNotesActions((event) => event.url.pathname);

export const actions: Actions = {
	// The shared action opens the room, which asks `run_room`; a form action
	// is its own request, so the page's own permission is asked again first.
	saveSessionNotes: async (event) => {
		const { slug, committeeSlug } = event.params;
		await requireCommitteePermission(
			event.locals,
			event.url,
			slug,
			committeeSlug,
			'write_chair_notes'
		);

		return saveSessionNotes(event);
	}
};
