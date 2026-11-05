// @vitest-environment jsdom
// The editor draws into a page, so this file runs in jsdom's pretend browser
// rather than in plain Node like most tests beside it.

import { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	PAPER_SCHEMA,
	breakMarker,
	deleted,
	inserted,
	paper,
	paragraph,
	shown,
	suggestion
} from '../../tests/paper-suggestion-fixtures';
import { createMarkdownEditor, markdownDocumentExtensions } from './markdown-editor';
import {
	openPaperDocument,
	paperDocumentMarkdown,
	paperDocumentSuggestionCount,
	seedPaperDocument,
	writeMarkdownIntoPaperDocument
} from './paper-document';
import { DELETION_LOOK, INSERTION_LOOK } from './paper-suggestion-marks';
import { countSuggestions, readSuggestions } from './paper-suggestions';
import {
	decideAllSuggestions,
	decideOneSuggestion,
	deletionRange,
	isSuggesting,
	paperSuggesting,
	setSuggesting,
	suggestTransaction,
	type SuggestionAuthor
} from './paper-suggesting';

// See `markdown-editor.test.ts`: jsdom lays nothing out, and ProseMirror asks.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const NOW = '2026-10-09T10:00:00.000Z';
const BEN = suggestion('b1', 'ben');
const CARA = suggestion('c1', 'cara');

/** Somebody suggesting, whose suggestions are numbered "ana-1", "ana-2" and on. */
function author(userId: string): SuggestionAuthor {
	let count = 0;

	return { userId, newId: () => `${userId}-${(count += 1)}`, now: () => NOW };
}

let editor: Editor | null = null;
const openAwareness: Awareness[] = [];

/** An editor holding `content`, with Ana at it in "Editing". */
function startEditor(content: ProseMirrorNode): Editor {
	editor = new Editor({
		element: document.body.appendChild(document.createElement('div')),
		extensions: [
			...markdownDocumentExtensions(true),
			paperSuggesting.configure({ author: author('ana') })
		],
		content: content.toJSON()
	});

	return editor;
}

/** An editor holding `content`, with Ana at it in "Suggesting". */
function startSuggesting(content: ProseMirrorNode): Editor {
	const started = startEditor(content);
	setSuggesting(started, true);

	return started;
}

/** Where `words` start in the paper. */
function positionOf(paperDocument: ProseMirrorNode, words: string): number {
	let found = -1;
	paperDocument.descendants((node, position) => {
		const index = node.text?.indexOf(words) ?? -1;
		if (found === -1 && index !== -1) found = position + index;
	});

	if (found === -1) throw new Error(`"${words}" is not in the paper`);
	return found;
}

function putCursor(editor: Editor, position: number) {
	editor.commands.setTextSelection(position);
}

function selectWords(editor: Editor, words: string) {
	const from = positionOf(editor.state.doc, words);
	editor.commands.setTextSelection({ from, to: from + words.length });
}

/** Types `text` a letter at a time, the way a browser hands typing to ProseMirror. */
function typeText(editor: Editor, text: string) {
	const { view } = editor;

	for (const letter of text) {
		const { from, to } = view.state.selection;
		const typeAsUsual = () => view.state.tr.insertText(letter, from, to);
		const isTaken = view.someProp('handleTextInput', (handle) =>
			handle(view, from, to, letter, typeAsUsual)
		);
		if (!isTaken) view.dispatch(typeAsUsual());
	}
}

/** Presses `key`, named as `KeyboardEvent` names it, the way a browser hands it to ProseMirror. */
function press(editor: Editor, key: string, modifiers: KeyboardEventInit = {}) {
	const { view } = editor;
	const event = new KeyboardEvent('keydown', { key, ...modifiers });
	view.someProp('handleKeyDown', (handle) => handle(view, event));
}

/**
 * Pastes `html` the way a browser does. jsdom has no `ClipboardEvent`, so a
 * plain event carries the clipboard, as in `markdown-editor.test.ts`.
 */
function pasteHtml(editor: Editor, html: string) {
	const event = new Event('paste') as ClipboardEvent;
	const clipboardData = { getData: (type: string) => (type === 'text/html' ? html : '') };
	Object.defineProperty(event, 'clipboardData', { value: clipboardData });

	editor.view.pasteHTML(html, event);
}

