/**
 * A paper on the projector, one clause at a time (`docs/committee-papers.md`,
 * section 6: "The projector shows the paper the dais put on screen, large,
 * with its clause numbers").
 *
 * As drawn, the projector shows a draft resolution or a directive the way a
 * chair takes the room through it: its preambulatory clauses together first,
 * then operative clause 1, 2, 3 in turn, each with its sub-clauses. The dais
 * moves it on with "Next clause" and back with "Previous clause". Each place
 * it can stand is a "stop": 0 for the preambulatory clauses, n for operative
 * clause n. The room's state keeps the stop in `committee_state.displayed_clause`,
 * which is null for the paper's start. The database never reads the clauses,
 * so the functions here keep a stop inside the paper: one past the last
 * clause, after an amendment struck it, is drawn as the last.
 *
 * Plain functions with no Svelte in them, so the browser and the server both
 * use them and they can be tested on their own.
 */

import { positionLetters, romanNumeral, type ClauseContent } from '$lib/paper-clauses';

/** How many clauses each part of a paper has, which is all its stops depend on. */
export type ClauseCounts = { preamble: number; operative: number };

/** Which way "Previous clause" and "Next clause" move the projector. */
export type ClauseDirection = 'previous' | 'next';

/** Where the projector stands in a paper, for the dais's buttons beside "Take off screen". */
export type ScreenStep = {
	/** "Operative clause 2 of 6", or "Preambulatory clauses". */
	position: string;
	hasPrevious: boolean;
	hasNext: boolean;
};

/** What the dais's screen buttons need: whether the paper is on the projector, and where in it. */
export type PaperScreen = {
	isOnScreen: boolean;
	/** Where the projector stands while the paper is on it with clauses; null otherwise. */
	step: ScreenStep | null;
};

/** A sub-clause on the projector: "(a)" or "(i)", its words as HTML, and its own sub-clauses. */
export type SubClauseForScreen = { label: string; html: string; subClauses: SubClauseForScreen[] };

/**
 * What the projector draws under the paper's title: its whole text, for a
 * paper without clauses; the preamble, under the line the clauses hang from;
 * one operative clause; or, during a vote on an amendment, the clause the
 * amendment changes (`$lib/amendment-on-screen.ts`).
 */
export type ScreenPage =
	| { shows: 'text'; html: string }
	| { shows: 'preamble'; opening: string; clauses: string[] }
	| { shows: 'clause'; number: number; html: string; subClauses: SubClauseForScreen[] }
	| AmendmentScreenPage;

/**
 * The clause an amendment under the vote changes, as HTML: its number
 * beside it ("2", "1(a)"), or null for a clause it adds or an amendment's
 * words; the words it strikes, drawn struck through; and its new words. A
 * strike has no new words, an addition nothing struck.
 */
export type AmendmentScreenPage = {
	shows: 'amendment';
	reference: string | null;
	struckHtml: string | null;
	newHtml: string | null;
};

/** The stop for the preambulatory clauses. Operative clause n is stop n. */
export const PREAMBLE_STOP = 0;

/** How many clauses a paper's text has in each part. */
export function clauseCounts(content: ClauseContent): ClauseCounts {
	return { preamble: content.preamble.length, operative: content.operative.length };
}

/** The first and last stops of a paper, or null for one with no clauses at all. */
function stopsOf(counts: ClauseCounts): { first: number; last: number } | null {
	if (counts.preamble === 0 && counts.operative === 0) return null;

	return {
		first: counts.preamble > 0 ? PREAMBLE_STOP : 1,
		last: counts.operative > 0 ? counts.operative : PREAMBLE_STOP
	};
}

/**
 * The stop the projector shows for what the room's state holds: the paper's
 * first stop for null, and a stop outside the paper drawn as its nearest end.
 * Null for a paper with no clauses, which is shown whole.
 */
export function shownClauseStop(
	counts: ClauseCounts,
	displayedClause: number | null
): number | null {
	const stops = stopsOf(counts);

	if (stops === null) return null;

	const wanted = displayedClause ?? stops.first;

	return Math.min(Math.max(wanted, stops.first), stops.last);
}

/** The stop "Previous clause" or "Next clause" moves to, which stays put at either end. */
export function steppedClauseStop(
	counts: ClauseCounts,
	displayedClause: number | null,
	direction: ClauseDirection
): number | null {
	const shown = shownClauseStop(counts, displayedClause);

	if (shown === null) return null;

	return shownClauseStop(counts, direction === 'next' ? shown + 1 : shown - 1);
}

/** "Operative clause 2 of 6", or "Preambulatory clauses": the grey line over the title. */
export function clausePositionText(counts: ClauseCounts, stop: number): string {
	if (stop === PREAMBLE_STOP) return 'Preambulatory clauses';

	return `Operative clause ${stop} of ${counts.operative}`;
}

/** Where the projector stands and which ways it can move, or null for a paper shown whole. */
export function screenStep(
	counts: ClauseCounts,
	displayedClause: number | null
): ScreenStep | null {
	const stops = stopsOf(counts);
	const shown = shownClauseStop(counts, displayedClause);

	if (stops === null || shown === null) return null;

	return {
		position: clausePositionText(counts, shown),
		hasPrevious: shown > stops.first,
		hasNext: shown < stops.last
	};
}

/** A sub-clause's label as a printed resolution writes it: "(b)" a level down, "(ii)" below that. */
export function subClauseLabel(level: 2 | 3, position: number): string {
	const label = level === 2 ? positionLetters(position) : romanNumeral(position);

	return `(${label})`;
}
