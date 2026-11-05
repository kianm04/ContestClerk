/*
	Comments on a paper's words, in the live editor (docs/committee-papers.md,
	sections 4 and 8): where each thread's words are now, the light blue drawn
	behind them, and the words a new comment is being written on.

	A thread on a passage stores its two ends as Yjs relative positions. Each
	names a character of the shared document rather than a number, so it stays
	beside its character however much anybody types before it. The editor
	writes some characters anew, though. Splitting a paragraph, joining two, or
	turning one into a heading or a list item replaces the text it moves with a
	copy, and a position on a replaced character stays where that character
	used to be: the passage would shrink to nothing.

	So the page that makes a change also moves the ends of the threads it
	follows. ProseMirror carries each passage through the change exactly (a
	transaction's `mapping`), and where that no longer matches what the
	thread's ends say, the page writes new ends into a map in the same shared
	document, `threadAnchors`, under the thread's id. Every other page receives
	them together with the change, and they are part of the same undo step, so
	undoing a split moves the passage back as well. A thread's ends are the
	map's when it has them, and the ones saved with the thread otherwise.
*/

import { Extension, type Editor } from '@tiptap/core';
import { isChangeOrigin } from '@tiptap/extension-collaboration';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
	absolutePositionToRelativePosition,
	relativePositionToAbsolutePosition,
	ySyncPluginKey,
	yUndoPluginKey,
	type ProsemirrorBinding
} from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { base64ToBytes, bytesToBase64 } from '$lib/paper-document';
import { BREAK_MARKER, type SuggestionMarkAttributes } from '$lib/paper-suggestion-marks';
import { isSuggestionMark } from '$lib/paper-suggestions';
import type { ClausePart } from '$lib/paper-clauses';
import { documentPartAt } from '$lib/resolution-document';

/** The map in the shared document that holds the ends a change moved, by thread id. */
export const MOVED_ANCHORS_FIELD = 'threadAnchors';

/** The origin of the Yjs changes that move ends, which the undo history takes in. */
const MOVING_ANCHORS = 'paper-thread-anchors';

/** The longest quote of a passage the database keeps, the same limit as its check. */
const QUOTED_TEXT_MAX_LENGTH = 10000;

/** How a thread's words look: light blue behind them, and a deeper blue for the chosen card's. */
const PASSAGE_LOOK = 'rounded-[2px] bg-accent text-inherit';
const CHOSEN_PASSAGE_LOOK = 'rounded-[2px] bg-selected text-inherit';

/** A passage's two ends, as the database stores them: encoded Yjs positions, in base64. */
export type PassageAnchors = { start: string; end: string };

/** A thread on a passage, as a page hands it to the editor. */
export type ThreadAnchor = PassageAnchors & {
	threadId: string;
	/**
	 * Whether its words are drawn, and choose its card when clicked: an open
	 * thread's are. A resolved thread's, and those of a thread on a suggestion,
	 * whose marks show its words already, are drawn only while its card is chosen.
	 */
	isDrawn: boolean;
};

/** Where a passage is in the editor's document: from before its first character to after its last. */
export type ThreadRange = { from: number; to: number };

/** A passage as a new thread is posted on it. */
/**
 * A passage as a "Comment" form posts it. `part` is the part of a draft
 * resolution its words start in, which the server keeps only for a paper
 * written in parts (`$lib/resolution-text.ts`).
 */
export type PostedPassage = {
	anchorStart: string;
	anchorEnd: string;
	quotedText: string;
	part: ClausePart;
};

/**
 * The card chosen in the margin, a thread's or a suggestion's (by the id its
 * marks carry), whose words are drawn a deeper blue.
 */
export type ChosenCard = { kind: 'thread' | 'suggestion'; id: string };

/** The words a new comment is being written on, before it is posted. */
type NewThreadPassage = PassageAnchors & { range: ThreadRange | null };

type ThreadsState = {
	anchors: ThreadAnchor[];
	/** Each thread's passage now, by its id: `null` once its words are gone. */
	ranges: Map<string, ThreadRange | null>;
	chosen: ChosenCard | null;
	newThread: NewThreadPassage | null;
};

/** What a page changes, sent as a transaction's meta. Every passage is then found again. */
type ThreadsChange = Partial<Pick<ThreadsState, 'anchors' | 'chosen' | 'newThread'>>;

