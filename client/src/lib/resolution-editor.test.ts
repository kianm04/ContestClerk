// @vitest-environment jsdom
// The editor draws into a page, so this file runs in jsdom's pretend browser
// rather than in plain Node.

import type { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarkdownEditor, editorMarkdown } from './markdown-editor';
import {
	focusClause,
	indentClause,
	markOpeningPhrase,
	outdentClause,
	resolutionClauses,
	showFormatWarnings
} from './resolution-editor';

// See `markdown-editor.test.ts`: jsdom lays nothing out, and ProseMirror asks.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const RESOLUTION = 'Recalling its resolution 78/241,\n\n1. Calls upon all States;\n2. Decides';

let editor: Editor | null = null;

function startEditor(markdown: string): Editor {
	editor = createMarkdownEditor({
		element: document.body.appendChild(document.createElement('div')),
		markdown,
		id: 'editor',
		labelledBy: 'editor-label',
		placeholder: 'Write here…',
		onChange: vi.fn(),
		onFormattingChange: vi.fn(),
		onLinkShortcut: vi.fn(),
		extensions: [resolutionClauses]
	});

	return editor;
}

afterEach(() => {
	editor?.destroy();
	editor = null;
	document.body.innerHTML = '';
});

/** The words the editor draws with `classes`, as a reader sees them. */
function wordsDrawnWith(started: Editor, classes: string): string[] {
	return [...started.view.dom.querySelectorAll(`[class="${classes}"]`)].map(
		(element) => element.textContent ?? ''
	);
}

/** Selects the first place `words` are, as an author dragging over them would. */
function selectWords(started: Editor, words: string) {
	let from = -1;
	started.state.doc.descendants((node, position) => {
		const index = node.isText ? (node.text ?? '').indexOf(words) : -1;
		if (from === -1 && index !== -1) from = position + index;
	});
	started.commands.setTextSelection({ from, to: from + words.length });
}

describe('resolutionClauses', () => {
	it('styles the opening phrases as they are drawn, leaving the text as it was', () => {
		const started = startEditor(RESOLUTION);

		expect(wordsDrawnWith(started, 'italic')).toEqual(['Recalling']);
		expect(wordsDrawnWith(started, 'underline underline-offset-2')).toEqual([
			'Calls upon',
			'Decides'
		]);
		expect(editorMarkdown(started)).toBe(RESOLUTION);
	});
});

describe('showFormatWarnings', () => {
	it('underlines the last word of each clause a check is about, and no other', () => {
		const started = startEditor(RESOLUTION);
		const warning =
			'underline decoration-dotted decoration-warning decoration-2 underline-offset-4';

		showFormatWarnings(started, ['clause 1']);
		expect(wordsDrawnWith(started, warning)).toEqual(['States;']);

		showFormatWarnings(started, []);
		expect(wordsDrawnWith(started, warning)).toEqual([]);
		expect(started.can().undo()).toBe(false);
	});
});

describe('markOpeningPhrase', () => {
	it('makes the selected words italic in the preamble and underlined in the operative part', () => {
		const started = startEditor('Our bloc,\n\n1. Urges strongly all States.');

		selectWords(started, 'Our bloc');
		markOpeningPhrase(started);
		selectWords(started, 'Urges strongly');
		markOpeningPhrase(started);

		expect(editorMarkdown(started)).toBe('*Our bloc*,\n\n1. ++Urges strongly++ all States.');
	});
});

describe('indentClause and outdentClause', () => {
	it('moves a clause in to a sub-clause and back out', () => {
		const started = startEditor('1. Calls upon:\n2. negotiate;');

		selectWords(started, 'negotiate');
		indentClause(started);
		expect(editorMarkdown(started)).toBe('1. Calls upon:\n   1. negotiate;');

		outdentClause(started);
		expect(editorMarkdown(started)).toBe('1. Calls upon:\n2. negotiate;');
	});
});

describe('focusClause', () => {
	it('puts the cursor at the end of the clause named', () => {
		const started = startEditor(RESOLUTION);

		focusClause(started, 'clause 1');

		const cursor = started.state.selection.from;
		expect(started.state.doc.textBetween(cursor - 7, cursor)).toBe('States;');
	});

	it('leaves the cursor where it was for a clause that is not there', () => {
		const started = startEditor(RESOLUTION);
		const before = started.state.selection.from;

		focusClause(started, 'clause 9');

		expect(started.state.selection.from).toBe(before);
	});
});
