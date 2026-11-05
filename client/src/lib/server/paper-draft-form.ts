/**
 * Saving the draft of a written position paper from a posted form, for the
 * two pages that do it: the delegate's own position paper page (T145) and a
 * fellow member's paper under their delegation (T147). Both `saveDraft`
 * actions read the same form and answer in the same way, so the editor's
 * autosave and the page without JavaScript behave alike on either page.
 *
 * A paper written in committee is posted in the same form, and its live saves
 * are answered here too (`saveLivePaperFromForm`), whichever paper they are for.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Flash } from '$lib/flash';
import {
	PAPER_WRITING_MESSAGES,
	WRITTEN_PAPER_MAX_LENGTH,
	normaliseLineEnds,
	type PaperDraft,
	type TheirDraft
} from '$lib/paper-writing';
import { plainFormSuggestionsMessage } from '$lib/paper-comments';
import { base64ToBytes, bytesToBase64 } from '$lib/paper-document';
import { readNotesRevision } from '$lib/session-notes';
import { renderMarkdown } from '$lib/server/markdown';
import {
	LIVE_DOCUMENT_MAX_BYTES,
	positionPaperDraftStore,
	readLiveDocumentState,
	saveLivePaper,
	storedSuggestionCount,
	type LivePaperStore
} from '$lib/server/paper-live-drafts';
import { savePaperDraft, type DraftSaveResult } from '$lib/server/position-paper-drafts';

/** What the writer is told when the database fails, which they cannot fix. */
export const SERVER_PROBLEM_MESSAGE = 'Something went wrong on our side. Please try again.';

/** The draft a save met instead of its own, as a refusal hands it to the page. */
type DraftConflict = { revision: number; theirs: TheirDraft | null };

/**
 * Refuse a written paper or a draft with a message the layout shows as a
 * toast, and hand the text back so the editor still holds it without
 * JavaScript, where the page is drawn again from this answer. A save that
 * met another window's draft also hands back that draft, so the editor can
 * offer "Keep mine" and "Use theirs".
 */
export function refuseWriting(
	status: number,
	message: string,
	body: string,
	draftConflict: DraftConflict | null = null
) {
	const flash: Flash = { tone: 'error', message };

	return fail(status, { flash, draftText: body, draftConflict });
}

/**
 * Refuse a live save (T148) whose document can no longer be saved, as a
 * position paper submitted and started again, or a working paper its writer
 * has left. `isDraftReplaced` tells the page to stop saving and offer to reload.
 */
function refuseReplacedDraft(body: string, message: string) {
	const flash: Flash = { tone: 'error', message };

	return fail(409, { flash, draftText: body, draftConflict: null, isDraftReplaced: true });
}

/** What the writing form posts: the Markdown, and the draft revision the editor started from. */
export type WrittenForm = {
	/** The Markdown with plain `\n` line breaks, however the browser sent them. */
	body: string;
	/** `null` when the form sent something that is not a revision. */
	baseRevision: number | null;
	/** Sent by the editor's autosave, which wants data back rather than a redirect. */
	isBackground: boolean;
	/**
	 * The whole Yjs document as base64, sent in place of the Markdown by a
	 * page its delegation writes on live (T148). `null` for a Markdown save.
	 */
	document: string | null;
};

/** Read the writing form a page posted. */
export function readWrittenForm(formData: FormData): WrittenForm {
	return {
		body: normaliseLineEnds(String(formData.get('body') ?? '')),
		baseRevision: readNotesRevision(formData.get('revision')),
		isBackground: formData.get('background') === '1',
		document: typeof formData.get('document') === 'string' ? String(formData.get('document')) : null
	};
}

/** The draft somebody else saved, with its text made safe to draw. */
function toTheirDraft(draft: PaperDraft | null): TheirDraft | null {
	if (draft === null) return null;

	return { ...draft, bodyHtml: renderMarkdown(draft.body) };
}