/** A state holding `content` with the cursor at `position`, for the functions that take one. */
function stateWithCursor(content: ProseMirrorNode, position: number): EditorState {
	return EditorState.create({ doc: content, selection: TextSelection.create(content, position) });
}

afterEach(() => {
	editor?.destroy();
	editor = null;
	for (const awareness of openAwareness.splice(0)) awareness.destroy();
	document.body.innerHTML = '';
});

describe('isSuggesting and setSuggesting', () => {
	it('start in "Editing" and switch to "Suggesting" and back', () => {
		const editor = startEditor(paper(paragraph('The plan')));

		expect(isSuggesting(editor.state)).toBe(false);
		setSuggesting(editor, true);
		expect(isSuggesting(editor.state)).toBe(true);
		setSuggesting(editor, false);
		expect(isSuggesting(editor.state)).toBe(false);
	});

	it('leave typing as it is in "Editing"', () => {
		const editor = startEditor(paper(paragraph('The plan')));
		putCursor(editor, positionOf(editor.state.doc, 'plan'));

		typeText(editor, 'new ');

		expect(shown(editor.state.doc)).toBe('The new plan');
	});
});

describe('suggestTransaction', () => {
	const PLAN = paper(paragraph('The plan'));

	it('writes added words as an insertion by the author', () => {
		const state = EditorState.create({ doc: PLAN });

		const suggested = suggestTransaction(state, state.tr.insertText('new ', 5), author('ana'));

		expect(shown(suggested!.doc)).toBe('The {+new +}plan');
		expect(readSuggestions(suggested!.doc)).toEqual([
			{
				id: 'ana-1',
				userId: 'ana',
				at: NOW,
				from: 5,
				to: 9,
				summary: { verb: 'add', inserted: 'new' }
			}
		]);
	});

	it('keeps deleted words in place, struck through', () => {
		const state = EditorState.create({ doc: PLAN });

		const suggested = suggestTransaction(state, state.tr.delete(1, 5), author('ana'));

		expect(shown(suggested!.doc)).toBe('{-The -}plan');
	});

	it('joins a change to the author’s own suggestion beside it', () => {
		const state = EditorState.create({
			doc: paper(paragraph('The ', inserted('ne', suggestion('a1', 'ana')), ' plan'))
		});

		const suggested = suggestTransaction(state, state.tr.insertText('w', 7), author('ana'));

		expect(shown(suggested!.doc)).toBe('The {+new+} plan');
		expect(readSuggestions(suggested!.doc).map(({ id }) => id)).toEqual(['a1']);
	});

	it('refuses to turn a paragraph into a heading, which a suggestion cannot hold', () => {
		const state = EditorState.create({ doc: PLAN });
		const heading = state.tr.setBlockType(1, 1, PAPER_SCHEMA.nodes.heading, { level: 2 });

		expect(suggestTransaction(state, heading, author('ana'))).toBeNull();
	});

	it('writes bold as the plain words out and the bold ones in, paragraph by paragraph', () => {
		const state = EditorState.create({ doc: paper(paragraph('One two'), paragraph('Three four')) });
		const bold = state.tr.addMark(1, 20, PAPER_SCHEMA.marks.bold.create());

		const suggested = suggestTransaction(state, bold, author('ana'));

		expect(shown(suggested!.doc)).toBe(
			'{-One two-}{+**One two**+} | {-Three four-}{+**Three four**+}'
		);
		expect(countSuggestions(suggested!.doc)).toBe(1);
		// The bold words stay selected, so another button can follow.
		expect([suggested!.selection.from, suggested!.selection.to]).toEqual([8, 37]);
	});

	it('refuses to format words another author suggested', () => {
		const state = EditorState.create({
			doc: paper(paragraph('Fund ', inserted('the', BEN), ' plan'))
		});
		const bold = state.tr.addMark(1, 14, PAPER_SCHEMA.marks.bold.create());

		expect(suggestTransaction(state, bold, author('ana'))).toBeNull();
	});
});

