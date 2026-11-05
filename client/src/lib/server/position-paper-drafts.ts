/**
 * The working draft of a written position paper (T145): reading it, saving
 * it while the delegate types, and dropping it once the paper is submitted.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the signed-in reader's Supabase client, so Row Level Security decides who
 * may reach a draft: the delegate sitting in its seat, and since T147 the
 * members of their delegation, who may read and save it but not drop it
 * (`specs/02-architecture/permissions.md`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaperDraft } from '$lib/paper-writing';
import { readMemberName, UNKNOWN_MEMBER_NAME } from '$lib/server/delegations';
import { documentWithMarkdown, seededDocumentColumn } from '$lib/server/paper-live-drafts';

/** The code Postgres answers with when a row with that key already exists. */
const UNIQUE_VIOLATION_CODE = '23505';

/** One `position_paper_drafts` row, as this module reads it. */
type DraftRow = {
	body_markdown: string;
	revision: number;
	updated_at: string;
	updated_by: string | null;
};

/**
 * The name of whoever saved a paper last, `null` when nobody has or the
 * account is gone. A query of its own because `updated_by` points at
 * `auth.users`, which PostgREST cannot bring `profiles` along from. A
 * committee paper's page reads its last saver the same way.
 */
export async function readEditorName(
	supabase: SupabaseClient,
	userId: string | null
): Promise<string | null> {
	if (userId === null) return null;

	const name = await readMemberName(supabase, userId);

	return name === UNKNOWN_MEMBER_NAME ? null : name;
}

/** The seat's draft and who saved it last, or `null` when nobody has saved one. */
export async function readPaperDraft(
	supabase: SupabaseClient,
	seatId: string
): Promise<PaperDraft | null> {
	const { data, error } = await supabase
		.from('position_paper_drafts')
		.select('body_markdown, revision, updated_at, updated_by')
		.eq('seat_id', seatId)
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<DraftRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read your draft: ${error.message}`);
	}

	if (!data) return null;

	return {
		body: data.body_markdown,
		revision: data.revision,
		updatedAt: data.updated_at,
		updatedById: data.updated_by,
		updatedByName: await readEditorName(supabase, data.updated_by)
	};
}

/** One save of a draft: the text, and the revision the delegate started from (0 for none). */
export type DraftSave = {
	seatId: string;
	body: string;
	baseRevision: number;
};

/**
 * What a save came to: the new revision, or the draft another window or a
 * fellow member of the delegation saved in between. Its revision is 0 and
 * `theirs` is `null` when the draft it started from is gone, as after a submit.
 */
export type DraftSaveResult =
	| { kind: 'saved'; revision: number }
	| { kind: 'conflict'; revision: number; theirs: PaperDraft | null };

/** The draft stored now, for a save that met a newer one. */
async function readConflict(supabase: SupabaseClient, seatId: string): Promise<DraftSaveResult> {
	const current = await readPaperDraft(supabase, seatId);

	return { kind: 'conflict', revision: current?.revision ?? 0, theirs: current };
}

/** Start the seat's first draft, with the document its delegation can write it in live (T148). */
async function insertDraft(supabase: SupabaseClient, save: DraftSave): Promise<DraftSaveResult> {
	const { data, error } = await supabase
		.from('position_paper_drafts')
		.insert({
			seat_id: save.seatId,
			body_markdown: save.body,
			document_state: seededDocumentColumn(save.body)
		})
		.select('revision')
		.single()
		.overrideTypes<{ revision: number }, { merge: false }>();

	// Another window started the draft first, a moment ago.
	if (error?.code === UNIQUE_VIOLATION_CODE) return readConflict(supabase, save.seatId);

	if (error || !data) {
		throw new Error(`Could not save your draft: ${error?.message}`);
	}

	return { kind: 'saved', revision: data.revision };
}

/**
 * Save the draft over the stored one, but only while the stored one is still
 * the revision the delegate started from, the way the chair's session notes
 * are saved (T130). A save that finds a newer one writes nothing, so a second
 * window never wipes out the first one's words without the delegate knowing.
 */
export async function savePaperDraft(
	supabase: SupabaseClient,
	save: DraftSave
): Promise<DraftSaveResult> {
	if (save.baseRevision === 0) return insertDraft(supabase, save);

	/*
		A draft its delegation has written live (T148) also keeps its Yjs
		document, which must say the same as the Markdown. The text is written
		into it as one more edit, so the pages still open on it can carry on.
	*/
	const documentState = await documentWithMarkdown(
		supabase,
		save.seatId,
		save.baseRevision,
		save.body
	);
	const changes =
		documentState === null
			? { body_markdown: save.body }
			: { body_markdown: save.body, document_state: documentState };

	const { data, error } = await supabase
		.from('position_paper_drafts')
		.update(changes)
		.eq('seat_id', save.seatId)
		.eq('revision', save.baseRevision)
		.select('revision')
		.overrideTypes<{ revision: number }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not save your draft: ${error.message}`);
	}

	const saved = data?.[0];

	if (saved) return { kind: 'saved', revision: saved.revision };

	return readConflict(supabase, save.seatId);
}

/** Drop the seat's draft, once what it held has been submitted. */
export async function deletePaperDraft(supabase: SupabaseClient, seatId: string): Promise<void> {
	const { error } = await supabase.from('position_paper_drafts').delete().eq('seat_id', seatId);

	if (error) {
		throw new Error(`Could not clear your draft: ${error.message}`);
	}
}
