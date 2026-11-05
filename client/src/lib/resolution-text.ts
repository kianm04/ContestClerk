/**
 * Where a committee paper's text is kept, by kind (`docs/committee-papers.md`,
 * section 7). A working paper and the free-text kinds keep one Markdown text,
 * `body_markdown`. A draft resolution keeps its two parts apart, the
 * preambulatory clauses in `preamble_markdown` and the operative clauses in
 * `operative_markdown`, and a committee directive has the operative part alone.
 *
 * The authors write a draft resolution as one text in one editor: the
 * preambulatory clauses as paragraphs, then the operative clauses as one
 * numbered list. The first numbered list is where the operative part begins,
 * so the text is split there when it is saved and joined again when it is read.
 */

import type { PaperKind } from '$lib/committee-papers';
import type { PaperFragment } from '$lib/paper-comments';

/** The Markdown columns of `committee_papers` a paper of each kind uses. */
export type PaperTextColumns = {
	body_markdown: string | null;
	preamble_markdown: string | null;
	operative_markdown: string | null;
};

/*
	The first line of a numbered list that starts at the left edge, "1. " or
	"3) ": the first operative clause. An indented one is a list inside a
	paragraph's text and starts nothing.
*/
const TOP_LEVEL_NUMBERED_ITEM = /^\d+[.)](?:[ \t]|$)/;

/** The kinds whose text is clauses: the format the United Nations writes in. */
export function hasClauses(kind: PaperKind): boolean {
	return kind === 'draft_resolution' || kind === 'committee_directive';
}

/** The parts of a paper's text, as a thread on its words names them. */
export function paperParts(kind: PaperKind): PaperFragment[] {
	if (kind === 'draft_resolution') return ['preamble', 'operative'];
	if (kind === 'committee_directive') return ['operative'];

	return ['body'];
}

/**
 * A draft resolution's text cut into its two parts at its first numbered
 * list. Text before it is the preamble; the list and everything after it is
 * the operative part, so nothing the authors typed is ever lost.
 */
export function splitResolutionMarkdown(markdown: string): {
	preamble: string;
	operative: string;
} {
	// Trimmed first, so a text that starts with an indented numbered line
	// starts its operative part there. Trimmed only as a part, that line would
	// lose its indent and start the operative part the next time the joined
	// text is split, and submitting would find two different splits.
	const lines = markdown.trim().split('\n');
	const firstClause = lines.findIndex((line) => TOP_LEVEL_NUMBERED_ITEM.test(line));

	if (firstClause === -1) return { preamble: markdown.trim(), operative: '' };

	return {
		preamble: lines.slice(0, firstClause).join('\n').trim(),
		operative: lines.slice(firstClause).join('\n').trim()
	};
}

/** The two parts as the one text the editor shows, a blank line between them. */
export function joinResolutionMarkdown(preamble: string, operative: string): string {
	return [preamble.trim(), operative.trim()].filter((part) => part !== '').join('\n\n');
}

/** The columns a save writes for a paper of this kind, from the editor's one text. */
export function paperTextColumns(kind: PaperKind, markdown: string): PaperTextColumns {
	if (kind === 'draft_resolution') {
		const { preamble, operative } = splitResolutionMarkdown(markdown);

		return { body_markdown: null, preamble_markdown: preamble, operative_markdown: operative };
	}

	// A committee directive is operative clauses only, so all of it is that part.
	if (kind === 'committee_directive') {
		return { body_markdown: null, preamble_markdown: null, operative_markdown: markdown.trim() };
	}

	return { body_markdown: markdown, preamble_markdown: null, operative_markdown: null };
}

/** The one text the editor shows, from whichever columns the paper's kind uses. */
export function paperTextFromColumns(columns: PaperTextColumns): string {
	if (columns.body_markdown !== null) return columns.body_markdown;

	return joinResolutionMarkdown(columns.preamble_markdown ?? '', columns.operative_markdown ?? '');
}
