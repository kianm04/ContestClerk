/**
 * The amendment the room votes on, for the projector (`docs/committee-papers.md`,
 * step 7): the vote the room's state points at, the amendment tied to it by
 * `votes.amendment_id`, and the clause it changes as the draft stands now.
 * The words are put together in `$lib/amendment-on-screen.ts`.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { amendmentTarget, type DraftVersion } from '$lib/amendment-cards';
import {
	amendmentHeadline,
	proposedByLine,
	type AmendmentOnScreen
} from '$lib/amendment-on-screen';
import type { AmendmentTarget } from '$lib/amendment-wording';
import type { PaperKind } from '$lib/committee-papers';
import type { PaperAmendment } from '$lib/paper-amendments';
import type { AmendmentScreenPage } from '$lib/paper-on-screen';
import { floorPaper } from '$lib/papers-on-floor';
import { withOpeningPhraseMarked } from '$lib/resolution-reading';
import { renderMarkdown } from './markdown';
import { readPaperAmendments, readPaperVersions } from './paper-amendments';

type VoteAmendmentRow = { amendment: { paper_id: string } | null; amendment_id: string | null };

type PaperNameRow = {
	id: string;
	kind: PaperKind;
	title: string;
	topic_number: number | null;
	sequence: number | null;
};

/** The amendment tied to a vote and the draft it amends, or null for a vote on anything else. */
async function readVoteAmendment(
	supabase: SupabaseClient,
	voteId: string
): Promise<{ amendmentId: string; paperId: string } | null> {
	const { data, error } = await supabase
		.from('votes')
		.select('amendment_id, amendment:amendments(paper_id)')
		.eq('id', voteId)
		.maybeSingle()
		.overrideTypes<VoteAmendmentRow, { merge: false }>();

	if (error) throw new Error(`Could not read the vote's amendment: ${error.message}`);
	if (data?.amendment_id == null || data.amendment === null) return null;

	return { amendmentId: data.amendment_id, paperId: data.amendment.paper_id };
}

/** The draft's name, "Draft resolution 1.1", or null when Row Level Security hides it. */
async function readPaperName(supabase: SupabaseClient, paperId: string): Promise<string | null> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select('id, kind, title, topic_number, sequence')
		.eq('id', paperId)
		.maybeSingle()
		.overrideTypes<PaperNameRow, { merge: false }>();

	if (error) throw new Error(`Could not read the amended draft: ${error.message}`);
	if (data === null) return null;

	return floorPaper({
		id: data.id,
		kind: data.kind,
		title: data.title,
		topicNumber: data.topic_number,
		sequence: data.sequence
	}).name;
}

/** Words of a clause as HTML, the opening phrase marked where a top clause has one. */
function clauseWordsHtml(markdown: string, part: 'preamble' | 'operative', level: number): string {
	return renderMarkdown(level <= 1 ? withOpeningPhraseMarked(markdown, part) : markdown);
}

/**
 * The clause on screen: what the amendment strikes, drawn struck through,
 * and its new words. A change strikes the clause's words as they stood when
 * it was proposed; an amendment to an amendment, the amendment's words.
 */
export function amendmentScreenPage(
	amendment: PaperAmendment,
	target: AmendmentTarget
): AmendmentScreenPage {
	const { clause, before, parent } = target;
	const part = amendment.targetPart;
	const level = parent === null ? (clause?.level ?? 1) : 1;
	const struck = amendment.action === 'strike' ? (clause?.markdown ?? null) : before;
	const isNumbered = parent === null && amendment.action !== 'add' && clause !== null;

	return {
		shows: 'amendment',
		reference: isNumbered ? clause.reference : null,
		struckHtml:
			amendment.action === 'add' || struck === null ? null : clauseWordsHtml(struck, part, level),
		newHtml:
			amendment.textMarkdown === null ? null : clauseWordsHtml(amendment.textMarkdown, part, level)
	};
}

/**
 * The amendment the room votes on, or has just voted on until "End voting",
 * or null when the vote is on anything else or there is none.
 */
export async function readAmendmentVoteForScreen(
	supabase: SupabaseClient,
	voteId: string | null
): Promise<AmendmentOnScreen | null> {
	if (voteId === null) return null;

	const tie = await readVoteAmendment(supabase, voteId);

	if (tie === null) return null;

	const [amendments, versions, paperName] = await Promise.all([
		readPaperAmendments(supabase, tie.paperId),
		readPaperVersions(supabase, tie.paperId),
		readPaperName(supabase, tie.paperId)
	]);
	const amendment = amendments.find((each) => each.id === tie.amendmentId);

	if (amendment === undefined || paperName === null) return null;

	const target = amendmentTarget(amendment, amendments, versions satisfies DraftVersion[]);

	return {
		sequence: amendment.sequence,
		paperName,
		headline: amendmentHeadline(amendment, target),
		proposedLine: proposedByLine(amendment),
		page: amendmentScreenPage(amendment, target)
	};
}