describe('typing while suggesting', () => {
	it('makes a word typed letter by letter one suggestion', () => {
		const editor = startSuggesting(paper(paragraph('The plan')));
		putCursor(editor, positionOf(editor.state.doc, 'plan'));

		typeText(editor, 'new ');

		expect(shown(editor.state.doc)).toBe('The {+new +}plan');
		expect(countSuggestions(editor.state.doc)).toBe(1);
	});

	it('makes typing over selected words one replacement', () => {
		const editor = startSuggesting(paper(paragraph('The old plan')));
		selectWords(editor, 'old');

		typeText(editor, 'new');

		expect(shown(editor.state.doc)).toBe('The {-old-}{+new+} plan');
		expect(readSuggestions(editor.state.doc).map(({ summary }) => summary)).toEqual([
			{ verb: 'replace', deleted: 'old', inserted: 'new' }
		]);
	});

	it('keeps Markdown’s typed shortcuts from turning the line into a heading', () => {
		const editor = startSuggesting(paper(paragraph('Plan')));
		putCursor(editor, 1);

		typeText(editor, '## ');

		expect(shown(editor.state.doc)).toBe('{+## +}Plan');
	});

	it('types after a suggested break’s marker, which stays first in its paragraph', () => {
		const editor = startSuggesting(
			paper(paragraph('One'), paragraph(breakMarker('inserted', BEN), 'Two'))
		);
		putCursor(editor, 6);

		typeText(editor, 'A');

		expect(shown(editor.state.doc)).toBe('One | {+¶+}{+A+}Two');
	});

	it('types after the marker in "Editing" too', () => {
		const editor = startEditor(
			paper(paragraph('One'), paragraph(breakMarker('inserted', BEN), 'Two'))
		);
		putCursor(editor, 6);

		typeText(editor, 'A');

		expect(shown(editor.state.doc)).toBe('One | {+¶+}ATwo');
	});
});

describe('deleting while suggesting', () => {
	it('strikes the letter before the cursor with Backspace, and steps back over it', () => {
		const editor = startSuggesting(paper(paragraph('The plan')));
		putCursor(editor, 9);

		press(editor, 'Backspace');
		expect(shown(editor.state.doc)).toBe('The pla{-n-}');
		expect(editor.state.selection.from).toBe(8);

		press(editor, 'Backspace');
		expect(shown(editor.state.doc)).toBe('The pl{-an-}');
		expect(countSuggestions(editor.state.doc)).toBe(1);
	});

	it('strikes the letter after the cursor with Delete, and steps over it', () => {
		const editor = startSuggesting(paper(paragraph('The plan')));
		putCursor(editor, 1);

		press(editor, 'Delete');
		press(editor, 'Delete');

		expect(shown(editor.state.doc)).toBe('{-Th-}e plan');
		expect(editor.state.selection.from).toBe(3);
	});

	it('strikes a word at a time with Alt+Backspace', () => {
		const editor = startSuggesting(paper(paragraph('Fund the plan')));
		putCursor(editor, 14);

		press(editor, 'Backspace', { altKey: true });
		expect(shown(editor.state.doc)).toBe('Fund the {-plan-}');

		press(editor, 'Backspace', { altKey: true });
		expect(shown(editor.state.doc)).toBe('Fund {-the plan-}');
	});

	it('takes the author’s own suggested words out for good', () => {
		const editor = startSuggesting(paper(paragraph('The plan')));
		putCursor(editor, 5);
		typeText(editor, 'new');

		press(editor, 'Backspace');
		press(editor, 'Backspace');
		press(editor, 'Backspace');

		expect(shown(editor.state.doc)).toBe('The plan');
		expect(countSuggestions(editor.state.doc)).toBe(0);
	});

	it('suggests joining a paragraph to the one before with Backspace at its start', () => {
		const editor = startSuggesting(paper(paragraph('One'), paragraph('Two')));
		putCursor(editor, 6);

		press(editor, 'Backspace');

		expect(shown(editor.state.doc)).toBe('One | {-¶-}Two');
		expect(readSuggestions(editor.state.doc)[0].summary).toEqual({ verb: 'join' });
		// The cursor goes where the paragraphs would meet.
		expect(editor.state.selection.from).toBe(4);
	});

	it('suggests joining the next paragraph on with Delete at the end of one', () => {
		const editor = startSuggesting(paper(paragraph('One'), paragraph('Two')));
		putCursor(editor, 4);

		press(editor, 'Delete');

		expect(shown(editor.state.doc)).toBe('One | {-¶-}Two');
	});

	it('strikes a selection across two paragraphs, the break between them too', () => {
		const editor = startSuggesting(paper(paragraph('One two'), paragraph('Three four')));
		editor.commands.setTextSelection({ from: 5, to: 15 });

		press(editor, 'Backspace');

		expect(shown(editor.state.doc)).toBe('One {-two-} | {-¶Three-} four');
		expect(readSuggestions(editor.state.doc).map(({ summary }) => summary)).toEqual([
			{ verb: 'delete', deleted: 'two Three' }
		]);
	});

	it('strikes the whole paper when everything is selected, leaving no empty paragraph', () => {
		const editor = startSuggesting(paper(paragraph('One'), paragraph('Two')));
		editor.commands.selectAll();

		press(editor, 'Backspace');

		expect(shown(editor.state.doc)).toBe('{-One-} | {-¶Two-}');
	});

	it('leaves code as it is, since code cannot be struck through', () => {
		const code = { type: 'text', text: 'npm', marks: [{ type: 'code' }] };
		const editor = startSuggesting(paper(paragraph('Run ', code, ' now')));
		selectWords(editor, 'npm');

		press(editor, 'Backspace');

		expect(editor.state.doc.textContent).toBe('Run npm now');
		expect(countSuggestions(editor.state.doc)).toBe(0);
	});
});

