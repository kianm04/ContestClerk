/*
	A draft resolution or a directive as somebody who reads it sees it
	(docs/committee-papers.md, section 4): with each clause's opening phrase
	styled, italic in the preamble and underlined in the operative part, the
	way its authors' editor draws it. The editor only draws the styling over
	the text (`$lib/resolution-editor.ts`); the stored text has the phrases the
	authors marked by hand alone. So before the server turns the text into HTML
	for a reader, the phrases from the lists are marked in the Markdown too.

	This file is plain TypeScript with no Svelte in it, so the browser and the
	server both use it.
*/

import type { PaperKind } from '$lib/committee-papers';
import type { ClausePart } from '$lib/paper-clauses';
import { clausePlainText, markedOpeningPhrase, openingPhrase } from '$lib/resolution-phrases';
import { joinResolutionMarkdown, splitResolutionMarkdown } from '$lib/resolution-text';

/** A numbered operative clause, "1. Calls upon…": its number, and its words. Sub-clauses are indented. */
const NUMBERED_CLAUSE = /^(\d+[.)][ \t]+)(.*)$/;

/**
 * One clause's words with their opening phrase marked, italic in the
 * preamble and underlined in the operative part, for the projector, which
 * draws one clause at a time. The words come back as they were when the
 * phrase is marked already, when there is none, or when formatting sits
 * inside it (`Calls **upon**`), which a mark around it would break.
 */
export function withOpeningPhraseMarked(words: string, part: ClausePart): string {
	if (markedOpeningPhrase(words, part) !== null) return words;

	const phrase = openingPhrase(clausePlainText(words), part);
	const start = words.length - words.trimStart().length;
	if (phrase === null || !words.startsWith(phrase, start)) return words;

	const mark = part === 'preamble' ? '*' : '++';
	const end = start + phrase.length;

	return `${words.slice(0, start)}${mark}${phrase}${mark}${words.slice(end)}`;
}

/** Each paragraph of the preamble, which is one preambulatory clause. */
function markPreamble(preamble: string): string {
	return preamble
		.split(/\n{2,}/)
		.map((paragraph) => withOpeningPhraseMarked(paragraph, 'preamble'))
		.join('\n\n');
}

/** Each numbered operative clause. A sub-clause starts with a lowercase verb and no phrase. */
function markOperative(operative: string): string {
	return operative
		.split('\n')
		.map((line) => {
			const match = NUMBERED_CLAUSE.exec(line);

			return match ? match[1] + withOpeningPhraseMarked(match[2], 'operative') : line;
		})
		.join('\n');
}

/**
 * The paper's Markdown with its opening phrases marked, for a reader: a
 * draft resolution's preamble and operative part, a directive's operative
 * part. Any other kind has no clauses and comes back as it was.
 */
export function withOpeningPhrasesMarked(kind: PaperKind, markdown: string): string {
	if (kind === 'committee_directive') return markOperative(markdown);
	if (kind !== 'draft_resolution') return markdown;

	const { preamble, operative } = splitResolutionMarkdown(markdown);

	return joinResolutionMarkdown(markPreamble(preamble), markOperative(operative));
}
