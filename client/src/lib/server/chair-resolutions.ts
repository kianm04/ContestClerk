/**
 * The dais's reads and changes for a committee's papers
 * (`docs/committee-papers.md`, step 5, "To the dais"): the papers sent up,
 * one paper's submitted document, and approving, returning and withdrawing.
 *
 * Row Level Security shows the dais a paper once it is open for signatures or
 * has been submitted (`may_read_paper`), and the database's own functions
 * decide every change. A refused change answers with the function's own
 * sentence, such as "Draft resolution 1.1 is already taken.", which the page
 * shows as it is.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	DAIS_PAPER_KINDS,
	type DaisPaper,
	type NumberedPaper,
	type PaperNumber
} from '$lib/chair-resolutions';
import type { PaperKind, PaperStatus } from '$lib/committee-papers';
import { bytesToBase64 } from '$lib/paper-document';
import { readMemberName } from './delegations';
import { decodeStoredDocument } from './paper-live-drafts';

/** The codes the paper functions refuse with, as in `./committee-paper-signatures.ts`. */
const REFUSAL_CODES = new Set(['42501', '22023', 'P0002']);

/** What a change came to: `refusal` is `null` once it is done, or the sentence that says why not. */
export type DaisChange = { refusal: string | null };

/** The change, or the sentence it was refused with. Throws on a fault. */
function toChange(error: { code: string; message: string } | null, failure: string): DaisChange {
	if (error === null) return { refusal: null };

	if (REFUSAL_CODES.has(error.code)) return { refusal: error.message };

	throw new Error(`${failure}: ${error.message}`);
}

/** A paper as the list reads it, with its lead seat brought along. */
type DaisPaperRow = {
	id: string;
	kind: PaperKind;
	status: PaperStatus;
	title: string;
	topic: string | null;
	topic_number: number | null;
	sequence: number | null;
	submitted_at: string | null;
	// A paper has two links to `seats`, so the select names the one it follows.
	lead_seat: { name: string } | null;
};

/**
 * Every paper of the committee that has gone to the dais, of the kinds the
 * dais approves. `daisSections` in `$lib/chair-resolutions.ts` sorts them.
 */
export async function listDaisPapers(
	supabase: SupabaseClient,
	committeeId: string
): Promise<DaisPaper[]> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select(
			'id, kind, status, title, topic, topic_number, sequence, submitted_at, lead_seat:seats!committee_papers_lead_seat_id_fkey(name)'
		)
		.eq('committee_id', committeeId)
		.in('kind', [...DAIS_PAPER_KINDS])
		.not('submitted_at', 'is', null)
		// Replaces Supabase's guess at the rows' shape with ours. It has to come last.
		.overrideTypes<DaisPaperRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committee's resolutions: ${error.message}`);
	}

	return (data ?? []).map((row) => ({
		id: row.id,
		kind: row.kind,
		status: row.status,
		title: row.title,
		topic: row.topic,
		topicNumber: row.topic_number,
		sequence: row.sequence,
		leadSeatName: row.lead_seat?.name ?? null,
		submittedAt: row.submitted_at
	}));
}

/** What the review page reads besides the paper itself. */
export type DaisReview = {
	/**
	 * The paper's Yjs document as submitted, in base64, or `null` when it was
	 * only ever saved as Markdown. The page opens it to anchor its notes. It
	 * lives in `committee_paper_documents`, which the dais reads while the
	 * paper is with it and not while its authors write it again after a
	 * return, when it is `null` here too.
	 */
	documentState: string | null;
	/** The latest version's number, `null` while there is none. */
	version: number | null;
	/** The committee's papers of the same kind that have a number. */
	numbered: NumberedPaper[];
};

/** The submitted document, the version and the numbers taken, for one paper. */
export async function readDaisReview(
	supabase: SupabaseClient,
	committeeId: string,
	paper: { id: string; kind: PaperKind }
): Promise<DaisReview> {
	const [stored, versions, numbered] = await Promise.all([
		supabase
			.from('committee_paper_documents')
			.select('document_state')
			.eq('paper_id', paper.id)
			.maybeSingle()
			.overrideTypes<{ document_state: string }, { merge: false }>(),
		supabase
			.from('committee_paper_versions')
			.select('version_number')
			.eq('paper_id', paper.id)
			.order('version_number', { ascending: false })
			.limit(1),
		supabase
			.from('committee_papers')
			.select('topic_number, sequence')
			.eq('committee_id', committeeId)
			.eq('kind', paper.kind)
			.not('topic_number', 'is', null)
	]);

	if (stored.error) throw new Error(`Could not read the paper's document: ${stored.error.message}`);
	if (versions.error)
		throw new Error(`Could not read the paper's versions: ${versions.error.message}`);
	if (numbered.error)
		throw new Error(`Could not read the numbers taken: ${numbered.error.message}`);

	// The authors' saves wrote this document, so it is opened here first: bytes
	// that are not a paper's document count as none (security review, L52), and
	// the page seeds the paper from its Markdown, as the authors' page does.
	const documentState =
		stored.data === null ? null : decodeStoredDocument(stored.data.document_state);

	return {
		documentState: documentState === null ? null : bytesToBase64(documentState),
		version: versions.data[0]?.version_number ?? null,
		numbered: numbered.data.map((row) => ({
			kind: paper.kind,
			topicNumber: row.topic_number,
			sequence: row.sequence
		}))
	};
}

/** "Approve as Draft resolution 1.1": the paper is approved with this number. */
export async function approvePaper(
	supabase: SupabaseClient,
	paperId: string,
	number: PaperNumber
): Promise<DaisChange> {
	const { error } = await supabase.rpc('approve_paper', {
		paper_id: paperId,
		topic_number: number.topicNumber,
		sequence: number.sequence
	});

	return toChange(error, 'Could not approve the paper');
}

/** "Return to the authors": the paper goes back to being written, with the dais's comment. */
export async function returnPaper(
	supabase: SupabaseClient,
	paperId: string,
	comment: string
): Promise<DaisChange> {
	const { error } = await supabase.rpc('return_paper', { paper_id: paperId, comment });

	return toChange(error, 'Could not return the paper');
}

/** "Withdraw at the sponsors' request", for a paper already introduced. */
export async function withdrawPaper(
	supabase: SupabaseClient,
	paperId: string
): Promise<DaisChange> {
	const { error } = await supabase.rpc('withdraw_paper', { paper_id: paperId });

	return toChange(error, 'Could not withdraw the paper');
}

/** Who writes the dais's notes, as the card for a new one names them: "Eleanor Price", "Chair". */
export type DaisWriter = { name: string; title: string | null };

/**
 * The reader as the dais's notes name them: their own name, and their title
 * on this committee's dais, or `null` for somebody who runs the room without
 * one, such as an organiser.
 */
export async function readDaisWriter(
	supabase: SupabaseClient,
	committeeId: string,
	userId: string
): Promise<DaisWriter> {
	const [name, chair] = await Promise.all([
		readMemberName(supabase, userId),
		supabase
			.from('committee_chairs')
			.select('title')
			.eq('committee_id', committeeId)
			.eq('user_id', userId)
			.maybeSingle()
			.overrideTypes<{ title: string }, { merge: false }>()
	]);

	if (chair.error) throw new Error(`Could not read the reader's title: ${chair.error.message}`);

	return { name, title: chair.data?.title ?? null };
}
