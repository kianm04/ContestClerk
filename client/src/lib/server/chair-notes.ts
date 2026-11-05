/**
 * Reading and writing `chair_notes` for the chair notes page.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the reader's own Supabase client, so Row Level Security decides what they
 * may do: a chair of the committee (or an organiser) reads every note of it,
 * writes notes in their own name only, and deletes their own notes, while an
 * organiser deletes anybody's. A delegate reads none at all.
 *
 * The shapes and rules are in `$lib/chair-notes.ts`, so this file only fetches
 * and writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChairNote, SeatAllocation } from '$lib/chair-notes';
import { renderMarkdown } from './markdown';

/** The code Postgres answers with when an id is not a valid uuid at all. */
const INVALID_ID_CODE = '22P02';

type NoteRow = {
	id: string;
	seat_id: string;
	author_id: string;
	body: string;
	created_at: string;
};

/**
 * The names of these people, keyed by account id.
 *
 * A second query rather than a join: `chair_notes.author_id` points at
 * `auth.users`, not at `profiles`, so PostgREST cannot follow it.
 */
async function readAuthorNames(
	supabase: SupabaseClient,
	authorIds: string[]
): Promise<Map<string, string>> {
	if (authorIds.length === 0) return new Map();

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name')
		.in('id', authorIds)
		.overrideTypes<{ id: string; full_name: string | null }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the note authors' names: ${error.message}`);
	}

	const names = new Map<string, string>();

	for (const profile of data ?? []) {
		if (profile.full_name) names.set(profile.id, profile.full_name);
	}

	return names;
}

/** Every chair's title on this committee, such as "Vice Chair", keyed by account id. */
async function readChairTitles(
	supabase: SupabaseClient,
	committeeId: string
): Promise<Map<string, string>> {
	const { data, error } = await supabase
		.from('committee_chairs')
		.select('user_id, title')
		.eq('committee_id', committeeId)
		.overrideTypes<{ user_id: string; title: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committee's chairs: ${error.message}`);
	}

	return new Map((data ?? []).map((chair) => [chair.user_id, chair.title]));
}

/**
 * Every note on the committee's seats, newest first, with each author's name
 * and chair title. An organiser who is not a named chair has no title.
 */
export async function listChairNotes(
	supabase: SupabaseClient,
	committeeId: string
): Promise<ChairNote[]> {
	const { data, error } = await supabase
		.from('chair_notes')
		.select('id, seat_id, author_id, body, created_at')
		.eq('committee_id', committeeId)
		.order('created_at', { ascending: false })
		.overrideTypes<NoteRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the chair notes: ${error.message}`);
	}

	const rows = data ?? [];
	const authorIds = [...new Set(rows.map((row) => row.author_id))];
	const [names, titles] = await Promise.all([
		readAuthorNames(supabase, authorIds),
		readChairTitles(supabase, committeeId)
	]);

	return rows.map((row) => ({
		id: row.id,
		seatId: row.seat_id,
		authorId: row.author_id,
		authorName: names.get(row.author_id) ?? null,
		authorTitle: titles.get(row.author_id) ?? null,
		body: row.body,
		bodyHtml: renderMarkdown(row.body),
		createdAt: row.created_at
	}));
}

/** Which of the committee's available seats have a delegate in them, and since when. */
export async function listSeatAllocations(
	supabase: SupabaseClient,
	committeeId: string
): Promise<SeatAllocation[]> {
	const { data, error } = await supabase
		.from('seats')
		.select('id, user_id, allocated_at')
		.eq('committee_id', committeeId)
		.eq('is_available', true)
		.overrideTypes<
			{ id: string; user_id: string | null; allocated_at: string | null }[],
			{ merge: false }
		>();

	if (error) {
		throw new Error(`Could not read the committee's seats: ${error.message}`);
	}

	// Whether somebody sits there is all the page needs. The account id itself
	// stays here: sent along it would reach every chair's browser for nothing
	// (security review I14).
	return (data ?? []).map((seat) => ({
		seatId: seat.id,
		isFilled: seat.user_id !== null,
		allocatedAt: seat.allocated_at
	}));
}

/** What a new note needs. The page has already checked the seat and the text. */
export type NewChairNote = {
	committeeId: string;
	seatId: string;
	authorId: string;
	body: string;
};

/**
 * Saves a note. The insert policy insists that `authorId` is the reader.
 *
 * `noteId` is the id the browser chose for its optimistic row (T141), so the
 * saved note and the one the screen already shows are the same row. Leaving
 * it out lets the database choose one.
 */
export async function addChairNote(
	supabase: SupabaseClient,
	note: NewChairNote,
	noteId: string | null = null
): Promise<void> {
	const { error } = await supabase.from('chair_notes').insert({
		// Leaving `id` out lets the database choose it.
		...(noteId === null ? {} : { id: noteId }),
		committee_id: note.committeeId,
		seat_id: note.seatId,
		author_id: note.authorId,
		body: note.body
	});

	if (error) {
		throw new Error(`Could not save the note: ${error.message}`);
	}
}

/**
 * Deletes one of the committee's notes. Answers false when nothing was
 * deleted: the note is gone already, belongs to another committee, the id is
 * not an id at all, or the delete policy refused it because the reader neither
 * wrote it nor organises the conference. A refused delete is not an error in
 * Postgres, so the deleted rows are read back to tell.
 */
export async function deleteChairNote(
	supabase: SupabaseClient,
	committeeId: string,
	noteId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('chair_notes')
		.delete()
		.eq('id', noteId)
		.eq('committee_id', committeeId)
		.select('id');

	if (error?.code === INVALID_ID_CODE) return false;

	if (error) {
		throw new Error(`Could not delete the note: ${error.message}`);
	}

	return (data ?? []).length > 0;
}