/*
	A plugin keeps its own state beside the document, and `apply` below works
	out the next one from each transaction, the way the document itself changes.
*/
const THREADS = new PluginKey<ThreadsState>('paperThreads');

/** The part of the shared editor's own state this file reads. */
type SyncState = {
	/** What ties the editor's document to the shared one, node for node. */
	binding: ProsemirrorBinding;
	/** Whether the last change goes into the undo history. */
	addToHistory: boolean;
};

/** The shared editor's state, or `null` in an editor that is not live. */
function syncStateOf(state: EditorState): SyncState | null {
	const syncState: SyncState | undefined = ySyncPluginKey.getState(state);

	return syncState ?? null;
}

/** The map of moved ends in the shared document. */
function movedAnchorsOf(binding: ProsemirrorBinding): Y.Map<unknown> {
	return binding.doc.getMap(MOVED_ANCHORS_FIELD);
}

function isPassageAnchors(value: unknown): value is PassageAnchors {
	return (
		typeof value === 'object' &&
		value !== null &&
		'start' in value &&
		'end' in value &&
		typeof value.start === 'string' &&
		typeof value.end === 'string'
	);
}

/** A thread's ends now: the ones a change moved, or else the ones saved with it. */
function anchorsNow(moved: Y.Map<unknown>, thread: ThreadAnchor): PassageAnchors {
	const movedAnchors = moved.get(thread.threadId);

	return isPassageAnchors(movedAnchors) ? movedAnchors : thread;
}

/**
 * `position` as a Yjs position, encoded. Inside a paragraph it is tied to the
 * character before it, so words typed just there go after it: inside the
 * passage at its start, and outside it at its end.
 */
function encodeAnchor(binding: ProsemirrorBinding, position: number): string {
	const relative: Y.RelativePosition = absolutePositionToRelativePosition(
		position,
		binding.type,
		binding.mapping
	);

	return bytesToBase64(Y.encodeRelativePosition(relative));
}

/** Where an encoded end is in the editor's document now, or `null` when it is nowhere in it. */
function resolveAnchor(binding: ProsemirrorBinding, anchor: string): number | null {
	try {
		const relative = Y.decodeRelativePosition(base64ToBytes(anchor));

		return relativePositionToAbsolutePosition(binding.doc, binding.type, relative, binding.mapping);
	} catch {
		// Not an encoded position at all, which the database cannot check.
		return null;
	}
}

function hasWordsAfter(document: ProseMirrorNode, position: number): boolean {
	const resolved = document.resolve(position);

	return resolved.parent.isTextblock && resolved.parentOffset < resolved.parent.content.size;
}

function hasWordsBefore(document: ProseMirrorNode, position: number): boolean {
	const resolved = document.resolve(position);

	return resolved.parent.isTextblock && resolved.parentOffset > 0;
}

/**
 * The passage from `from` to `to` without the edges of paragraphs at either
 * end, which hold no words: a passage carried through a split before it starts
 * at the end of the paragraph before. `null` when no words are left in it.
 */
function trimmedRange(document: ProseMirrorNode, from: number, to: number): ThreadRange | null {
	if (from < 0 || to > document.content.size) return null;

	let start = from;
	let end = to;
	while (start < end && !hasWordsAfter(document, start)) start += 1;
	while (end > start && !hasWordsBefore(document, end)) end -= 1;

	return start < end ? { from: start, to: end } : null;
}

/** Where a passage is, found from its ends. */
function rangeFromAnchors(
	binding: ProsemirrorBinding,
	document: ProseMirrorNode,
	anchors: PassageAnchors
): ThreadRange | null {
	const from = resolveAnchor(binding, anchors.start);
	const to = resolveAnchor(binding, anchors.end);
	if (from === null || to === null) return null;

	return trimmedRange(document, from, to);
}

/** Where a passage is after a change made on this page, carried through it. */
function mappedRange(transaction: Transaction, range: ThreadRange | null): ThreadRange | null {
	if (range === null) return null;

	// -1 keeps each end beside the words before it, as its Yjs position does.
	const from = transaction.mapping.map(range.from, -1);
	const to = transaction.mapping.map(range.to, -1);

	return trimmedRange(transaction.doc, from, to);
}

