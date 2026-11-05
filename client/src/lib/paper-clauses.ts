/**
 * The clauses of a draft resolution or a committee directive
 * (`docs/committee-papers.md`, sections 4 and 7).
 *
 * While a paper is being written its text is Markdown, which is what the
 * editor reads and writes: the preambulatory clauses are paragraphs, one
 * clause each, and the operative clauses are one numbered list, with a list
 * inside an item for its sub-clauses (a, b, c) and a list inside that for
 * theirs (i, ii, iii). Submitting turns the Markdown into clauses with ids,
 * and every version an amendment makes after that keeps them. That is what
 * lets an amendment point at clause 3(b) and keep pointing at it when the
 * clauses around it move. Numbers and letters are never stored: they are
 * worked out here whenever the text is shown.
 *
 * The database makes amendments with its own copy of `applyAmendment`
 * (`apply_amendment_to_content`, in the committee papers migration), and a
 * database test holds the two to the same answers.
 */

import type { Database } from '$lib/database.types';

/** A preambulatory clause: one paragraph, such as "Recalling its resolution 78/241,". */
export type PreambulatoryClause = { id: string; markdown: string };

/**
 * An operative clause with its sub-clauses, which may have sub-clauses of
 * their own. A clause three levels down has none.
 */
export type OperativeClause = { id: string; markdown: string; children: OperativeClause[] };

/** What a version of a draft resolution holds. A committee directive's preamble is empty. */
export type ClauseContent = { preamble: PreambulatoryClause[]; operative: OperativeClause[] };

/** The two parts of the text, as an amendment names them. */
export type ClausePart = 'preamble' | 'operative';

/** What an amendment does to its clause: add, change or strike. */
export type AmendmentAction = Database['public']['Enums']['amendment_action'];

/** Operative clauses go three levels deep: clause 1, sub-clause 1(a) and 1(a)(i). */
export const DEEPEST_OPERATIVE_LEVEL = 3;

/** A clause read from the Markdown, before it has an id. */
type ClauseWithoutId = { markdown: string; children: ClauseWithoutId[] };

/** A list item read from the Markdown, with how far in it starts. */
type ListItem = { indent: number; text: string };

/** A line of the Markdown: blank, the start of a list item, or text. */
type MarkdownLine =
	| { kind: 'blank' }
	| { kind: 'item'; indent: number; text: string }
	| { kind: 'text'; indent: number; text: string };

/*
	The start of a list item: a number, one or two letters or a roman numeral,
	then a full stop or a bracket ("1.", "b)", "iv."). That is the pattern the
	editor reads, so what it shows as a sub-clause is a sub-clause here too. A
	bullet ("-", "*" or "+") counts as well, for a list typed without the editor.
	The words start after one space and keep the rest, which wordsOf trims:
	"[ \t]+(.*)" would read the same, but on a line the pattern does not match
	it tries every way of sharing the spaces out, a time that grows with their
	square.
*/
const LIST_ITEM_LINE = /^([ \t]*)(?:(?:\d+|[ivxlcdm]+|[a-z]{1,2})[.)]|[-*+])(?:[ \t](.*))?$/i;

/** How far in a line starts, counting a tab as four spaces. */
function indentOf(leadingSpace: string): number {
	return leadingSpace.replaceAll('\t', '    ').length;
}

/*
	A line's words without the space around them. A backslash at the end is a
	line break in Markdown; a clause is one paragraph, so the break goes and the
	next line joins this one with a space.
*/
function wordsOf(line: string): string {
	return line.trim().replace(/\\$/, '').trim();
}

function readMarkdownLines(markdown: string): MarkdownLine[] {
	return markdown.split(/\r?\n/).map((line): MarkdownLine => {
		if (line.trim() === '') return { kind: 'blank' };

		const listItem = LIST_ITEM_LINE.exec(line);
		if (listItem) {
			return { kind: 'item', indent: indentOf(listItem[1]), text: wordsOf(listItem[2] ?? '') };
		}

		const leadingSpace = /^[ \t]*/.exec(line)?.[0] ?? '';
		return { kind: 'text', indent: indentOf(leadingSpace), text: wordsOf(line) };
	});
}

/** Two lines of one clause, made one. */
function joinLines(first: string, second: string): string {
	return [first, second].filter((text) => text !== '').join(' ');
}

/**
 * The preambulatory clauses, one per paragraph, with the ids p1, p2 and so
 * on. A paragraph's lines become one line, and an empty paragraph is no
 * clause. A line that starts like a list item starts a clause of its own and
 * loses its marker, so a preamble typed as a list is still one clause per
 * item rather than one long clause.
 */
export function preambulatoryClausesFromMarkdown(markdown: string): PreambulatoryClause[] {
	const paragraphs: string[] = [];
	let isInParagraph = false;

	for (const line of readMarkdownLines(markdown)) {
		if (line.kind === 'blank') {
			isInParagraph = false;
		} else if (line.kind === 'item' || !isInParagraph) {
			paragraphs.push(line.text);
			isInParagraph = true;
		} else {
			paragraphs[paragraphs.length - 1] = joinLines(paragraphs[paragraphs.length - 1], line.text);
		}
	}

	return paragraphs
		.filter((text) => text !== '')
		.map((text, index) => ({ id: `p${index + 1}`, markdown: text }));
}

