/**
 * Reading and saving `committee_session_notes`, the chair's running notes on
 * one committee session (T130).
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the reader's own Supabase client, so Row Level Security decides what it may
 * do: a chair of the committee or an organiser reads and saves the notes, and
 * anybody else reads nothing. The `stamp_committee_session_notes` trigger
 * records who saved and moves the revision on by one.
 *
 * The body is Markdown (T144) and is stored as the chair wrote it. It becomes
 * HTML only on its way out, through `renderMarkdown`, so whatever a browser
 * sent, a page only ever draws the formatting that file allows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionNotes } from '$lib/session-notes';
import { renderMarkdown } from './markdown';

/** The code Postgres answers with when a unique key is already taken. */
const UNIQUE_VIOLATION_CODE = '23505';

type NotesRow = {
	body: string;
	revision: number;
	updated_by: string | null;
	updated_at: string;
};

/** What `saveSessionNotes` needs: the session, its committee, the text and where it started. */
export type NotesSave = {
	sessionId: string;
	committeeId: string;
	/** The notes' Markdown as the browser sent it. */
	body: string;
	/** The revision the chair's text started from, 0 for notes never saved. */
	baseRevision: number;
};

/** Saved as the new revision, or found changed by somebody else, whose notes come back. */
export type NotesSaveResult =
	{ kind: 'saved'; revision: number } | { kind: 'conflict'; current: SessionNotes };

/** The name of whoever saved last, or null when there is nobody to name. */
async function readSaverName(
	supabase: SupabaseClient,
	userId: string | null
): Promise<string | null> {
	if (userId === null) return null;

	const { data, error } = await supabase
		.from('profiles')
		.select('full_name')
		.eq('id', userId)
		.maybeSingle()
		.overrideTypes<{ full_name: string | null }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read who saved the session notes: ${error.message}`);
	}

	return data?.full_name ?? null;
}

/** A stored row as the panel draws it, with its body as safe HTML too and its saver named. */
async function toSessionNotes(supabase: SupabaseClient, row: NotesRow): Promise<SessionNotes> {
	return {
		body: row.body,
		bodyHtml: renderMarkdown(row.body),
		revision: row.revision,
		updatedById: row.updated_by,
		updatedByName: await readSaverName(supabase, row.updated_by),
		updatedAt: row.updated_at
	};
}

/** One session's notes, or null when nobody has written any yet. */
export async function readSessionNotes(
	supabase: SupabaseClient,
	sessionId: string
): Promise<SessionNotes | null> {
	const { data, error } = await supabase
		.from('committee_session_notes')
		.select('body, revision, updated_by, updated_at')
		.eq('session_id', sessionId)
		.maybeSingle()
		.overrideTypes<NotesRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the session notes: ${error.message}`);
	}

	return data ? toSessionNotes(supabase, data) : null;
}

/** The notes somebody else saved first, for a save that found them changed. */
async function readConflict(supabase: SupabaseClient, sessionId: string): Promise<NotesSaveResult> {
	const current = await readSessionNotes(supabase, sessionId);

	if (current === null) {
		throw new Error('The session notes changed and then could not be read.');
	}

	return { kind: 'conflict', current };
}

/** Write the first revision of a session's notes. */
async function insertNotes(supabase: SupabaseClient, save: NotesSave): Promise<NotesSaveResult> {
	const { data, error } = await supabase
		.from('committee_session_notes')
		.insert({
			session_id: save.sessionId,
			committee_id: save.committeeId,
			body: save.body
		})
		.select('revision')
		.single()
		.overrideTypes<{ revision: number }, { merge: false }>();

	// Another chair started the notes first, a moment ago.
	if (error?.code === UNIQUE_VIOLATION_CODE) return readConflict(supabase, save.sessionId);

	if (error || !data) {
		throw new Error(`Could not save the session notes: ${error?.message}`);
	}

	return { kind: 'saved', revision: data.revision };
}

/**
 * Save the chair's notes over the stored ones, but only while the stored ones
 * are still the revision the chair started from. When somebody else saved in
 * between, nothing is written and their notes come back instead, so neither
 * chair's words are wiped out without them knowing (T130 decision).
 */
export async function saveSessionNotes(
	supabase: SupabaseClient,
	save: NotesSave
): Promise<NotesSaveResult> {
	if (save.baseRevision === 0) return insertNotes(supabase, save);

	const { data, error } = await supabase
		.from('committee_session_notes')
		.update({ body: save.body })
		.eq('session_id', save.sessionId)
		.eq('revision', save.baseRevision)
		.select('revision')
		.overrideTypes<{ revision: number }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not save the session notes: ${error.message}`);
	}

	const saved = data?.[0];

	if (saved) return { kind: 'saved', revision: saved.revision };

	return readConflict(supabase, save.sessionId);
}