function isSameRange(first: ThreadRange | null, second: ThreadRange | null): boolean {
	return first?.from === second?.from && first?.to === second?.to;
}

/** `threads` with every passage found again from its ends, in `state`'s document. */
function foundAgain(threads: ThreadsState, state: EditorState): ThreadsState {
	const syncState = syncStateOf(state);
	if (syncState === null) return { ...threads, ranges: new Map() };

	const { binding } = syncState;
	const moved = movedAnchorsOf(binding);
	const ranges = new Map(
		threads.anchors.map((thread) => {
			const range = rangeFromAnchors(binding, state.doc, anchorsNow(moved, thread));

			return [thread.threadId, range];
		})
	);
	const newThread = threads.newThread && {
		...threads.newThread,
		range: rangeFromAnchors(binding, state.doc, threads.newThread)
	};

	return { ...threads, ranges, newThread };
}

/** The next state of the threads after `transaction`. */
function applyTransaction(
	transaction: Transaction,
	threads: ThreadsState,
	state: EditorState
): ThreadsState {
	// A page's own changes never touch the text, so the binding is up to date for them.
	const change: ThreadsChange | undefined = transaction.getMeta(THREADS);
	if (change !== undefined) return foundAgain({ ...threads, ...change }, state);

	// A change from the shared document, the paper's first drawing among them.
	// ProseMirror's mapping says nothing useful about it, so the ends decide.
	if (isChangeOrigin(transaction)) return foundAgain(threads, state);

	if (!transaction.docChanged) return threads;

	const ranges = new Map(
		[...threads.ranges].map(([threadId, range]) => [threadId, mappedRange(transaction, range)])
	);
	const newThread = threads.newThread && {
		...threads.newThread,
		range: mappedRange(transaction, threads.newThread.range)
	};

	return { ...threads, ranges, newThread };
}

function highlight(range: ThreadRange, isChosen: boolean): Decoration {
	const look = isChosen ? CHOSEN_PASSAGE_LOOK : PASSAGE_LOOK;

	return Decoration.inline(range.from, range.to, { nodeName: 'mark', class: look });
}

/** The id of the suggestion whose mark `node` carries, or `null`. */
function suggestionIdOf(node: ProseMirrorNode | null | undefined): string | null {
	const mark = node?.marks.find(isSuggestionMark);

	return mark ? (mark.attrs as SuggestionMarkAttributes).id : null;
}

/** Every stretch of text that carries suggestion `id`'s marks. */
function suggestionPieces(document: ProseMirrorNode, id: string): ThreadRange[] {
	const pieces: ThreadRange[] = [];

	document.descendants((node, position) => {
		if (suggestionIdOf(node) === id) pieces.push({ from: position, to: position + node.nodeSize });
	});

	return pieces;
}

/** The light blue behind every open thread's words, and the deeper blue behind the chosen card's. */
function highlightsOf(document: ProseMirrorNode, threads: ThreadsState): DecorationSet {
	const highlights: Decoration[] = [];
	const { chosen } = threads;

	for (const thread of threads.anchors) {
		const range = threads.ranges.get(thread.threadId);
		const isChosen = chosen?.kind === 'thread' && chosen.id === thread.threadId;

		if (range && (thread.isDrawn || isChosen)) highlights.push(highlight(range, isChosen));
	}

	if (chosen?.kind === 'suggestion') {
		for (const piece of suggestionPieces(document, chosen.id))
			highlights.push(highlight(piece, true));
	}

	if (threads.newThread?.range) highlights.push(highlight(threads.newThread.range, true));

	return DecorationSet.create(document, highlights);
}

/** The drawn thread whose words are at `position`, the shortest passage when several are. */
function threadAt(threads: ThreadsState, position: number): ChosenCard | null {
	let found: { threadId: string; length: number } | null = null;

	for (const thread of threads.anchors) {
		const range = threads.ranges.get(thread.threadId);
		if (!range || !thread.isDrawn || position < range.from || position > range.to) continue;

		const length = range.to - range.from;
		if (found === null || length < found.length) found = { threadId: thread.threadId, length };
	}

	return found && { kind: 'thread', id: found.threadId };
}

/** The suggestion whose words are at `position`, the one after it first. */
function suggestionAt(document: ProseMirrorNode, position: number): ChosenCard | null {
	const resolved = document.resolve(position);
	const id = suggestionIdOf(resolved.nodeAfter) ?? suggestionIdOf(resolved.nodeBefore);

	return id === null ? null : { kind: 'suggestion', id };
}

