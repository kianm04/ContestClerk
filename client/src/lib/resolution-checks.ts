/*
	The format checks of a draft resolution or a committee directive
	(docs/committee-papers.md, section 4, "Format checks are warnings, never
	blocks"). The writer page lists them beside the paper and the dais reads
	them in its review; none stops a paper being submitted, because the dais
	decides. A committee that writes in its own format turns them off
	(`checks_format`).

	Every warning names its clause the way `clauseName` does, "clause 4" or
	"preambulatory clause 2", so the editor can underline the spot it is about
	(`$lib/resolution-editor.ts`).

	This file is plain TypeScript with no Svelte in it, so the browser and the
	server both use it.
*/

import {
	clauseContentFromMarkdown,
	clauseName,
	numberedClauses,
	type NumberedClause
} from '$lib/paper-clauses';
import { clausePlainText, hasOpeningPhrase } from '$lib/resolution-phrases';

/** One thing in the text that does not follow the format. */
export type FormatWarning = {
	/** The clause it is about, as `clauseName` writes it. */
	clauseName: string;
	/** "Clause 4 should end with a semicolon." */
	sentence: string;
};

/** "Clause 4", "Preambulatory clause 2": a clause's name at the start of a sentence. */
function sentenceName(clause: NumberedClause): string {
	const name = clauseName(clause);

	return name.charAt(0).toUpperCase() + name.slice(1);
}

/*
	What may follow the last punctuation mark of a clause without being it:
	space, closing quotation marks and closing brackets. So `“…systems”;` and
	`“…systems;”` both end with a semicolon, and `(2018),` with a comma.
*/
const AFTER_THE_LAST_MARK = /[\s"'”’»›)\]}]+$/u;

/** The last character of the clause's words, ignoring formatting, spaces, closing quotes and brackets. */
function lastMark(clause: NumberedClause): string {
	return clausePlainText(clause.markdown).replace(AFTER_THE_LAST_MARK, '').slice(-1);
}

/** Is there any word in the clause, once its Markdown is set aside? An empty one is not checked. */
function hasWords(clause: NumberedClause): boolean {
	return clausePlainText(clause.markdown).trim() !== '';
}

/*
	What each clause ends with: a comma after a preambulatory clause, a
	semicolon after an operative clause, a colon before sub-clauses, and a full
	stop after the very last clause. A clause that leads into sub-clauses may
	also end with a semicolon, which some conferences prefer.
*/
function endingWarning(
	clause: NumberedClause,
	isLast: boolean,
	hasSubClauses: boolean
): string | null {
	const mark = lastMark(clause);

	if (isLast) return mark === '.' ? null : 'The last clause should end with a full stop.';

	if (clause.part === 'preamble') {
		return mark === ',' ? null : `${sentenceName(clause)} should end with a comma.`;
	}

	if (hasSubClauses) {
		return mark === ':' || mark === ';'
			? null
			: `${sentenceName(clause)} should end with a colon, before its sub-clauses.`;
	}

	return mark === ';' ? null : `${sentenceName(clause)} should end with a semicolon.`;
}

/**
 * What in the text does not follow the format, in reading order: a clause
 * that starts with no opening phrase, known or marked, and a clause that
 * ends with the wrong mark. A sub-clause starts with a lowercase verb, so
 * only a preambulatory clause and a numbered operative clause are asked for
 * an opening phrase. A text with no clauses has nothing to warn about yet,
 * and a clause with no words in it is skipped until it has some.
 */
export function formatWarnings(preamble: string, operative: string): FormatWarning[] {
	const clauses = numberedClauses(clauseContentFromMarkdown(preamble, operative)).filter(hasWords);

	return clauses.flatMap((clause, index) => {
		const warnings: FormatWarning[] = [];
		const name = clauseName(clause);
		const next = clauses[index + 1];
		const hasSubClauses = next !== undefined && next.level > clause.level && clause.level > 0;

		if (clause.level <= 1 && !hasOpeningPhrase(clause.markdown, clause.part)) {
			warnings.push({
				clauseName: name,
				sentence: `${sentenceName(clause)} should start with an opening phrase.`
			});
		}

		const ending = endingWarning(clause, next === undefined, hasSubClauses);
		if (ending !== null) warnings.push({ clauseName: name, sentence: ending });

		return warnings;
	});
}
