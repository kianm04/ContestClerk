// @vitest-environment jsdom
// The editor draws into a page, so this file runs in jsdom's pretend browser
// rather than in plain Node like most tests beside it.

import type { Editor } from '@tiptap/core';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarkdownEditor } from './markdown-editor';
import { openPaperDocument, seedPaperDocument } from './paper-document';
import { SUGGESTED_INSERTION } from './paper-suggestion-marks';
import {
	MOVED_ANCHORS_FIELD,
	endNewThread,
	newThreadPassage,
	newThreadRange,
	paperThreads,
	passageAt,
	placeOfGoneWords,
	showThreads,
	startNewThread,
	threadRanges,
	type ThreadAnchor
} from './paper-threads';

// See `markdown-editor.test.ts`: jsdom lays nothing out, and ProseMirror asks.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

/** The paper in most tests: two paragraphs, shown with a bar between them. */
const PAPER = 'The plan works well.\n\nIt is funded by all.';

const startedEditors: Editor[] = [];
const openAwareness: Awareness[] = [];

afterEach(() => {
	for (const editor of startedEditors.splice(0)) editor.destroy();
	for (const awareness of openAwareness.splice(0)) awareness.destroy();
	document.body.innerHTML = '';
});

/** The shared document is drawn into an editor just after it starts. */
function nextTick() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A live editor on `shared`, the way `PaperEditor` starts one, following its threads. */
function startLiveEditor(shared: Y.Doc, onActivate = vi.fn()): Editor {
	const awareness = new Awareness(shared);
	openAwareness.push(awareness);

	const editor = createMarkdownEditor({
		element: document.body.appendChild(document.createElement('div')),
		markdown: '',
		id: 'editor',
		labelledBy: 'editor-label',
		placeholder: 'Write here…',
		onChange: vi.fn(),
		onFormattingChange: vi.fn(),
		onLinkShortcut: vi.fn(),
		live: {
			document: shared,
			awareness,
			writer: { id: 'ana', name: 'Ana Silva' },
			writers: [{ id: 'ana', name: 'Ana Silva' }]
		},
		extensions: [paperThreads.configure({ onActivate })]
	});
	startedEditors.push(editor);

	return editor;
}

/** A live editor on a paper holding `markdown`, once it is drawn. */
async function startPaper(markdown = PAPER, onActivate = vi.fn()) {
	const shared = openPaperDocument(seedPaperDocument(markdown));
	const editor = startLiveEditor(shared, onActivate);
	await nextTick();

	return { editor, shared };
}