describe('deletionRange', () => {
	it('is the selection when there is one', () => {
		const state = EditorState.create({
			doc: paper(paragraph('The plan')),
			selection: TextSelection.create(paper(paragraph('The plan')), 1, 4)
		});

		expect(deletionRange(state, 'backward', false)).toEqual({ from: 1, to: 4 });
	});

	it('steps over words already struck through', () => {
		const state = stateWithCursor(paper(paragraph('Fund ', deleted('the', BEN), ' plan')), 9);

		// The space before "the", reaching over it: struck words are not struck twice.
		expect(deletionRange(state, 'backward', false)).toEqual({ from: 5, to: 9 });
	});

	it('takes a word and the spaces after it, by word', () => {
		const PLAN = paper(paragraph('Fund the plan'));

		expect(deletionRange(stateWithCursor(PLAN, 14), 'backward', true)).toEqual({
			from: 10,
			to: 14
		});
		expect(deletionRange(stateWithCursor(PLAN, 10), 'backward', true)).toEqual({ from: 6, to: 10 });
		expect(deletionRange(stateWithCursor(PLAN, 1), 'forward', true)).toEqual({ from: 1, to: 5 });
	});

	it('is nothing at the very start or end of the paper', () => {
		const PLAN = paper(paragraph('One'));

		expect(deletionRange(stateWithCursor(PLAN, 1), 'backward', false)).toBeNull();
		expect(deletionRange(stateWithCursor(PLAN, 4), 'forward', false)).toBeNull();
	});
});

describe('formatting while suggesting', () => {
	it('suggests the bold words in place of the plain ones, and keeps them selected', () => {
		const editor = startSuggesting(paper(paragraph('Fund the plan')));
		selectWords(editor, 'the');

		editor.commands.toggleBold();

		expect(shown(editor.state.doc)).toBe('Fund {-the-}{+**the**+} plan');
		expect(readSuggestions(editor.state.doc)[0].summary).toEqual({ verb: 'format', text: 'the' });
		expect([editor.state.selection.from, editor.state.selection.to]).toEqual([9, 12]);
	});

	it('leaves words another author suggested as they are', () => {
		const editor = startSuggesting(paper(paragraph('Fund ', inserted('the', BEN), ' plan')));
		editor.commands.selectAll();

		editor.commands.toggleBold();

		expect(shown(editor.state.doc)).toBe('Fund {+the+} plan');
	});
});

describe('pasting while suggesting', () => {
	it('pastes words as a suggestion, without the suggestions they were copied with', () => {
		const editor = startSuggesting(paper(paragraph('The plan')));
		putCursor(editor, 5);

		// Copied from another paper: Ben's suggested word, and a break marker after it.
		pasteHtml(
			editor,
			'<p>new <ins data-suggestion="b1" data-suggestion-by="ben">bold</ins>\u200B</p>'
		);

		expect(shown(editor.state.doc)).toBe('The {+new bold+}plan');
		expect(readSuggestions(editor.state.doc).map(({ userId }) => userId)).toEqual(['ana']);
	});
});