/**
 * After a change made on this page, which Yjs has already been told of, write
 * new ends for every passage its stored ends no longer find where ProseMirror
 * carried it. The new comment's words get new ends too, kept on this page.
 */
function moveAnchors(editor: Editor): void {
	const syncState = syncStateOf(editor.state);
	const threads = THREADS.getState(editor.state);
	if (syncState === null || threads === undefined) return;

	const { binding } = syncState;
	const document = editor.state.doc;
	const moved = movedAnchorsOf(binding);
	const moves: [string, PassageAnchors][] = [];

	for (const thread of threads.anchors) {
		const range = threads.ranges.get(thread.threadId) ?? null;
		// A passage whose words are gone has nowhere to move to.
		if (range === null) continue;
		if (isSameRange(rangeFromAnchors(binding, document, anchorsNow(moved, thread)), range))
			continue;

		const anchors = {
			start: encodeAnchor(binding, range.from),
			end: encodeAnchor(binding, range.to)
		};
		moves.push([thread.threadId, anchors]);
	}

	if (moves.length > 0) {
		binding.doc.transact((yjsTransaction) => {
			// In the undo history exactly when the change itself is.
			yjsTransaction.meta.set('addToHistory', syncState.addToHistory);
			for (const [threadId, anchors] of moves) moved.set(threadId, anchors);
		}, MOVING_ANCHORS);
	}

	const newThread = threads.newThread;
	if (
		newThread?.range &&
		!isSameRange(rangeFromAnchors(binding, document, newThread), newThread.range)
	) {
		const { range } = newThread;
		const anchors = {
			start: encodeAnchor(binding, range.from),
			end: encodeAnchor(binding, range.to)
		};
		const change: ThreadsChange = { newThread: { ...anchors, range } };

		editor.view.dispatch(editor.state.tr.setMeta(THREADS, change));
	}
}

/** What `paperThreads` needs from its page. */
export type PaperThreadsOptions = {
	/**
	 * Called on every click in the text with the card whose words were
	 * clicked, a thread's before a suggestion's, or `null` for words with neither.
	 */
	onActivate: (chosen: ChosenCard | null) => void;
};

/**
 * Follows the threads on a live paper's words and draws them. A page hands it
 * its threads with `showThreads` and reads where they are with `threadRanges`.
 */
export const paperThreads = Extension.create<PaperThreadsOptions>({
	name: 'paperThreads',

	addOptions() {
		return { onActivate: () => {} };
	},

	addProseMirrorPlugins() {
		const onActivate = this.options.onActivate;
		let drawn: { threads: ThreadsState; highlights: DecorationSet } | null = null;

		const plugin = new Plugin<ThreadsState>({
			key: THREADS,
			state: {
				init: () => ({ anchors: [], ranges: new Map(), chosen: null, newThread: null }),
				apply: (transaction, threads, _before, after) =>
					applyTransaction(transaction, threads, after)
			},
			props: {
				decorations: (state) => {
					const threads = THREADS.getState(state);
					if (threads === undefined) return null;

					// The same state draws the same marks, so they are worked out once.
					if (drawn?.threads !== threads) {
						drawn = { threads, highlights: highlightsOf(state.doc, threads) };
					}

					return drawn.highlights;
				},
				handleClick: (view, position) => {
					const threads = THREADS.getState(view.state);
					const thread = threads ? threadAt(threads, position) : null;
					onActivate(thread ?? suggestionAt(view.state.doc, position));

					// The click still puts the cursor where it landed.
					return false;
				}
			},
			view: (view) => {
				const syncState = syncStateOf(view.state);
				if (syncState === null) return {};

				const moved = movedAnchorsOf(syncState.binding);
				const undoState: { undoManager: Y.UndoManager } | undefined = yUndoPluginKey.getState(
					view.state
				);
				// Moving the ends is part of the change that moved the words: one undo step.
				undoState?.undoManager.addToScope(moved);
				undoState?.undoManager.trackedOrigins.add(MOVING_ANCHORS);

				/*
					Ends another page moved, or an undo put back, arrive in the map. The
					passages are found again once Yjs has finished applying the change,
					so after the editor has redrawn the text the change brought with it.
				*/
				const findAgain = (event: Y.YMapEvent<unknown>) => {
					if (event.transaction.origin === MOVING_ANCHORS) return;

					queueMicrotask(() => {
						if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(THREADS, {}));
					});
				};
				moved.observe(findAgain);

				return { destroy: () => moved.unobserve(findAgain) };
			}
		});

		return [plugin];
	},

	// Tiptap calls this once the change is in the editor, and so in Yjs too.
	onTransaction({ editor, transaction, appendedTransactions }) {
		const transactions = [transaction, ...appendedTransactions];
		if (isChangeOrigin(transaction) || !transactions.some((each) => each.docChanged)) return;

		moveAnchors(editor);
	}
});