/*
	The list items in the order they were written. Text straight after an item carries that item on, as it does in
	Markdown, and so does an indented paragraph after a blank line. Any other
	text starts an item of its own, so operative clauses typed as plain
	paragraphs are still clauses.
*/
function listItemsFromMarkdown(markdown: string): ListItem[] {
	const items: ListItem[] = [];
	let isAfterBlankLine = false;

	for (const line of readMarkdownLines(markdown)) {
		if (line.kind === 'blank') {
			isAfterBlankLine = true;
			continue;
		}

		const latestItem = items.at(-1);
		const carriesOn = line.kind === 'text' && (!isAfterBlankLine || line.indent > 0);

		if (latestItem && carriesOn) {
			latestItem.text = joinLines(latestItem.text, line.text);
		} else {
			items.push({ indent: line.indent, text: line.text });
		}
		isAfterBlankLine = false;
	}

	return items;
}

/*
	Puts list items into clauses and sub-clauses by how far in they start. The
	items that start least far in are clauses at this level; an item further in
	is a sub-clause of the clause before it. This is how the editor reads its
	own lists. Items further in than the deepest level stay at that level, so
	nothing typed is lost.
*/
function nestListItems(items: ListItem[], level: number): ClauseWithoutId[] {
	if (items.length === 0) return [];

	const clauseIndent = Math.min(...items.map((item) => item.indent));
	const groups: { text: string; itemsBelow: ListItem[] }[] = [];

	for (const item of items) {
		const latestGroup = groups.at(-1);
		const isSubClause =
			latestGroup !== undefined && item.indent > clauseIndent && level < DEEPEST_OPERATIVE_LEVEL;

		if (isSubClause) {
			latestGroup.itemsBelow.push(item);
		} else {
			groups.push({ text: item.text, itemsBelow: [] });
		}
	}

	return groups.map((group) => ({
		markdown: group.text,
		children: nestListItems(group.itemsBelow, level + 1)
	}));
}

/** Leaves out the clauses with no words, putting their sub-clauses in their place. */
function withoutEmptyClauses(clauses: ClauseWithoutId[]): ClauseWithoutId[] {
	return clauses.flatMap((clause) => {
		const children = withoutEmptyClauses(clause.children);

		return clause.markdown === '' ? children : [{ markdown: clause.markdown, children }];
	});
}

/**
 * Letters for a position, the way a spreadsheet names its columns: 1 is a,
 * 26 is z, 27 is aa.
 */
export function positionLetters(position: number): string {
	let letters = '';
	let remaining = position;

	while (remaining > 0) {
		const letterIndex = (remaining - 1) % 26;
		letters = String.fromCharCode(97 + letterIndex) + letters;
		remaining = Math.floor((remaining - 1) / 26);
	}

	return letters;
}

/*
	Ids for the operative clauses: o1, o2 at the top; the parent's id and a
	letter a level down (o1a, o1b); the parent's id and a number below that
	(o1a1). Level 2 ends in a letter and level 3 in a digit, so no two clauses
	can share an id.
*/
function withIds(clauses: ClauseWithoutId[], parentId: string, level: number): OperativeClause[] {
	return clauses.map((clause, index) => {
		const id = level === 2 ? parentId + positionLetters(index + 1) : `${parentId}${index + 1}`;

		return { id, markdown: clause.markdown, children: withIds(clause.children, id, level + 1) };
	});
}

/**
 * The operative clauses with their sub-clauses and ids, from the numbered
 * list. A list item with no words is left out, and its sub-clauses take its
 * place.
 */
export function operativeClausesFromMarkdown(markdown: string): OperativeClause[] {
	const clauses = nestListItems(listItemsFromMarkdown(markdown), 1);

	return withIds(withoutEmptyClauses(clauses), 'o', 1);
}

/**
 * The text of a paper being submitted, as clauses with ids. A committee
 * directive has no preambulatory clauses, so its preamble is ''.
 */
export function clauseContentFromMarkdown(
	preambleMarkdown: string,
	operativeMarkdown: string
): ClauseContent {
	return {
		preamble: preambulatoryClausesFromMarkdown(preambleMarkdown),
		operative: operativeClausesFromMarkdown(operativeMarkdown)
	};
}

const ROMAN_NUMERALS: [number, string][] = [
	[1000, 'm'],
	[900, 'cm'],
	[500, 'd'],
	[400, 'cd'],
	[100, 'c'],
	[90, 'xc'],
	[50, 'l'],
	[40, 'xl'],
	[10, 'x'],
	[9, 'ix'],
	[5, 'v'],
	[4, 'iv'],
	[1, 'i']
];

