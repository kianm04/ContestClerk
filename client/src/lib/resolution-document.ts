/*
	Where the clauses of a draft resolution are in the editor's document
	(docs/committee-papers.md, section 4, "The draft resolution's text").

	The authors write the resolution as one text: the preambulatory clauses
	are paragraphs, and the operative clauses are one numbered list, with a
	list inside an item for sub-clauses (a), (b) and a list inside that for
	(i), (ii). `$lib/paper-clauses.ts` reads the same text from its Markdown;
	this file reads it from the editor's document instead, so the editor can
	style a clause's opening phrase and underline the spot a format check
	points at. Both number the clauses the same way, so "clause 1(b)" in a
	warning is the clause this file finds under that name.

	A ProseMirror document is a tree of nodes, and every place in it has a
	number, its position. A paragraph's text runs from one after the
	paragraph's own position to one before its end.
*/

import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
	DEEPEST_OPERATIVE_LEVEL,
	positionLetters,
	romanNumeral,
	type ClausePart
} from '$lib/paper-clauses';
import { openingPhrase } from '$lib/resolution-phrases';

/** Where some text is in the document, from one position to another. */
export type DocumentRange = { from: number; to: number };

/** One clause of the resolution, found in the editor's document. */
export type DocumentClause = {
	part: ClausePart;
	/** "preambulatory clause 2" or "clause 1(b)", as `clauseName` writes it. */
	name: string;
	/** 0 for a preambulatory clause; 1 to 3 for an operative clause and its sub-clauses. */
	level: number;
	/** The text of the clause's first paragraph, where its opening phrase is. */
	opening: DocumentRange;
	/** The text of its last paragraph, where its closing mark is. */
	ending: DocumentRange;
};

/** An operative clause before it has its number, with the clauses under it. */
type UnnumberedClause = {
	opening: DocumentRange;
	ending: DocumentRange;
	isEmpty: boolean;
	children: UnnumberedClause[];
};

const LIST_NAMES = new Set(['orderedList', 'bulletList']);

/** The text inside a paragraph that starts at `position`. */
function textRange(paragraph: ProseMirrorNode, position: number): DocumentRange {
	return { from: position + 1, to: position + paragraph.nodeSize - 1 };
}

/**
 * A list item's own text (its paragraphs) and the lists inside it. A list
 * deeper than the deepest level gives clauses at that level, beside this one,
 * as `$lib/paper-clauses.ts` reads them, so nothing typed is lost.
 */
function clausesOfItem(item: ProseMirrorNode, position: number, level: number): UnnumberedClause[] {
	const paragraphs: DocumentRange[] = [];
	const children: UnnumberedClause[] = [];
	const deeper: UnnumberedClause[] = [];
	let words = '';

	item.forEach((child, offset) => {
		const childPosition = position + 1 + offset;

		if (child.isTextblock) {
			paragraphs.push(textRange(child, childPosition));
			words += child.textContent;
		} else if (LIST_NAMES.has(child.type.name)) {
			const isTooDeep = level >= DEEPEST_OPERATIVE_LEVEL;
			const listClauses = clausesOfList(child, childPosition, isTooDeep ? level : level + 1);
			(isTooDeep ? deeper : children).push(...listClauses);
		}
	});

	// An item with no paragraph of its own is drawn as an empty line at its start.
	const empty = { from: position + 1, to: position + 1 };
	const clause: UnnumberedClause = {
		opening: paragraphs[0] ?? empty,
		ending: paragraphs.at(-1) ?? empty,
		isEmpty: words.trim() === '',
		children
	};

	return [clause, ...deeper];
}

function clausesOfList(list: ProseMirrorNode, position: number, level: number): UnnumberedClause[] {
	const clauses: UnnumberedClause[] = [];

	list.forEach((item, offset) => {
		clauses.push(...clausesOfItem(item, position + 1 + offset, level));
	});

	return clauses;
}

/** Leaves out the clauses with no words, putting their sub-clauses in their place. */
function withoutEmptyClauses(clauses: UnnumberedClause[]): UnnumberedClause[] {
	return clauses.flatMap((clause) => {
		const children = withoutEmptyClauses(clause.children);

		return clause.isEmpty ? children : [{ ...clause, children }];
	});
}

