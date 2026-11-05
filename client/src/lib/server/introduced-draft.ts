/**
 * An introduced draft resolution as its page reads it (`docs/committee-papers.md`,
 * step 7): the text as it stands, which is the latest version once
 * amendments are written in, and its amendments as cards beside their
 * clauses.
 *
 * The text is drawn clause by clause, so each clause carries an id,
 * `clause-<its id>`, that a card can sit level with. `renderMarkdown` lets no
 * ids through, so the ids go on the elements drawn here around what it made.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { amendmentCards, type AmendmentCard } from '$lib/amendment-cards';
import {
	amendmentsWaitingForSeat,
	type AmendmentReader,
	type AmendmentRules
} from '$lib/paper-amendments';
import type { ClauseContent, ClausePart, OperativeClause } from '$lib/paper-clauses';
import { withOpeningPhraseMarked } from '$lib/resolution-reading';
import { renderMarkdown } from '$lib/server/markdown';
import {
	readAmendmentRules,
	readPaperAmendments,
	readPaperVersions
} from '$lib/server/paper-amendments';

/** An id is the server's own, but it goes into HTML, so only letters and digits pass. */
const CLAUSE_ID = /^[a-z0-9]+$/;

/** The id a clause is drawn with, which a card and a link point at. */
export function clauseElementId(clauseId: string): string {
	return `clause-${clauseId}`;
}

/** One clause's words as HTML, its opening phrase styled where a top clause has one, without the paragraph around them. */
function clauseHtml(markdown: string, part: ClausePart, hasPhrase: boolean): string {
	const html = renderMarkdown(
		hasPhrase ? withOpeningPhraseMarked(markdown, part) : markdown
	).trim();
	const single = /^<p>([\s\S]*?)<\/p>$/.exec(html);

	return single !== null && !single[1].includes('<p>') ? single[1] : html;
}

/** The `id` attribute for a clause, or nothing for an id that is not plain letters and digits. */
function idAttribute(clauseId: string): string {
	return CLAUSE_ID.test(clauseId) ? ` id="${clauseElementId(clauseId)}"` : '';
}

/** A numbered list of operative clauses, each with its sub-clauses in a list inside it. */
function operativeHtml(clauses: OperativeClause[], level: number): string {
	if (clauses.length === 0) return '';

	const items = clauses.map(
		(clause) =>
			`<li${idAttribute(clause.id)}>${clauseHtml(clause.markdown, 'operative', level === 1)}${operativeHtml(clause.children, level + 1)}</li>`
	);

	return `<ol>${items.join('')}</ol>`;
}

/**
 * The draft's text as safe HTML, one paragraph per preambulatory clause and
 * one numbered list for the operative clauses, lettered by `resolution-text`
 * in the global stylesheet, every clause with its id.
 */
export function clauseAnchoredHtml(content: ClauseContent): string {
	const preamble = content.preamble.map(
		(clause) => `<p${idAttribute(clause.id)}>${clauseHtml(clause.markdown, 'preamble', true)}</p>`
	);

	return [...preamble, operativeHtml(content.operative, 1)].join('');
}

/** What the page of an introduced draft resolution shows about its text and its amendments. */
export type IntroducedDraft = {
	/** The text as it stands, with an id on every clause. */
	bodyHtml: string;
	/** Its version: 1 as submitted, one more for every amendment written in. */
	versionNumber: number;
	/** The text as it stands, for placing the cards in its order. */
	content: ClauseContent;
	rules: AmendmentRules;
	cards: AmendmentCard[];
	/** The numbers of the amendments the reader's seat has still to answer as a sponsor. */
	waitingForMe: number[];
};

/** Read the draft's versions and amendments, and draw both. */
export async function readIntroducedDraft(
	supabase: SupabaseClient,
	source: {
		paperId: string;
		committeeId: string;
		reader: AmendmentReader;
		sponsorsWord: string;
		timeZone: string;
	}
): Promise<IntroducedDraft> {
	const [versions, amendments, rules] = await Promise.all([
		readPaperVersions(supabase, source.paperId),
		readPaperAmendments(supabase, source.paperId),
		readAmendmentRules(supabase, source.committeeId)
	]);
	const latest = versions.at(-1);
	const content = latest?.content ?? { preamble: [], operative: [] };

	return {
		bodyHtml: clauseAnchoredHtml(content),
		versionNumber: latest?.versionNumber ?? 1,
		content,
		rules,
		cards: amendmentCards(amendments, {
			versions,
			rules,
			reader: source.reader,
			sponsorsWord: source.sponsorsWord,
			timeZone: source.timeZone,
			render: renderMarkdown
		}),
		waitingForMe: amendmentsWaitingForSeat(amendments, source.reader?.seatId ?? null).map(
			(amendment) => amendment.sequence
		)
	};
}
