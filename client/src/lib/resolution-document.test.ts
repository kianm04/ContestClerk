// @vitest-environment jsdom
// The document is read from a real editor, which draws into a page, so this
// file runs in jsdom's pretend browser rather than in plain Node.

import type { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarkdownEditor } from './markdown-editor';
import {
	documentClauses,
	documentPartAt,
	lastWordRange,
	openingPhraseRange,
	type DocumentClause
} from './resolution-document';

// See `markdown-editor.test.ts`: jsdom lays nothing out, and ProseMirror asks.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const RESOLUTION = [
	'Recalling its resolution 78/241,',
	'',
	'Deeply concerned by the speed of change,',
	'',
	'1. Calls upon all States to:',
	'   1. negotiate a treaty;',
	'   2. regulate other systems by limiting:',
	'      1. the targets;',
	'      2. the duration;',
	'2. Decides to remain seized of the matter.'
].join('\n');

let editor: Editor | null = null;

function documentOf(markdown: string) {
	editor = createMarkdownEditor({
		element: document.body.appendChild(document.createElement('div')),
		markdown,
		id: 'editor',
		labelledBy: 'editor-label',
		placeholder: 'Write here…',
		onChange: vi.fn(),
		onFormattingChange: vi.fn(),
		onLinkShortcut: vi.fn()
	});

	return editor.state.doc;
}

afterEach(() => {
	editor?.destroy();
	editor = null;
	document.body.innerHTML = '';
});

/** The words in a range, to check a range by what it covers. */
function wordsAt(range: { from: number; to: number } | null) {
	return range === null ? null : editor?.state.doc.textBetween(range.from, range.to);
}

function clauseNamed(clauses: DocumentClause[], name: string) {
	const clause = clauses.find((candidate) => candidate.name === name);
	if (!clause) throw new Error(`No ${name}`);

	return clause;
}

describe('documentClauses', () => {
	it('names every clause as a chair would, in reading order', () => {
		const clauses = documentClauses(documentOf(RESOLUTION));

		expect(clauses.map((clause) => [clause.name, clause.level])).toEqual([
			['preambulatory clause 1', 0],
			['preambulatory clause 2', 0],
			['clause 1', 1],
			['clause 1(a)', 2],
			['clause 1(b)', 2],
			['clause 1(b)(i)', 3],
			['clause 1(b)(ii)', 3],
			['clause 2', 1]
		]);
		expect(wordsAt(clauseNamed(clauses, 'clause 1(b)(ii)').opening)).toBe('the duration;');
	});

	it('skips a clause with no words, as the clauses read from the Markdown do', () => {
		const clauses = documentClauses(documentOf('Recalling,\n\n1. Urges;\n2. \n3. Decides.'));

		expect(clauses.map((clause) => clause.name)).toEqual([
			'preambulatory clause 1',
			'clause 1',
			'clause 2'
		]);
		expect(wordsAt(clauseNamed(clauses, 'clause 2').opening)).toBe('Decides.');
	});

	it('counts a paragraph after the list as one more clause', () => {
		const clauses = documentClauses(documentOf('1. Urges;\n\nDecides.'));

		expect(clauses.map((clause) => clause.name)).toEqual(['clause 1', 'clause 2']);
	});
});

describe('documentPartAt', () => {
	it('is the operative part from the first numbered list on', () => {
		const resolution = documentOf(RESOLUTION);
		const clauses = documentClauses(resolution);

		expect(documentPartAt(resolution, clauses[1].opening.from)).toBe('preamble');
		expect(documentPartAt(resolution, clauses[2].opening.from)).toBe('operative');
		expect(documentPartAt(documentOf('No list at all.'), 3)).toBe('preamble');
	});
});

describe('openingPhraseRange', () => {
	it('finds the phrase a clause starts with, in either part', () => {
		const clauses = documentClauses(documentOf(RESOLUTION));

		expect(wordsAt(openingPhraseRange(editor!.state.doc, clauses[1]))).toBe('Deeply concerned');
		expect(wordsAt(openingPhraseRange(editor!.state.doc, clauses[2]))).toBe('Calls upon');
	});

	it('finds none in a sub-clause, or where the clause starts with no listed phrase', () => {
		const resolution = documentOf('Our bloc thinks,\n\n1. Calls upon:\n   1. negotiate;');
		const clauses = documentClauses(resolution);

		expect(openingPhraseRange(resolution, clauses[0])).toBeNull();
		expect(openingPhraseRange(resolution, clauses[2])).toBeNull();
	});
});

describe('lastWordRange', () => {
	it('covers the last word and the marks after it', () => {
		const clauses = documentClauses(documentOf(RESOLUTION));

		expect(wordsAt(lastWordRange(editor!.state.doc, clauses[0]))).toBe('78/241,');
		expect(wordsAt(lastWordRange(editor!.state.doc, clauses.at(-1)!))).toBe('matter.');
	});
});
