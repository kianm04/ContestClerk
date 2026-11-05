/*
	Reading and deciding the suggestions in a paper's text (docs/committee-papers.md,
	section 7). `paper-suggestion-marks.ts` defines the two marks a suggestion
	leaves and `paper-suggesting.ts` turns typing into them. This file only looks
	at a document as it stands: which suggestions it holds, what each would do,
	and what the text is once they are accepted or rejected.

	Positions here are ProseMirror's: every character, and every edge where a
	block opens or closes, counts one. A paragraph whose text starts at `start`
	and ends at `end` sits between `start - 1` and `end + 1`.
*/

import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';
import {
	BREAK_MARKER,
	SUGGESTED_DELETION,
	SUGGESTED_INSERTION,
	type SuggestionMarkAttributes
} from '$lib/paper-suggestion-marks';

/** A block that holds text (a paragraph, a heading), by where its text starts and ends. */
export type Textblock = { node: ProseMirrorNode; start: number; end: number };

/** Every block that holds text, in the order they are read. */
export function textblocksOf(document: ProseMirrorNode): Textblock[] {
	const textblocks: Textblock[] = [];

	document.descendants((node, position) => {
		if (!node.isTextblock) return true;
		textblocks.push({ node, start: position + 1, end: position + 1 + node.content.size });
		// Nothing inside a textblock is another textblock.
		return false;
	});

	return textblocks;
}

/**
 * Whether the textblock at `index` starts with a break marker, standing for a
 * suggested break between it and the textblock before. The first textblock
 * has no break before it, so a marker there stands for nothing.
 */
export function startsWithBreakMarker(textblocks: Textblock[], index: number): boolean {
	return index > 0 && (textblocks[index].node.firstChild?.text?.startsWith(BREAK_MARKER) ?? false);
}

/** Whether a mark is one of the two a suggestion leaves. */
export function isSuggestionMark(mark: Mark): boolean {
	return mark.type.name === SUGGESTED_INSERTION || mark.type.name === SUGGESTED_DELETION;
}

/** One stretch of text carrying one suggestion's mark. */
type Piece = {
	kind: 'insertion' | 'deletion';
	mark: Mark;
	attributes: SuggestionMarkAttributes;
	from: number;
	to: number;
	/** Its text, without break markers. */
	text: string;
	/** Which textblock it is in, counted from 0. */
	textblock: number;
	/** Whether it starts with the marker for the break before its textblock. */
	startsWithMarker: boolean;
	/** Where the previous textblock's text ends, for undoing a break. */
	previousEnd: number;
};

function piecesOf(document: ProseMirrorNode): Piece[] {
	const textblocks = textblocksOf(document);
	const pieces: Piece[] = [];

	textblocks.forEach((textblock, index) => {
		textblock.node.forEach((child, offset) => {
			if (!child.isText) return;

			for (const mark of child.marks) {
				if (!isSuggestionMark(mark)) continue;

				const from = textblock.start + offset;
				pieces.push({
					kind: mark.type.name === SUGGESTED_INSERTION ? 'insertion' : 'deletion',
					mark,
					attributes: mark.attrs as SuggestionMarkAttributes,
					from,
					to: from + child.nodeSize,
					text: (child.text ?? '').replaceAll(BREAK_MARKER, ''),
					textblock: index,
					startsWithMarker: offset === 0 && startsWithBreakMarker(textblocks, index),
					previousEnd: index > 0 ? textblocks[index - 1].end : -1
				});
			}
		});
	});

	return pieces;
}

/** What a suggestion would do, for its card in the margin. */
export type SuggestionSummary =
	| { verb: 'replace'; deleted: string; inserted: string }
	| { verb: 'add'; inserted: string }
	| { verb: 'delete'; deleted: string }
	| { verb: 'format'; text: string }
	| { verb: 'split' }
	| { verb: 'join' };

export type Suggestion = SuggestionMarkAttributes & {
	/** Where its first piece starts and its last ends, to place its card and light its words. */
	from: number;
	to: number;
	summary: SuggestionSummary;
};

/** The text of one kind of piece, a space between the pieces in different textblocks. */
function piecesText(pieces: Piece[], kind: Piece['kind']): string {
	let text = '';
	let lastTextblock = -1;

	for (const piece of pieces) {
		if (piece.kind !== kind || piece.text === '') continue;
		if (lastTextblock !== -1 && piece.textblock !== lastTextblock) text += ' ';
		text += piece.text;
		lastTextblock = piece.textblock;
	}

	return text;
}

const LONGEST_QUOTE = 60;

