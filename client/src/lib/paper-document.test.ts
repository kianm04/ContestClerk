import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
	deleted,
	inserted,
	paper,
	paragraph,
	sharedDocumentHolding,
	suggestion
} from '../../tests/paper-suggestion-fixtures';
import {
	base64ToBytes,
	bytesToBase64,
	openPaperDocument,
	paperDocumentLineage,
	paperDocumentMarkdown,
	paperDocumentState,
	paperDocumentSuggestionCount,
	seedPaperDocument,
	writeMarkdownIntoPaperDocument
} from './paper-document';

const PAPER = [
	'## Position of France',
	'',
	'France **supports** a *binding* treaty on [ocean plastics](https://example.org).',
	'',
	'- Fund recycling',
	'- Ban microbeads',
	'',
	'1. First',
	'2. Second'
].join('\n');

/** Send everything `from` has that `to` lacks, the way the channel does. */
function sendAcross(from: Y.Doc, to: Y.Doc): void {
	Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)));
}

describe('seedPaperDocument', () => {
	it('holds the Markdown it was started from, formatting and all', () => {
		const document = openPaperDocument(seedPaperDocument(PAPER));

		expect(paperDocumentMarkdown(document)).toBe(PAPER);
	});

	it('gives two browsers seeding the same text one copy of it, not two', () => {
		const first = openPaperDocument(seedPaperDocument(PAPER));
		const second = openPaperDocument(seedPaperDocument(PAPER));

		sendAcross(first, second);
		sendAcross(second, first);

		expect(paperDocumentMarkdown(first)).toBe(PAPER);
		expect(paperDocumentMarkdown(second)).toBe(PAPER);
	});

	it('starts an empty paper as an empty document', () => {
		expect(paperDocumentMarkdown(openPaperDocument(seedPaperDocument('')))).toBe('');
	});
});

describe('paperDocumentLineage', () => {
	it('is the same for every copy grown from one start', () => {
		const first = openPaperDocument(seedPaperDocument(PAPER));
		writeMarkdownIntoPaperDocument(first, `${PAPER}\n\nMore.`);
		const second = openPaperDocument(paperDocumentState(first));

		expect(paperDocumentLineage(second)).toBe(paperDocumentLineage(first));
		expect(paperDocumentLineage(first)).not.toBeNull();
	});

	it('differs for a draft started again from other text, as after a submit', () => {
		const before = openPaperDocument(seedPaperDocument(''));
		const after = openPaperDocument(seedPaperDocument(PAPER));

		expect(paperDocumentLineage(after)).not.toBe(paperDocumentLineage(before));
	});

	it('is null for a document nothing reached yet', () => {
		expect(paperDocumentLineage(new Y.Doc())).toBeNull();
	});
});

describe('two people writing in one paragraph at once', () => {
	it('keeps both of their words, in both copies, in any order', () => {
		const start = seedPaperDocument('France supports a treaty.');
		const rachel = openPaperDocument(start);
		const tom = openPaperDocument(start);

		writeMarkdownIntoPaperDocument(rachel, 'France strongly supports a treaty.');
		writeMarkdownIntoPaperDocument(tom, 'France supports a binding treaty.');
		sendAcross(rachel, tom);
		sendAcross(tom, rachel);

		const expected = 'France strongly supports a binding treaty.';
		expect(paperDocumentMarkdown(rachel)).toBe(expected);
		expect(paperDocumentMarkdown(tom)).toBe(expected);
	});

	it('merges edits made offline once the stored states are put together', () => {
		const start = seedPaperDocument('One.\n\nTwo.');
		const offline = openPaperDocument(start);
		const online = openPaperDocument(start);

		writeMarkdownIntoPaperDocument(offline, 'One, written on the train.\n\nTwo.');
		writeMarkdownIntoPaperDocument(online, 'One.\n\nTwo, written at school.');
		const merged = openPaperDocument(paperDocumentState(online), paperDocumentState(offline));

		expect(paperDocumentMarkdown(merged)).toBe(
			'One, written on the train.\n\nTwo, written at school.'
		);
	});
});

describe('writeMarkdownIntoPaperDocument', () => {
	it('makes the document read the new Markdown', () => {
		const document = openPaperDocument(seedPaperDocument(PAPER));

		writeMarkdownIntoPaperDocument(document, 'Only this now.');

		expect(paperDocumentMarkdown(document)).toBe('Only this now.');
	});
});

describe('a document with suggestions in it (docs/committee-papers.md, section 7)', () => {
	const BEN = suggestion('b1', 'ben');
	const ANA = suggestion('a1', 'ana');
	// Ben suggests "supports" for "backs", and Ana suggests adding " now".
	const SUGGESTED = paper(
		paragraph(
			'France ',
			deleted('backs', BEN),
			inserted('supports', BEN),
			' a treaty',
			inserted(' now', ANA),
			'.'
		)
	);

	it('stores the agreed text as its Markdown, as if every suggestion were rejected', () => {
		expect(paperDocumentMarkdown(sharedDocumentHolding(SUGGESTED))).toBe('France backs a treaty.');
	});

	it('counts the suggestions still to decide, whatever pieces they are in', () => {
		expect(paperDocumentSuggestionCount(sharedDocumentHolding(SUGGESTED))).toBe(2);
		expect(paperDocumentSuggestionCount(openPaperDocument(seedPaperDocument(PAPER)))).toBe(0);
	});
});

describe('bytesToBase64 and base64ToBytes', () => {
	it('carry the document there and back unchanged', () => {
		const state = seedPaperDocument(PAPER);

		expect(base64ToBytes(bytesToBase64(state))).toEqual(state);
	});
});