/** Each thread's passage now, by its id: `null` for a thread whose words are gone. */
export function threadRanges(state: EditorState): ReadonlyMap<string, ThreadRange | null> {
	return THREADS.getState(state)?.ranges ?? new Map();
}

/**
 * Where a thread's words were, once they are gone, so its card can stay
 * there. Yjs keeps a deleted character's place between the ones still around
 * it, or at the edge of a deleted paragraph. `null` for a thread the editor
 * does not follow, or whose start is nowhere in the paper.
 */
export function placeOfGoneWords(state: EditorState, threadId: string): number | null {
	const syncState = syncStateOf(state);
	const thread = THREADS.getState(state)?.anchors.find((each) => each.threadId === threadId);
	if (syncState === null || thread === undefined) return null;

	const { binding } = syncState;
	const place = resolveAnchor(binding, anchorsNow(movedAnchorsOf(binding), thread).start);

	return place !== null && place >= 0 && place <= state.doc.content.size ? place : null;
}

/** The words the new comment is being written on, `null` when there are none. */
export function newThreadRange(state: EditorState): ThreadRange | null {
	return THREADS.getState(state)?.newThread?.range ?? null;
}

/** Hand the editor the threads whose words it follows, and which card is chosen. */
export function showThreads(
	editor: Editor,
	anchors: ThreadAnchor[],
	chosen: ChosenCard | null
): void {
	const change: ThreadsChange = { anchors, chosen };

	editor.view.dispatch(editor.state.tr.setMeta(THREADS, change));
}

/** A stretch of the paper as a thread is posted on it: its ends, encoded, and its words. */
export function passageAt(state: EditorState, range: ThreadRange): PostedPassage | null {
	const syncState = syncStateOf(state);
	const trimmed = trimmedRange(state.doc, range.from, range.to);
	if (syncState === null || trimmed === null) return null;

	const words = state.doc.textBetween(trimmed.from, trimmed.to, '\n', ' ');

	return {
		anchorStart: encodeAnchor(syncState.binding, trimmed.from),
		anchorEnd: encodeAnchor(syncState.binding, trimmed.to),
		quotedText: words.replaceAll(BREAK_MARKER, '').slice(0, QUOTED_TEXT_MAX_LENGTH),
		part: documentPartAt(state.doc, trimmed.from)
	};
}

/**
 * Start a new comment on the selected words, which stay drawn while it is
 * written. `false` when no words are selected: the comment is on the whole paper.
 */
export function startNewThread(editor: Editor): boolean {
	const { state } = editor;
	const syncState = syncStateOf(state);
	const range = trimmedRange(state.doc, state.selection.from, state.selection.to);

	let newThread: NewThreadPassage | null = null;
	if (syncState !== null && range !== null) {
		const { binding } = syncState;
		newThread = {
			start: encodeAnchor(binding, range.from),
			end: encodeAnchor(binding, range.to),
			range
		};
	}

	const change: ThreadsChange = { newThread, chosen: null };
	editor.view.dispatch(state.tr.setMeta(THREADS, change));

	return newThread !== null;
}

/** What the new comment is on as it is posted: `null` for the whole paper, or once its words are gone. */
export function newThreadPassage(state: EditorState): PostedPassage | null {
	const range = newThreadRange(state);

	return range === null ? null : passageAt(state, range);
}

/** Stop drawing the words a new comment was being written on. */
export function endNewThread(editor: Editor): void {
	const change: ThreadsChange = { newThread: null };

	editor.view.dispatch(editor.state.tr.setMeta(THREADS, change));
}
