/**
 * The form action that saves a session's notes (T130), on the session notes
 * page under Notes. The Room page spread it too until the session redesign
 * took the notes panel off the floor (S4).
 *
 * Files under `$lib/server` only ever run on the server. A page spreads
 * `sessionNotesActions` into its own `actions` and says where a plain save
 * sends the chair back to, the way `floorActions` does.
 *
 * The same action answers two kinds of save, both sending the notes as
 * Markdown (T144):
 *
 * - the editor's background save, sent with `background=1` while the chair
 *   types. It answers with data (the new revision, or the notes another chair
 *   saved first) and never redirects, because the editor stays on screen;
 * - the plain form's Save button without JavaScript. It sends the chair back
 *   to the page.
 */

import { fail } from '@sveltejs/kit';
import type { Flash } from '$lib/flash';
import {
	NOTES_SAVED_MESSAGE,
	SESSION_NOTES_MAX_LENGTH,
	SESSION_NOTES_REFUSALS,
	changedByText,
	readNotesRevision
} from '$lib/session-notes';
import {
	openChairRoom,
	refuseChairAction,
	returnTo,
	type ChairRequestEvent,
	type ReturnAddress
} from './chair-floor-actions';
import { saveSessionNotes } from './session-notes';

/** What a save posts, read from its form. */
type NotesForm = {
	sessionId: string;
	/** The notes as Markdown, whichever of the two forms sent them. */
	body: string;
	baseRevision: number | null;
	isBackground: boolean;
};

/**
 * Read a save's fields. A browser sends every line break in a form as `\r\n`,
 * so the Markdown is stored with plain `\n` breaks, the way the editor reads it.
 */
function readNotesForm(formData: FormData): NotesForm {
	const sent = String(formData.get('body') ?? '');

	return {
		sessionId: String(formData.get('sessionId') ?? ''),
		body: sent.replace(/\r\n?/g, '\n'),
		baseRevision: readNotesRevision(formData.get('revision')),
		isBackground: formData.get('background') === '1'
	};
}

/** The save action, sending a plain save back to `returnAddress` once it has worked. */
export function sessionNotesActions(returnAddress: ReturnAddress) {
	return {
		saveSessionNotes: async (event: ChairRequestEvent) => {
			const { committee, frame } = await openChairRoom(event);
			const form = readNotesForm(await event.request.formData());

			// `frame.sessions` holds only this committee's sessions, ended ones
			// too, so notes can still be finished after the session is over.
			const isOwnSession = frame.sessions.some((session) => session.id === form.sessionId);

			if (!isOwnSession) return refuseChairAction(SESSION_NOTES_REFUSALS.session);
			if (form.baseRevision === null) return refuseChairAction(SESSION_NOTES_REFUSALS.revision);
			if (form.body.length > SESSION_NOTES_MAX_LENGTH) {
				return refuseChairAction(SESSION_NOTES_REFUSALS.tooLong);
			}

			const result = await saveSessionNotes(event.locals.supabase, {
				sessionId: form.sessionId,
				committeeId: committee.id,
				body: form.body,
				baseRevision: form.baseRevision
			});

			if (form.isBackground) {
				if (result.kind === 'conflict') {
					return fail(409, { sessionNotesConflict: result.current });
				}

				return { sessionNotesSaved: { revision: result.revision } };
			}

			// Without JavaScript the chair's text comes back in the box, with the
			// other chair's notes under it, rather than being thrown away.
			if (result.kind === 'conflict') {
				const claims = await event.locals.getVerifiedClaims();
				const readerId = claims?.sub ?? '';
				const message = `${changedByText(result.current, readerId)} Your text is still in the box and theirs is under it. Save again to replace theirs with yours.`;
				const flash: Flash = { tone: 'error', message };

				return fail(409, { flash, sessionNotesDraft: form.body });
			}

			returnTo(event, returnAddress(event, frame), {
				tone: 'success',
				message: NOTES_SAVED_MESSAGE
			});
		}
	};
}
