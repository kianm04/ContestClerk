/**
 * A committee paper going to the dais and coming back
 * (`docs/committee-papers.md`, section 3, rules 5 and 6): its authors submit
 * it or withdraw it, and its page reads what the dais last decided about it.
 *
 * `submit_paper` freezes the text the paper has as its version 1 and checks
 * the committee's rules, the support, the sponsor cap and one draft per
 * topic, refusing with its own sentence. It is told the revision the text was
 * read at, and refuses with 40001 when another author saved in between; the
 * text is then read again and sent once more. Open suggestions are in the
 * text but not yet agreed, so a paper with any is not sent at all (section
 * 4, "When it ends").
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaperKind } from '$lib/committee-papers';
import { clauseContentFromMarkdown, type ClauseContent } from '$lib/paper-clauses';
import {
	SUBMITTING_MESSAGES,
	submitBlockedSentence,
	type DaisMember,
	type PaperDecision
} from '$lib/paper-submitting';
import { splitResolutionMarkdown } from '$lib/resolution-text';
import { committeePaperStore, type StoredPaperName } from './committee-paper-writing';
import { readLivePaperWithSuggestions } from './paper-live-drafts';
import { listCommitteeChairs } from './team';

/** The codes the paper functions refuse with, as in `./committee-paper-authors.ts`. */
const REFUSAL_CODES = new Set(['42501', '22023', 'P0002']);

/** What `submit_paper` answers when the text changed after it was read. */
const TEXT_CHANGED_CODE = '40001';

/** Read and send once, and once more if another author saved in between. */
const SUBMIT_ATTEMPTS = 2;

/** What a change came to: `refusal` is `null` once it is done, or the sentence that says why not. */
export type PaperChange = { refusal: string | null };

/**
 * The clauses `submit_paper` freezes for a draft resolution or a directive,
 * from the one text the editor shows; `null` for any other kind, whose
 * Markdown the database freezes as it is.
 */
export function submittedContent(kind: PaperKind, markdown: string): ClauseContent | null {
	if (kind === 'committee_directive') return clauseContentFromMarkdown('', markdown);
	if (kind !== 'draft_resolution') return null;

	const { preamble, operative } = splitResolutionMarkdown(markdown);

	return clauseContentFromMarkdown(preamble, operative);
}

/** "Submit to the dais": the paper's text as it is stored now becomes its version 1. */
export async function submitCommitteePaper(
	supabase: SupabaseClient,
	paper: StoredPaperName
): Promise<PaperChange> {
	const store = committeePaperStore(supabase, paper);

	for (let attempt = 1; attempt <= SUBMIT_ATTEMPTS; attempt += 1) {
		const stored = await readLivePaperWithSuggestions(store);

		// Nothing the reader may write: they have left it, or it went to the dais already.
		if (stored === null) return { refusal: SUBMITTING_MESSAGES.notBeingWritten };

		if (stored.openSuggestions > 0) {
			return { refusal: submitBlockedSentence(stored.openSuggestions) };
		}

		const { error } = await supabase.rpc('submit_paper', {
			paper_id: paper.id,
			expected_revision: stored.paper.revision,
			content: submittedContent(paper.kind, stored.paper.markdown) ?? undefined
		});

		if (error === null) return { refusal: null };

		const isLastAttempt = attempt === SUBMIT_ATTEMPTS;

		// Another author saved between the read and the send: read the text again.
		if (error.code === TEXT_CHANGED_CODE && !isLastAttempt) continue;

		if (REFUSAL_CODES.has(error.code) || error.code === TEXT_CHANGED_CODE) {
			return { refusal: error.message };
		}

		throw new Error(`Could not submit the paper: ${error.message}`);
	}

	// Every attempt above returns or continues, and the last one never continues.
	throw new Error('Could not submit the paper.');
}

/** "Withdraw": an author takes the paper back before it is introduced. */
export async function withdrawCommitteePaper(
	supabase: SupabaseClient,
	paperId: string
): Promise<PaperChange> {
	const { error } = await supabase.rpc('withdraw_paper', { paper_id: paperId });

	if (error === null) return { refusal: null };

	if (REFUSAL_CODES.has(error.code)) return { refusal: error.message };

	throw new Error(`Could not withdraw the paper: ${error.message}`);
}

/** The columns of a paper that say what the dais last decided. */
type DecisionRow = {
	decided_at: string | null;
	decided_by: string | null;
	return_comment: string | null;
};

/** One of the dais by their account: their name, and their title on this committee's dais. */
async function readDaisMember(
	supabase: SupabaseClient,
	committeeId: string,
	userId: string
): Promise<DaisMember | null> {
	const [profile, chair] = await Promise.all([
		supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
		supabase
			.from('committee_chairs')
			.select('title')
			.eq('committee_id', committeeId)
			.eq('user_id', userId)
			.maybeSingle()
	]);

	if (profile.error) throw new Error(`Could not read who decided: ${profile.error.message}`);

	if (!profile.data) return null;

	// Somebody with `run_room` need not be one of the committee's chairs, and then has no title.
	return { name: profile.data.full_name, title: chair.data?.title ?? null };
}

/**
 * What the dais last decided about the paper, and who decided it, or `null`
 * while it has decided nothing since the paper was last submitted.
 */
export async function readPaperDecision(
	supabase: SupabaseClient,
	committeeId: string,
	paperId: string
): Promise<PaperDecision | null> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select('decided_at, decided_by, return_comment')
		.eq('id', paperId)
		.maybeSingle()
		.overrideTypes<DecisionRow, { merge: false }>();

	if (error) throw new Error(`Could not read what the dais decided: ${error.message}`);

	if (!data || data.decided_at === null) return null;

	return {
		decidedAt: data.decided_at,
		decidedBy:
			data.decided_by === null
				? null
				: await readDaisMember(supabase, committeeId, data.decided_by),
		returnComment: data.return_comment
	};
}

/**
 * The chair a submitted paper waits for, named beside it: the committee's
 * only chair, or `null` where it has several or none, and "the dais" decides.
 */
export async function readPaperChair(
	supabase: SupabaseClient,
	committeeId: string
): Promise<DaisMember | null> {
	const chairs = await listCommitteeChairs(supabase, committeeId);

	if (chairs.length !== 1) return null;

	return { name: chairs[0].fullName, title: chairs[0].title };
}
