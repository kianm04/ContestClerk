/**
 * Changing who writes a committee paper (`docs/committee-papers.md`, section
 * 3, rule 4): starting one, adding an author, leaving, handing on the lead,
 * and deleting a paper that has never gone to the dais.
 *
 * Each goes through the database's own function or policy, which checks who
 * may do it. A refused one answers with the function's own sentence, such as
 * "Another author has to remain. Withdraw the paper instead.", which the page
 * shows as it is, so the rule and its wording live in one place.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaperKind, PaperPerson } from '$lib/committee-papers';

/**
 * The codes the paper functions refuse with, each carrying a sentence for the
 * delegate: not theirs to do (42501), not now or not that (22023), and no
 * such paper (P0002). Anything else is a fault, not a refusal.
 */
const REFUSAL_CODES = new Set(['42501', '22023', 'P0002']);

/** A database error, as Supabase hands one back. */
type DatabaseError = { code: string; message: string };

/** What a change came to: `refusal` is `null` once it is done, or the sentence that says why not. */
export type AuthorChange = { refusal: string | null };

/** The change, or the sentence it was refused with. Throws on a fault. */
function toChange(error: DatabaseError | null, failure: string): AuthorChange {
	if (error === null) return { refusal: null };

	if (REFUSAL_CODES.has(error.code)) return { refusal: error.message };

	throw new Error(`${failure}: ${error.message}`);
}

/** A paper as the "Start a paper" form asks for it. */
export type NewPaper = {
	committeeId: string;
	kind: PaperKind;
	title: string;
	/** One of the committee's topics, or `null` when it has none. */
	topic: string | null;
	/** The introduced working papers a draft resolution is based on; none for any other kind. */
	sourcePaperIds: string[];
};

/** The paper just started, or the sentence `start_paper` refused it with. */
export type StartedPaper = { paperId: string; refusal: null } | { paperId: null; refusal: string };

/**
 * Start a paper with the reader's seat as its first author and its lead.
 * `start_paper` checks that the seat is a delegate's of this committee, that
 * the committee writes papers of this kind, the title and topic, and that
 * each working paper a draft is based on was introduced in this committee.
 */
export async function startPaper(supabase: SupabaseClient, paper: NewPaper): Promise<StartedPaper> {
	const { data, error } = await supabase.rpc('start_paper', {
		committee_id: paper.committeeId,
		kind: paper.kind,
		title: paper.title,
		// Left out for a committee with no topics, where the paper has none.
		topic: paper.topic ?? undefined,
		source_paper_ids: paper.sourcePaperIds
	});

	const { refusal } = toChange(error, 'Could not start the paper');

	if (refusal !== null) return { paperId: null, refusal };

	return { paperId: String(data), refusal: null };
}

/**
 * Add a seat of the committee as an author. A seat that had signed the
 * paper becomes an author instead, and its delegate is told they were added.
 */
export async function addPaperAuthor(
	supabase: SupabaseClient,
	paperId: string,
	seatId: string
): Promise<AuthorChange> {
	const { error } = await supabase.rpc('add_paper_author', { paper_id: paperId, seat_id: seatId });

	return toChange(error, 'Could not add the author');
}

/**
 * Take the reader's seat off the paper while another author remains. When
 * the lead leaves, the longest-standing author leads.
 */
export async function leavePaper(supabase: SupabaseClient, paperId: string): Promise<AuthorChange> {
	const { error } = await supabase.rpc('leave_paper', { paper_id: paperId });

	return toChange(error, 'Could not leave the paper');
}

/** Hand the lead to another author of the paper. Only the lead may. */
export async function handPaperLead(
	supabase: SupabaseClient,
	paperId: string,
	seatId: string
): Promise<AuthorChange> {
	const { error } = await supabase.rpc('hand_paper_lead', { paper_id: paperId, seat_id: seatId });

	return toChange(error, 'Could not hand the lead on');
}

/** What a refused delete is told: the policy says nothing of its own. */
export const DELETE_REFUSAL =
	'Only the lead author can delete a paper that has never been submitted.';

/**
 * Delete a paper, with the seats on it. The policy lets only the lead do it,
 * and only while the paper has never been submitted, so a delete that
 * removes nothing was refused.
 */
export async function deletePaper(
	supabase: SupabaseClient,
	paperId: string
): Promise<AuthorChange> {
	const { data, error } = await supabase
		.from('committee_papers')
		.delete()
		.eq('id', paperId)
		// Asks for the deleted rows back, so a refusal shows as none.
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not delete the paper: ${error.message}`);
	}

	return { refusal: (data ?? []).length === 0 ? DELETE_REFUSAL : null };
}

/** A seat the authors may add, for the "Add an author" choice. */
export type SeatToAdd = { value: string; label: string };

/**
 * The seats of the committee an author may add to the paper, by name: held
 * by a delegate, not an observer's, and not writing it already. A seat that
 * has signed it may be added, and becomes an author.
 */
export async function listSeatsToAdd(
	supabase: SupabaseClient,
	committeeId: string,
	people: PaperPerson[]
): Promise<SeatToAdd[]> {
	const { data, error } = await supabase
		.from('seats')
		.select('id, name')
		.eq('committee_id', committeeId)
		// `not … is null` keeps only the seats somebody holds.
		.not('user_id', 'is', null)
		.neq('kind', 'observer')
		.order('name')
		.overrideTypes<{ id: string; name: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committee's seats: ${error.message}`);
	}

	const authorIds = new Set(
		people.filter((person) => person.role === 'author').map((person) => person.seatId)
	);

	return (data ?? [])
		.filter((seat) => !authorIds.has(seat.id))
		.map((seat) => ({ value: seat.id, label: seat.name }));
}