/** Numbers the operative clauses "1", "1(a)", "1(a)(ii)", in reading order. */
function numbered(
	clauses: UnnumberedClause[],
	level: number,
	parentReference: string
): DocumentClause[] {
	return clauses.flatMap((clause, index) => {
		const position = index + 1;
		const label =
			level === 1
				? String(position)
				: level === 2
					? positionLetters(position)
					: romanNumeral(position);
		const reference = level === 1 ? label : `${parentReference}(${label})`;
		const found: DocumentClause = {
			part: 'operative',
			name: `clause ${reference}`,
			level,
			opening: clause.opening,
			ending: clause.ending
		};

		return [found, ...numbered(clause.children, level + 1, reference)];
	});
}

/**
 * Every clause in the document, in reading order: the paragraphs before the
 * first numbered list are the preambulatory clauses, and the list and
 * everything after it the operative ones. A clause with no words is no clause.
 */
export function documentClauses(document: ProseMirrorNode): DocumentClause[] {
	const preamble: DocumentClause[] = [];
	const operative: UnnumberedClause[] = [];
	let isOperative = false;

	document.forEach((node, position) => {
		if (node.type.name === 'orderedList') isOperative = true;

		if (isOperative && LIST_NAMES.has(node.type.name)) {
			operative.push(...clausesOfList(node, position, 1));
		} else if (isOperative && node.isTextblock) {
			// A paragraph after the list is one more clause, as the Markdown reads it.
			const text = textRange(node, position);
			const isEmpty = node.textContent.trim() === '';
			operative.push({ opening: text, ending: text, isEmpty, children: [] });
		} else if (node.isTextblock && node.textContent.trim() !== '') {
			const text = textRange(node, position);
			const name = `preambulatory clause ${preamble.length + 1}`;
			preamble.push({ part: 'preamble', name, level: 0, opening: text, ending: text });
		}
	});

	return [...preamble, ...numbered(withoutEmptyClauses(operative), 1, '')];
}

/**
 * Which part of the resolution a position is in: the operative part from the
 * first numbered list on, the preamble before it. A comment on some words is
 * kept with the part they are in.
 */
export function documentPartAt(document: ProseMirrorNode, position: number): ClausePart {
	let firstListAt: number | null = null;

	document.forEach((node, nodePosition) => {
		if (firstListAt === null && node.type.name === 'orderedList') firstListAt = nodePosition;
	});

	return firstListAt !== null && position >= firstListAt ? 'operative' : 'preamble';
}

/*
	The text of one paragraph, one character for each position in it. Text is
	one character a position already; a hard line break or anything else that
	is not text is one position too, so it is stood in for by one character.
*/
function paragraphText(document: ProseMirrorNode, range: DocumentRange): string {
	return document.textBetween(range.from, range.to, '', '￼');
}

/**
 * Where a clause's opening phrase is, when it starts with one from the lists
 * in `$lib/resolution-phrases.ts`, or `null`. Only a preambulatory clause and
 * a numbered operative clause have one; a sub-clause starts with a lowercase
 * verb instead.
 */
export function openingPhraseRange(
	document: ProseMirrorNode,
	clause: DocumentClause
): DocumentRange | null {
	if (clause.level > 1) return null;

	const text = paragraphText(document, clause.opening);
	const words = text.trimStart();
	const phrase = openingPhrase(words, clause.part);

	if (phrase === null) return null;

	const start = clause.opening.from + (text.length - words.length);

	return { from: start, to: start + phrase.length };
}

/**
 * The last word of a clause with the marks after it, "concerned," or
 * "seized.": where a format check about how the clause ends points.
 */
export function lastWordRange(document: ProseMirrorNode, clause: DocumentClause): DocumentRange {
	const text = paragraphText(document, clause.ending).trimEnd();
	const lastWordStart = text.search(/\S+$/);
	const start = lastWordStart === -1 ? text.length : lastWordStart;

	return { from: clause.ending.from + start, to: clause.ending.from + text.length };
}