/**
 * Save the posted text as the seat's draft. Answers the refusal the action
 * should return, or the revision now stored. The caller has already checked
 * that the reader may work on this seat's draft; Row Level Security checks it
 * again underneath.
 *
 * A draft may be saved after the deadline too: it changes nothing anybody
 * reviews.
 */
export async function saveDraftFromForm(
	supabase: SupabaseClient,
	seatId: string,
	form: WrittenForm
) {
	if (form.document !== null) {
		const store = positionPaperDraftStore(supabase, seatId);

		return saveLivePaperFromForm(store, form, PAPER_WRITING_MESSAGES);
	}

	if (form.baseRevision === null) {
		return { refusal: refuseWriting(400, PAPER_WRITING_MESSAGES.revision, form.body) };
	}

	if (form.body.length > WRITTEN_PAPER_MAX_LENGTH) {
		return { refusal: refuseWriting(400, PAPER_WRITING_MESSAGES.tooLong, form.body) };
	}

	let result: DraftSaveResult;

	try {
		/*
			The plain box holds the agreed text, without the suggestions its
			delegation has still to decide (section 7), so saving it would throw
			them away. While there are any, it saves nothing and says how many.
		*/
		const openSuggestions = storedSuggestionCount(await readLiveDocumentState(supabase, seatId));

		if (openSuggestions > 0) {
			const message = plainFormSuggestionsMessage(openSuggestions);

			return { refusal: refuseWriting(409, message, form.body) };
		}

		result = await savePaperDraft(supabase, {
			seatId,
			body: form.body,
			baseRevision: form.baseRevision
		});
	} catch {
		return { refusal: refuseWriting(500, SERVER_PROBLEM_MESSAGE, form.body) };
	}

	// Without JavaScript the text comes back in the box with the revision
	// saved in between, so pressing "Save draft" again keeps this version.
	if (result.kind === 'conflict') {
		const conflict = { revision: result.revision, theirs: toTheirDraft(result.theirs) };
		const message = PAPER_WRITING_MESSAGES.conflict;

		return { refusal: refuseWriting(409, message, form.body, conflict) };
	}

	return { refusal: null, revision: result.revision, missing: null };
}

/** The longest base64 text a document within `LIVE_DOCUMENT_MAX_BYTES` can be sent as. */
const LIVE_DOCUMENT_MAX_TEXT = Math.ceil(LIVE_DOCUMENT_MAX_BYTES / 3) * 4;

/** Read the posted document, or `null` when it is not base64. */
function readPostedDocument(text: string): Uint8Array | null {
	try {
		return base64ToBytes(text);
	} catch {
		return null;
	}
}

/**
 * What the writer of a live paper is told in the paper's own words: once
 * their page can no longer save it (`replaced`), and when it is too long.
 */
export type LiveSaveMessages = { replaced: string; tooLong: string };

/**
 * Merge a document a live page posted into the paper `store` keeps (T148),
 * and answer with what that page is missing, as base64. It meets no clash: the
 * merge keeps everybody's words, however stale the page's document was.
 */
export async function saveLivePaperFromForm(
	store: LivePaperStore,
	form: WrittenForm,
	messages: LiveSaveMessages
) {
	const tooLong = { refusal: refuseWriting(400, messages.tooLong, form.body) };

	if (form.document !== null && form.document.length > LIVE_DOCUMENT_MAX_TEXT) return tooLong;

	const document = form.document === null ? null : readPostedDocument(form.document);

	if (document === null || form.baseRevision === null) {
		return { refusal: refuseWriting(400, PAPER_WRITING_MESSAGES.revision, form.body) };
	}

	try {
		const result = await saveLivePaper(store, { document, lastRevision: form.baseRevision });

		if (result.kind === 'tooLong') return tooLong;

		if (result.kind === 'replaced') {
			return { refusal: refuseReplacedDraft(form.body, messages.replaced) };
		}

		return { refusal: null, revision: result.revision, missing: bytesToBase64(result.missing) };
	} catch {
		return { refusal: refuseWriting(500, SERVER_PROBLEM_MESSAGE, form.body) };
	}
}