describe('Enter while suggesting', () => {
	it('suggests a new paragraph, shown by a ¶ at the end of the first', () => {
		const editor = startSuggesting(paper(paragraph('One two')));
		putCursor(editor, 5);

		press(editor, 'Enter');

		expect(shown(editor.state.doc)).toBe('One  | {+¶+}two');
		expect(readSuggestions(editor.state.doc)[0].summary).toEqual({ verb: 'split' });

		const sign = editor.view.dom.querySelector('span[aria-hidden="true"]');
		expect(sign?.textContent).toBe('¶');
		expect(sign?.className).toContain(INSERTION_LOOK);
	});

	it('draws a struck ¶ for a suggested join', () => {
		const editor = startSuggesting(paper(paragraph('One'), paragraph('Two')));
		putCursor(editor, 6);

		press(editor, 'Backspace');

		const sign = editor.view.dom.querySelector('span[aria-hidden="true"]');
		expect(sign?.className).toContain(DELETION_LOOK);
	});
});

describe('decideOneSuggestion', () => {
	const PAPER = paper(
		paragraph('The ', deleted('old', BEN), inserted('new', BEN), ' plan ', inserted('now', CARA))
	);

	it('accepts one suggestion, even in "Suggesting", as a decision and not one more suggestion', () => {
		const editor = startSuggesting(PAPER);

		decideOneSuggestion(editor, 'b1', 'accept');

		expect(shown(editor.state.doc)).toBe('The new plan {+now+}');
	});

	it('rejects one suggestion', () => {
		const editor = startSuggesting(PAPER);

		decideOneSuggestion(editor, 'c1', 'reject');

		expect(shown(editor.state.doc)).toBe('The {-old-}{+new+} plan ');
	});
});

describe('decideAllSuggestions', () => {
	const PAPER = paper(
		paragraph(
			'The ',
			deleted('old', BEN),
			inserted('new', BEN),
			' plan ',
			inserted('now', suggestion('a1', 'ana')),
			deleted(' then', CARA)
		)
	);

	it('accepts every suggestion but the author’s own', () => {
		const editor = startEditor(PAPER);

		decideAllSuggestions(editor, 'accept', 'ana');

		expect(shown(editor.state.doc)).toBe('The new plan {+now+}');
	});

	it('rejects every suggestion but the author’s own', () => {
		const editor = startEditor(PAPER);

		decideAllSuggestions(editor, 'reject', 'ana');

		expect(shown(editor.state.doc)).toBe('The old plan {+now+} then');
	});
});

describe('paperSuggesting in a paper written live', () => {
	/** A live editor on `markdown`, the way `PaperEditor` starts one, with Ana at it. */
	async function startLiveEditor(markdown: string) {
		const shared = openPaperDocument(seedPaperDocument(markdown));
		const awareness = new Awareness(shared);
		openAwareness.push(awareness);
		const onChange = vi.fn();

		editor = createMarkdownEditor({
			element: document.body.appendChild(document.createElement('div')),
			markdown: '',
			id: 'editor',
			labelledBy: 'editor-label',
			placeholder: 'Write here…',
			onChange,
			onFormattingChange: vi.fn(),
			onLinkShortcut: vi.fn(),
			live: {
				document: shared,
				awareness,
				writer: { id: 'ana', name: 'Ana Silva' },
				writers: [{ id: 'ana', name: 'Ana Silva' }]
			}
		});
		// The shared document is drawn into the editor just after it starts.
		await new Promise((resolve) => setTimeout(resolve, 0));

		return { editor, shared, onChange };
	}

	it('keeps suggestions in the shared document, and the agreed text as its Markdown', async () => {
		const { editor, shared, onChange } = await startLiveEditor('The plan');
		setSuggesting(editor, true);
		putCursor(editor, 5);

		typeText(editor, 'new ');

		expect(shown(editor.state.doc)).toBe('The {+new +}plan');
		expect(readSuggestions(editor.state.doc)[0].userId).toBe('ana');
		expect(paperDocumentSuggestionCount(shared)).toBe(1);
		expect(paperDocumentMarkdown(shared)).toBe('The plan');
		expect(onChange).toHaveBeenLastCalledWith('The plan');
	});

	it('shows another author’s typing as they made it, not as a suggestion', async () => {
		const { editor, shared } = await startLiveEditor('The plan');
		setSuggesting(editor, true);

		const theirs = openPaperDocument(Y.encodeStateAsUpdate(shared));
		writeMarkdownIntoPaperDocument(theirs, 'The plan, funded.');
		Y.applyUpdate(shared, Y.encodeStateAsUpdate(theirs, Y.encodeStateVector(shared)));

		expect(shown(editor.state.doc)).toBe('The plan, funded.');
	});
});