/** Text short enough to quote on a card: spaces run together, and cut with "…". */
export function quoteForCard(text: string): string {
	const collapsed = text.replace(/\s+/g, ' ');
	// Keep a deleted space visible as a space rather than as nothing.
	const quote = collapsed.trim() === '' ? collapsed : collapsed.trim();
	if (quote.length <= LONGEST_QUOTE) return quote;

	// Cut between two words when there is a space not too far back, so no word is left half shown.
	const cut = quote.slice(0, LONGEST_QUOTE - 1);
	const lastSpace = cut.lastIndexOf(' ');
	return `${(lastSpace > LONGEST_QUOTE / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function summarise(pieces: Piece[]): SuggestionSummary {
	const deleted = piecesText(pieces, 'deletion');
	const inserted = piecesText(pieces, 'insertion');

	// The same words out and back in is a change of formatting, such as bold.
	if (deleted !== '' && deleted === inserted)
		return { verb: 'format', text: quoteForCard(deleted) };
	if (deleted !== '' && inserted !== '') {
		return { verb: 'replace', deleted: quoteForCard(deleted), inserted: quoteForCard(inserted) };
	}
	if (inserted !== '') return { verb: 'add', inserted: quoteForCard(inserted) };
	if (deleted !== '') return { verb: 'delete', deleted: quoteForCard(deleted) };

	const addsBreak = pieces.some((piece) => piece.kind === 'insertion' && piece.startsWithMarker);
	return addsBreak ? { verb: 'split' } : { verb: 'join' };
}

/** Every suggestion in the document, in the order its first words are read. */
export function readSuggestions(document: ProseMirrorNode): Suggestion[] {
	const piecesById = new Map<string, Piece[]>();

	for (const piece of piecesOf(document)) {
		const pieces = piecesById.get(piece.attributes.id) ?? [];
		pieces.push(piece);
		piecesById.set(piece.attributes.id, pieces);
	}

	return [...piecesById.values()].map((pieces) => ({
		...pieces[0].attributes,
		// The pieces were not all written at once; the card shows the latest.
		at: pieces.reduce(
			(latest, piece) => (piece.attributes.at > latest ? piece.attributes.at : latest),
			''
		),
		from: pieces[0].from,
		to: Math.max(...pieces.map((piece) => piece.to)),
		summary: summarise(pieces)
	}));
}

/** How many suggestions are still to be decided. */
export function countSuggestions(document: ProseMirrorNode): number {
	return new Set(piecesOf(document).map((piece) => piece.attributes.id)).size;
}

/** Deletes every break marker between `from` and `to` that no suggestion needs any more. */
function deleteBareMarkers(transform: Transform, from: number, to: number): void {
	const bareMarkers: number[] = [];

	transform.doc.nodesBetween(from, to, (node, position) => {
		if (!node.isText || node.marks.some(isSuggestionMark)) return;

		const text = node.text ?? '';
		for (let index = 0; index < text.length; index++) {
			const at = position + index;
			if (text[index] === BREAK_MARKER && at >= from && at < to) bareMarkers.push(at);
		}
	});

	// From the last, so deleting one leaves the positions of the others as they were.
	for (const at of bareMarkers.reverse()) transform.delete(at, at + 1);
}

export type SuggestionDecision = 'accept' | 'reject';

/**
 * Accepts or rejects suggestion `id` in `transform`. Accepting an insertion
 * keeps its words and rejecting it takes them out; a deletion the other way
 * round. The mark comes off whatever is kept, and a break marker kept for a
 * break goes with it, because the break is now just a break.
 */
export function decideSuggestion(
	transform: Transform,
	id: string,
	decision: SuggestionDecision
): void {
	const pieces = piecesOf(transform.doc).filter((piece) => piece.attributes.id === id);

	// From the last, so each change leaves the positions of the pieces before it as they were.
	for (const piece of pieces.reverse()) {
		const takesOut = (piece.kind === 'insertion') === (decision === 'reject');

		if (takesOut) {
			// A marker's piece reaches back over the break it stands for, so the two textblocks join.
			transform.delete(piece.startsWithMarker ? piece.previousEnd : piece.from, piece.to);
		} else {
			transform.removeMark(piece.from, piece.to, piece.mark);
			deleteBareMarkers(transform, piece.from, piece.to);
		}
	}
}

/**
 * The document as it is agreed: every suggestion rejected and every marker
 * gone. This is what the paper's stored Markdown, its word counts and its
 * format checks read. A document whose schema has no suggestion marks (one
 * not written live) has none to reject and comes back as it was.
 */
export function agreedDocument(document: ProseMirrorNode): ProseMirrorNode {
	const marks = document.type.schema.marks;
	if (!marks[SUGGESTED_INSERTION] || !marks[SUGGESTED_DELETION]) return document;

	const transform = new Transform(document);
	for (const id of new Set(piecesOf(document).map((piece) => piece.attributes.id))) {
		decideSuggestion(transform, id, 'reject');
	}
	deleteBareMarkers(transform, 0, transform.doc.content.size);

	return transform.doc;
}
