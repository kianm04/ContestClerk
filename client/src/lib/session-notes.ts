/**
 * The chair's running notes on one committee session (T130): their shape, the
 * words the notes panel shows and how it reads the server's answer to a save.
 *
 * Nothing here touches the database or the page, so it can be tested without
 * either. The database half is `$lib/server/session-notes.ts`, and the saving
 * while the chair types `$lib/session-notes-autosave.svelte.ts`. The notes are
 * Markdown (T144), written in the shared `MarkdownEditor`.
 */

import type { ActionResult } from '@sveltejs/kit';
import { NETWORK_FAILURE_MESSAGE, SERVER_FAILURE_MESSAGE } from '$lib/in-place-form.svelte';
import { firstName } from '$lib/profiles';

/** One session's notes as the panel draws them. */
export type SessionNotes = {
	/** The notes as the chair wrote them, in Markdown. */
	body: string;
	/** The same notes as HTML, made safe to draw by `renderMarkdown` on the server. */
	bodyHtml: string;
	/** Moves on by one with every save; a save names the one it started from. */
	revision: number;
	/** Who saved last, or null once their account is gone. */
	updatedById: string | null;
	updatedByName: string | null;
	/** When the notes were last saved. */
	updatedAt: string;
};

/**
 * Where the notes stand: `saved` (nothing waiting), `waiting` (typed, about to
 * be sent), `saving`, `failed` (not saved, text kept) or `conflict` (another
 * chair saved first; nothing is sent until the chair chooses).
 */
export type NotesSaveStatus = 'saved' | 'waiting' | 'saving' | 'failed' | 'conflict';

/** What a background save came to, read from the action's answer by `readSaveOutcome`. */
export type NotesSaveOutcome =
	| { kind: 'saved'; revision: number }
	| { kind: 'conflict'; current: SessionNotes }
	| { kind: 'failed'; message: string };

/** The most characters the stored notes may hold, the same as the database's check. */
export const SESSION_NOTES_MAX_LENGTH = 100_000;

/** How long after the chair's last keystroke the notes are saved. */
export const NOTES_SAVE_DELAY_MS = 1_000;

/** The words of every refusal of a save. */
export const SESSION_NOTES_REFUSALS = {
	session: 'That session belongs to another committee.',
	tooLong: 'These notes are too long to save. Move some of them into a document.',
	revision: 'Reload the page and try again.',
	signedOut: 'You have been signed out. Sign in again in another tab, then try again.'
} as const;

/** The flash a plain Save shows once the notes are stored. */
export const NOTES_SAVED_MESSAGE = 'Notes saved.';

/**
 * The revision a save started from, read from the form: a whole number, 0 for
 * notes that had never been saved. Null for anything else.
 */
export function readNotesRevision(value: FormDataEntryValue | null): number | null {
	if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;

	return Number(value);
}

/**
 * How long ago a moment was, in the short words the status line uses: "10s
 * ago". Both moments are milliseconds since 1970, as `Date.now()` gives them.
 */
export function savedAgoText(savedAt: number, now: number): string {
	const seconds = Math.max(0, Math.floor((now - savedAt) / 1000));

	if (seconds < 5) return 'just now';
	if (seconds < 60) return `${seconds}s ago`;

	const minutes = Math.floor(seconds / 60);

	if (minutes < 60) return `${minutes} min ago`;

	const hours = Math.floor(minutes / 60);

	if (hours < 24) return `${hours} h ago`;

	const days = Math.floor(hours / 24);

	return days === 1 ? '1 day ago' : `${days} days ago`;
}

/**
 * Who changed the notes under the chair: "Sara changed these notes". The
 * reader's own save from another tab says "You", and an account that is gone
 * "Another chair".
 */
export function changedByText(notes: SessionNotes, readerId: string): string {
	if (notes.updatedById === readerId) return 'You changed these notes in another window.';
	if (notes.updatedByName === null) return 'Another chair changed these notes.';

	return `${firstName(notes.updatedByName)} changed these notes.`;
}

/**
 * The status line beside the notes' heading: "Saving…" while the notes wait
 * to be sent or are on their way, "Auto-saved 10s ago" once stored, "Not
 * saved" when a save failed or found another chair's notes, and nothing for
 * notes that have never been written.
 */
export function saveStatusText(
	status: NotesSaveStatus,
	savedAt: number | null,
	now: number
): string {
	if (status === 'waiting' || status === 'saving') return 'Saving…';
	if (status === 'failed' || status === 'conflict') return 'Not saved';
	if (savedAt === null) return '';

	return `Auto-saved ${savedAgoText(savedAt, now)}`;
}

/**
 * The text a plain Save sent, when the page answered it with a refusal, so the
 * box shows it again. `form` is whatever the page's last action returned.
 */
export function readNotesDraft(form: unknown): string | null {
	if (typeof form !== 'object' || form === null || !('sessionNotesDraft' in form)) return null;

	return typeof form.sessionNotesDraft === 'string' ? form.sessionNotesDraft : null;
}

/** What a failed answer's flash said, when it had one. */
function flashMessage(data: Record<string, unknown> | undefined): string | null {
	const flash = data?.flash;

	if (typeof flash !== 'object' || flash === null || !('message' in flash)) return null;

	return typeof flash.message === 'string' ? flash.message : null;
}

/**
 * What a background save came to, from the action's answer.
 *
 * The action answers a background save with `sessionNotesSaved` and the new
 * revision, or refuses with `sessionNotesConflict` when another chair saved
 * first. A refusal with a flash says why in its own words. A redirect only
 * happens when the chair's sign-in has run out, since a background save is
 * never sent back to a page.
 */
export function readSaveOutcome(result: ActionResult): NotesSaveOutcome {
	if (result.type === 'success') {
		const saved = result.data?.sessionNotesSaved as { revision: number } | undefined;

		if (saved) return { kind: 'saved', revision: saved.revision };

		return { kind: 'failed', message: SERVER_FAILURE_MESSAGE };
	}

	if (result.type === 'failure') {
		const current = result.data?.sessionNotesConflict as SessionNotes | undefined;

		if (current) return { kind: 'conflict', current };

		return { kind: 'failed', message: flashMessage(result.data) ?? SERVER_FAILURE_MESSAGE };
	}

	if (result.type === 'redirect')
		return { kind: 'failed', message: SESSION_NOTES_REFUSALS.signedOut };

	// An error with no status never reached the server, or its answer never came back.
	const isNetworkFailure = result.status === undefined;

	return {
		kind: 'failed',
		message: isNetworkFailure ? NETWORK_FAILURE_MESSAGE : SERVER_FAILURE_MESSAGE
	};
}