/** Where `words` start in the editor's document. */
function positionOf(editor: Editor, words: string): number {
	let found = -1;
	editor.state.doc.descendants((node, position) => {
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
	const from = positionOf(editor, words);
	editor.commands.setTextSelection({ from, to: from + words.length });
}

/** A thread on `words`, its ends encoded the way a page posts them. */
function threadOn(editor: Editor, threadId: string, words: string, isDrawn = true): ThreadAnchor {
	const from = positionOf(editor, words);
	const passage = passageAt(editor.state, { from, to: from + words.length });
	if (passage === null) throw new Error(`"${words}" makes no passage`);

	return { threadId, start: passage.anchorStart, end: passage.anchorEnd, isDrawn };
}

/** The paper's words, with a bar between paragraphs. */
function textOf(editor: Editor): string {
	const { doc } = editor.state;

	return doc.textBetween(0, doc.content.size, '|');
}

/** The words of a thread's passage now, `null` when they are gone. */
function wordsOf(editor: Editor, threadId: string): string | null {
	const range = threadRanges(editor.state).get(threadId);

	return range ? editor.state.doc.textBetween(range.from, range.to, '|') : null;
}

/** The words of `thread`'s passage on a page opened now on what `shared` holds. */
async function wordsOnAnotherPage(shared: Y.Doc, thread: ThreadAnchor): Promise<string | null> {
	const editor = startLiveEditor(openPaperDocument(Y.encodeStateAsUpdate(shared)));
	await nextTick();
	showThreads(editor, [thread], null);

	return wordsOf(editor, thread.threadId);
}

/** The passages drawn behind the words, and how. */
function highlightsOn(editor: Editor) {
	return [...editor.view.dom.querySelectorAll('mark')].map((mark) => ({
		words: mark.textContent,
		isChosen: mark.classList.contains('bg-selected')
	}));
}

/** Clicks `position`, the way ProseMirror hands a click to the plugins. */
function click(editor: Editor, position: number) {
	const { view } = editor;
	view.someProp('handleClick', (handle) => handle(view, position, new MouseEvent('click')));
}

describe('threadRanges', () => {
	it('finds each passage from its saved ends as soon as the threads are handed over', async () => {
		const { editor } = await startPaper();
		const thread = threadOn(editor, 'plan', 'plan works');

		showThreads(editor, [thread], null);

		expect(threadRanges(editor.state).get('plan')).toEqual({ from: 5, to: 15 });
		expect(threadRanges(editor.state).has('other')).toBe(false);
	});
});

describe('paperThreads, keeping each passage on its words', () => {
	it('keeps a passage beside its words as somebody types before it', async () => {
		const { editor, shared } = await startPaper();
		const thread = threadOn(editor, 'plan', 'plan works');
		showThreads(editor, [thread], null);

		putCursor(editor, 1);
		editor.commands.insertContent('So ');

		expect(wordsOf(editor, 'plan')).toBe('plan works');
		expect(await wordsOnAnotherPage(shared, thread)).toBe('plan works');
	});

	it('keeps a passage whole when its paragraph is split before it', async () => {
		const { editor, shared } = await startPaper();
		const thread = threadOn(editor, 'plan', 'plan works');
		showThreads(editor, [thread], null);

		putCursor(editor, positionOf(editor, 'plan'));
		editor.commands.splitBlock();

		expect(textOf(editor)).toBe('The |plan works well.|It is funded by all.');
		expect(wordsOf(editor, 'plan')).toBe('plan works');
		expect(await wordsOnAnotherPage(shared, thread)).toBe('plan works');
	});

	it('keeps a passage over both halves when its paragraph is split inside it', async () => {
		const { editor, shared } = await startPaper();
		const thread = threadOn(editor, 'plan', 'plan works');
		showThreads(editor, [thread], null);

		putCursor(editor, positionOf(editor, ' works'));
		editor.commands.splitBlock();

		expect(wordsOf(editor, 'plan')).toBe('plan| works');
		expect(await wordsOnAnotherPage(shared, thread)).toBe('plan| works');
	});

	it('keeps a passage when its paragraph is joined to the one before', async () => {
		const { editor, shared } = await startPaper();
		const thread = threadOn(editor, 'funded', 'is funded');
		showThreads(editor, [thread], null);

		putCursor(editor, positionOf(editor, 'It is'));
		editor.commands.joinBackward();

		expect(textOf(editor)).toBe('The plan works well.It is funded by all.');
		expect(wordsOf(editor, 'funded')).toBe('is funded');
		expect(await wordsOnAnotherPage(shared, thread)).toBe('is funded');
	});

	it('keeps a passage when its paragraph becomes a heading', async () => {
		const { editor, shared } = await startPaper();
		const thread = threadOn(editor, 'plan', 'plan works');
		showThreads(editor, [thread], null);

		putCursor(editor, positionOf(editor, 'works'));
		editor.commands.setHeading({ level: 2 });

		expect(editor.state.doc.firstChild?.type.name).toBe('heading');
		expect(wordsOf(editor, 'plan')).toBe('plan works');
		expect(await wordsOnAnotherPage(shared, thread)).toBe('plan works');
	});

	it('keeps a passage when its paragraph becomes a list item', async () => {
		const { editor, shared } = await startPaper();
		const thread = threadOn(editor, 'funded', 'is funded');
		showThreads(editor, [thread], null);

		putCursor(editor, positionOf(editor, 'funded'));
		editor.commands.toggleBulletList();

		// The editor keeps an empty paragraph after a list, to type below it.
		expect(editor.state.doc.child(1).type.name).toBe('bulletList');
		expect(wordsOf(editor, 'funded')).toBe('is funded');
		expect(await wordsOnAnotherPage(shared, thread)).toBe('is funded');
	});

	it('finds no passage once all its words are deleted, on any page', async () => {
		const { editor, shared } = await startPaper();
		const thread = threadOn(editor, 'plan', 'plan works');
		showThreads(editor, [thread], null);

		selectWords(editor, 'plan works');
		editor.commands.deleteSelection();

		expect(wordsOf(editor, 'plan')).toBeNull();
		expect(await wordsOnAnotherPage(shared, thread)).toBeNull();
	});

	it('sends the moved ends with the change, so a page already open keeps the passage too', async () => {
		const { editor, shared } = await startPaper();
		const theirs = openPaperDocument(Y.encodeStateAsUpdate(shared));
		const theirEditor = startLiveEditor(theirs);
		await nextTick();
		const thread = threadOn(editor, 'plan', 'plan works');
		showThreads(editor, [thread], null);
		showThreads(theirEditor, [thread], null);

		// The paper's channel sends what changed together, as `paper-live-channel.ts` does.
		const sent: Uint8Array[] = [];
		shared.on('update', (update: Uint8Array) => sent.push(update));
		putCursor(editor, positionOf(editor, 'plan'));
		editor.commands.splitBlock();
		Y.applyUpdate(theirs, Y.mergeUpdates(sent));

		expect(textOf(theirEditor)).toBe('The |plan works well.|It is funded by all.');
		expect(wordsOf(theirEditor, 'plan')).toBe('plan works');
	});

	it('puts the passage back when the split is undone, and moves it again when it is redone', async () => {
		const { editor, shared } = await startPaper();
		const thread = threadOn(editor, 'plan', 'plan works');
		showThreads(editor, [thread], null);
		const moved = shared.getMap(MOVED_ANCHORS_FIELD);

		putCursor(editor, positionOf(editor, 'plan'));
		editor.commands.splitBlock();
		expect(moved.has('plan')).toBe(true);

		// Moving the ends is part of the same step as the split, so one undo takes back both.
		editor.commands.undo();
		expect(textOf(editor)).toBe('The plan works well.|It is funded by all.');
		expect(moved.has('plan')).toBe(false);
		expect(wordsOf(editor, 'plan')).toBe('plan works');

		editor.commands.redo();
		expect(textOf(editor)).toBe('The |plan works well.|It is funded by all.');
		expect(moved.has('plan')).toBe(true);
		expect(wordsOf(editor, 'plan')).toBe('plan works');
	});

	it('keeps the moved ends out of the undo history when the change is kept out of it', async () => {
		const { editor } = await startPaper();
		const thread = threadOn(editor, 'plan', 'plan works');
		showThreads(editor, [thread], null);

		putCursor(editor, positionOf(editor, 'plan'));
		editor.chain().setMeta('addToHistory', false).splitBlock().run();

		expect(wordsOf(editor, 'plan')).toBe('plan works');
		expect(editor.can().undo()).toBe(false);
	});
});

describe('placeOfGoneWords', () => {
	it('finds where deleted words were, between the words left around them', async () => {
		const { editor } = await startPaper();
		const thread = threadOn(editor, 'plan', 'plan works');
		showThreads(editor, [thread], null);
		const wasAt = positionOf(editor, 'plan works');

		selectWords(editor, 'plan works');
		editor.commands.deleteSelection();

		expect(placeOfGoneWords(editor.state, 'plan')).toBe(wasAt);
	});

	it('finds the edge of a deleted paragraph, and nothing for a thread it does not follow', async () => {
		const { editor } = await startPaper();
		const thread = threadOn(editor, 'funded', 'is funded');
		showThreads(editor, [thread], null);
		const endOfFirst = positionOf(editor, 'well.') + 'well.'.length;

		editor.commands.deleteRange({ from: endOfFirst, to: editor.state.doc.content.size - 1 });

		expect(textOf(editor)).toBe('The plan works well.');
		// Just after the first paragraph closes, where the second one stood.
		expect(placeOfGoneWords(editor.state, 'funded')).toBe(endOfFirst + 1);
		expect(placeOfGoneWords(editor.state, 'other')).toBeNull();
	});
});

describe('passageAt', () => {
	it('quotes the words of a passage, a line for each paragraph it runs over', async () => {
		const { editor } = await startPaper();
		const from = positionOf(editor, 'well.');
		const to = positionOf(editor, 'It') + 'It'.length;

		expect(passageAt(editor.state, { from, to })?.quotedText).toBe('well.\nIt');
	});

	it('makes no passage of a stretch without words', async () => {
		const { editor } = await startPaper();
		const end = positionOf(editor, 'well.') + 'well.'.length;

		expect(passageAt(editor.state, { from: end, to: end + 2 })).toBeNull();
	});
});

describe('startNewThread, newThreadPassage and endNewThread', () => {
	it('draw the selected words while the comment is written, and post them with their ends', async () => {
		const { editor, shared } = await startPaper();
		selectWords(editor, 'plan works');

		expect(startNewThread(editor)).toBe(true);
		expect(highlightsOn(editor)).toEqual([{ words: 'plan works', isChosen: true }]);

		const passage = newThreadPassage(editor.state);
		expect(passage?.quotedText).toBe('plan works');

		const posted = { threadId: 'new', start: passage!.anchorStart, end: passage!.anchorEnd };
		expect(await wordsOnAnotherPage(shared, { ...posted, isDrawn: true })).toBe('plan works');

		endNewThread(editor);
		expect(newThreadRange(editor.state)).toBeNull();
		expect(highlightsOn(editor)).toEqual([]);
	});

	it('leave out the edges of paragraphs the selection takes in', async () => {
		const { editor } = await startPaper();
		const endOfFirst = positionOf(editor, 'well.') + 'well.'.length;
		editor.commands.setTextSelection({ from: endOfFirst, to: positionOf(editor, ' is') });

		startNewThread(editor);

		expect(newThreadPassage(editor.state)?.quotedText).toBe('It');
	});

	it('start a comment on the whole paper when no words are selected', async () => {
		const { editor } = await startPaper();
		putCursor(editor, positionOf(editor, 'plan'));

		expect(startNewThread(editor)).toBe(false);
		expect(newThreadPassage(editor.state)).toBeNull();
	});

	it('keep the words through a split on this page, however the passages are found again', async () => {
		const { editor } = await startPaper();
		selectWords(editor, 'plan works');
		startNewThread(editor);

		putCursor(editor, positionOf(editor, 'plan'));
		editor.commands.splitBlock();
		// Handing over the threads finds every passage again from its ends.
		showThreads(editor, [], null);

		expect(newThreadPassage(editor.state)?.quotedText).toBe('plan works');
	});

	it('post on the whole paper once the words are deleted', async () => {
		const { editor } = await startPaper();
		selectWords(editor, 'plan works');
		startNewThread(editor);

		editor.commands.deleteSelection();

		expect(newThreadPassage(editor.state)).toBeNull();
	});
});

describe('the passages drawn behind the words', () => {
	it('are light blue for an open thread, and deeper blue for the chosen card’s', async () => {
		const { editor } = await startPaper();
		const plan = threadOn(editor, 'plan', 'plan works');
		const funded = threadOn(editor, 'funded', 'is funded');

		showThreads(editor, [plan, funded], { kind: 'thread', id: 'funded' });

		expect(highlightsOn(editor)).toEqual([
			{ words: 'plan works', isChosen: false },
			{ words: 'is funded', isChosen: true }
		]);
	});

	it('show a resolved thread’s words only while its card is chosen', async () => {
		const { editor } = await startPaper();
		const resolved = threadOn(editor, 'plan', 'plan works', false);

		showThreads(editor, [resolved], null);
		expect(highlightsOn(editor)).toEqual([]);

		showThreads(editor, [resolved], { kind: 'thread', id: 'plan' });
		expect(highlightsOn(editor)).toEqual([{ words: 'plan works', isChosen: true }]);
	});

	it('choose the card of the thread whose words are clicked, the shortest passage first', async () => {
		const onActivate = vi.fn();
		const { editor } = await startPaper(PAPER, onActivate);
		const whole = threadOn(editor, 'whole', 'plan works well');
		const works = threadOn(editor, 'works', 'works');
		showThreads(editor, [whole, works], null);

		click(editor, positionOf(editor, 'orks'));
		click(editor, positionOf(editor, 'lan'));
		click(editor, positionOf(editor, 'funded'));

		expect(onActivate.mock.calls).toEqual([
			[{ kind: 'thread', id: 'works' }],
			[{ kind: 'thread', id: 'whole' }],
			// Words with no comment and no suggestion choose no card.
			[null]
		]);
	});

	it('draw the chosen suggestion’s words deeper blue, and choose it when they are clicked', async () => {
		const onActivate = vi.fn();
		const { editor } = await startPaper(PAPER, onActivate);
		const from = positionOf(editor, 'funded');
		const insertion = editor.schema.marks[SUGGESTED_INSERTION].create({
			id: 'ben-1',
			userId: 'ben',
			at: '2026-10-09T09:00:00.000Z'
		});
		editor.view.dispatch(editor.state.tr.addMark(from, from + 'funded'.length, insertion));

		showThreads(editor, [], { kind: 'suggestion', id: 'ben-1' });
		click(editor, from + 2);

		expect(highlightsOn(editor)).toEqual([{ words: 'funded', isChosen: true }]);
		expect(onActivate.mock.calls).toEqual([[{ kind: 'suggestion', id: 'ben-1' }]]);
	});
});