/** A position as a small roman numeral: 1 is i, 4 is iv, 12 is xii. */
export function romanNumeral(position: number): string {
	let numeral = '';
	let remaining = position;

	for (const [value, letters] of ROMAN_NUMERALS) {
		while (remaining >= value) {
			numeral += letters;
			remaining -= value;
		}
	}

	return numeral;
}

/** A clause with its place in the text, as a reader sees it. */
export type NumberedClause = {
	id: string;
	part: ClausePart;
	/** 0 for a preambulatory clause; 1 to 3 for an operative clause and its sub-clauses. */
	level: number;
	markdown: string;
	/** What is printed before it: "1.", "(a)" or "(i)", and nothing before a preambulatory clause. */
	marker: string;
	/** How a chair names it: "4", "1(a)" or "1(a)(ii)"; a preambulatory clause by its place, "2". */
	reference: string;
};

function numberedOperativeClauses(
	clauses: OperativeClause[],
	level: number,
	parentReference: string
): NumberedClause[] {
	return clauses.flatMap((clause, index) => {
		const position = index + 1;
		const label =
			level === 1
				? String(position)
				: level === 2
					? positionLetters(position)
					: romanNumeral(position);
		const reference = level === 1 ? label : `${parentReference}(${label})`;
		const numberedClause: NumberedClause = {
			id: clause.id,
			part: 'operative',
			level,
			markdown: clause.markdown,
			marker: level === 1 ? `${label}.` : `(${label})`,
			reference
		};

		return [numberedClause, ...numberedOperativeClauses(clause.children, level + 1, reference)];
	});
}

/**
 * Every clause in reading order, with its number: the preambulatory clauses
 * first, then each operative clause followed by its sub-clauses.
 */
export function numberedClauses(content: ClauseContent): NumberedClause[] {
	const preamble = content.preamble.map((clause, index): NumberedClause => ({
		id: clause.id,
		part: 'preamble',
		level: 0,
		markdown: clause.markdown,
		marker: '',
		reference: String(index + 1)
	}));

	return [...preamble, ...numberedOperativeClauses(content.operative, 1, '')];
}

/** "clause 1(a)", or "preambulatory clause 2": how an amendment or a comment names a clause. */
export function clauseName(clause: NumberedClause): string {
	return clause.part === 'preamble'
		? `preambulatory clause ${clause.reference}`
		: `clause ${clause.reference}`;
}

/** An amendment's change to the text, as the amendments table holds it. */
export type ClauseAmendment = {
	action: AmendmentAction;
	targetPart: ClausePart;
	/** The clause changed or struck; for an addition, the clause it follows, or null for the start. */
	targetClauseId: string | null;
	/** The new text of the clause, or of the clause added; null for a strike. */
	textMarkdown: string | null;
	/** "Amendment 3" on its draft. */
	sequence: number;
};

/** The id of the clause an amendment adds: a3 for amendment 3, which no submitted clause has. */
function addedClauseId(amendment: ClauseAmendment): string {
	return `a${amendment.sequence}`;
}

function amendPreamble(
	clauses: PreambulatoryClause[],
	amendment: ClauseAmendment,
	newText: string
): PreambulatoryClause[] {
	return clauses.flatMap((clause) => {
		if (clause.id !== amendment.targetClauseId) return [clause];
		if (amendment.action === 'change') return [{ id: clause.id, markdown: newText }];
		if (amendment.action === 'add') {
			return [clause, { id: addedClauseId(amendment), markdown: newText }];
		}

		return [];
	});
}

function amendOperative(
	clauses: OperativeClause[],
	amendment: ClauseAmendment,
	newText: string
): OperativeClause[] {
	return clauses.flatMap((clause) => {
		if (clause.id !== amendment.targetClauseId) {
			return [{ ...clause, children: amendOperative(clause.children, amendment, newText) }];
		}
		if (amendment.action === 'change') return [{ ...clause, markdown: newText }];
		if (amendment.action === 'add') {
			return [clause, { id: addedClauseId(amendment), markdown: newText, children: [] }];
		}

		return [];
	});
}

/**
 * The text with one amendment made. A change keeps the clause's sub-clauses
 * and a strike takes them with it. An added clause goes straight after its
 * clause, at the same level, after that clause's own sub-clauses, or at the
 * start of its part when it names no clause; it has no sub-clauses yet. An
 * amendment whose clause is not there leaves the text as it was.
 */
export function applyAmendment(content: ClauseContent, amendment: ClauseAmendment): ClauseContent {
	// Only a strike has no text, which the amendments table makes sure of.
	const newText = amendment.textMarkdown ?? '';
	const startsThePart = amendment.action === 'add' && amendment.targetClauseId === null;

	if (amendment.targetPart === 'preamble') {
		const preamble = startsThePart
			? [{ id: addedClauseId(amendment), markdown: newText }, ...content.preamble]
			: amendPreamble(content.preamble, amendment, newText);

		return { ...content, preamble };
	}

	const operative = startsThePart
		? [{ id: addedClauseId(amendment), markdown: newText, children: [] }, ...content.operative]
		: amendOperative(content.operative, amendment, newText);

	return { ...content, operative };
}
