/**
 * What a paper page's margin knows while its editor runs
 * (`docs/committee-papers.md`, section 4): the editor, the card chosen, the
 * new comment being written, and the cards made from the threads `load` read
 * and the suggestions in the text.
 *
 * A `.svelte.ts` file may use runes. `createPaperMargin` is called once, from
 * a component's script, so its `$effect` lives as long as that component.
 */

import type { Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import type { PaperThread } from './paper-comments';
import {
	NEW_THREAD_KEY,
	marginCards,
	suggestionKey,
	suggestionSummarySentence,
	threadKey,
	type MarginCard,
	type ThreadPlace
} from './paper-margin';
import { decideAllSuggestions, decideOneSuggestion, isSuggesting } from './paper-suggesting';
import { readSuggestions, type Suggestion, type SuggestionDecision } from './paper-suggestions';
import {
	endNewThread,
	newThreadRange,
	paperThreads,
	passageAt,
	placeOfGoneWords,
	showThreads,
	startNewThread,
	threadRanges,
	type ChosenCard,
	type ThreadAnchor
} from './paper-threads';

/**
 * The threads on passages, as the editor follows them. An open thread's
 * words are drawn; a resolved one's, and a suggestion's, only while chosen.
 */
export function threadAnchors(threads: PaperThread[]): ThreadAnchor[] {
	const anchors: ThreadAnchor[] = [];

	for (const thread of threads) {
		if (thread.anchorStart === null || thread.anchorEnd === null) continue;

		anchors.push({
			threadId: thread.id,
			start: thread.anchorStart,
			end: thread.anchorEnd,
			isDrawn: !thread.isResolved && thread.suggestionId === null
		});
	}

	return anchors;
}

/** Where a thread's card goes: beside its words, where they were, or nowhere known. */
export function threadPlace(state: EditorState | null, thread: PaperThread): ThreadPlace {
	if (state === null || thread.anchorStart === null) return { place: null, isGone: false };

	const range = threadRanges(state).get(thread.id);

	// Not found yet: the editor is handed the threads a moment after they load.
	if (range === undefined) return { place: null, isGone: false };
	if (range === null) return { place: placeOfGoneWords(state, thread.id), isGone: true };

	return { place: range.from, isGone: false };
}

/** The key of the card the margin shows as chosen, which is also its element's id. */
export function chosenCardKey(chosen: ChosenCard | null, isWritingNew: boolean): string | null {
	if (chosen !== null) {
		return chosen.kind === 'thread' ? threadKey(chosen.id) : suggestionKey(chosen.id);
	}

	return isWritingNew ? NEW_THREAD_KEY : null;
}

/** What choosing a card tells the editor to draw. A new comment's words are drawn anyway. */
export function cardChoice(card: MarginCard): ChosenCard | null {
	if (card.kind === 'thread') return { kind: 'thread', id: card.thread.id };
	if (card.kind === 'suggestion') return { kind: 'suggestion', id: card.suggestion.id };

	return null;
}

/**
 * The threads of the suggestions "Accept all" or "Reject all" decides: the
 * other authors', since one's own are withdrawn one at a time.
 */
export function threadsOfOthersSuggestions(cards: MarginCard[], userId: string): string[] {
	return cards.flatMap((card) =>
		card.kind === 'suggestion' && card.suggestion.userId !== userId && card.thread !== null
			? [card.thread.id]
			: []
	);
}

/**
 * Resolve the threads of suggestions just decided, while the writer carries
 * on. Nothing waits for the answer: the threads channel reads them again.
 */
export function postResolvedThreads(threadIds: string[]): void {
	if (threadIds.length === 0) return;

	const body = new FormData();
	for (const threadId of threadIds) body.append('threadId', threadId);
	body.set('background', '1');

	// A failure leaves the thread open, under "The suggestion this was about was decided".
	void fetch('?/resolveThreads', {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true' }
	}).catch(() => {});
}

/**
 * What the first reply on a suggestion starts its thread with: the words it
 * is on, so the thread follows them, and what it does, said as the card says
 * it, so a notification can quote it. Without the editor's state only the
 * sentence and the suggestion are known.
 */
export function suggestionThreadFields(
	state: EditorState | null,
	suggestion: Suggestion
): Record<string, string> {
	const passage =
		state === null ? null : passageAt(state, { from: suggestion.from, to: suggestion.to });
	const fields: Record<string, string> = {
		suggestionId: suggestion.id,
		quotedText: suggestionSummarySentence(suggestion.summary)
	};

	if (passage !== null) {
		fields.anchorStart = passage.anchorStart;
		fields.anchorEnd = passage.anchorEnd;
		fields.part = passage.part;
	}

	return fields;
}

export type PaperMarginSetup = {
	/** The threads from `load`, read again whenever the page's data changes. */
	threads: () => PaperThread[];
	/** The reader, whose own suggestions are withdrawn rather than decided. */
	userId: string;
};

export type PaperMargin = ReturnType<typeof createPaperMargin>;

export function createPaperMargin(setup: PaperMarginSetup) {
	// `$state.raw` keeps Svelte from looking inside the editor's own objects.
	// The type goes in `<…>`: written on the variable, TypeScript would take
	// the starting `null` as the only value it can ever have.
	let editor = $state.raw<Editor | null>(null);
	let editorState = $state.raw<EditorState | null>(null);
	let chosen = $state.raw<ChosenCard | null>(null);
	let isWritingNew = $state(false);

	const suggestions = $derived(editorState === null ? [] : readSuggestions(editorState.doc));
	const newThreadPlace = $derived(
		editorState === null ? null : (newThreadRange(editorState)?.from ?? null)
	);
	const cards = $derived(
		marginCards({
			threads: setup.threads(),
			suggestions,
			placeOf: (thread) => threadPlace(editorState, thread),
			newThread: isWritingNew ? { place: newThreadPlace } : null
		})
	);
	const anchors = $derived(threadAnchors(setup.threads()));

	// Hands the editor the threads and the chosen card whenever either changes.
	$effect(() => {
		if (editor !== null) showThreads(editor, anchors, chosen);
	});

	function handleTransaction() {
		if (editor !== null) editorState = editor.state;
	}

	return {
		/** The editor's own part: following the threads, and telling the margin which was clicked. */
		extensions: [paperThreads.configure({ onActivate: (next) => (chosen = next) })],
		get editor() {
			return editor;
		},
		get editorState() {
			return editorState;
		},
		get cards() {
			return cards;
		},
		get activeKey() {
			return chosenCardKey(chosen, isWritingNew);
		},
		get isWritingNew() {
			return isWritingNew;
		},
		get isSuggesting() {
			return editorState !== null && isSuggesting(editorState);
		},
		/** How many suggestions are open, for the title row and the plain form. */
		get suggestionCount() {
			return suggestions.length;
		},
		/** Follow a started editor. The function it returns lets go of it. */
		attach(started: Editor) {
			editor = started;
			editorState = started.state;
			started.on('transaction', handleTransaction);

			return () => {
				started.off('transaction', handleTransaction);
				editor = null;
				editorState = null;
			};
		},
		choose(card: MarginCard) {
			chosen = cardChoice(card);
		},
		/** "Comment": on the selected words, or on the whole paper when none are. */
		startComment() {
			if (editor !== null) startNewThread(editor);
			chosen = null;
			isWritingNew = true;
		},
		stopComment() {
			if (editor !== null) endNewThread(editor);
			isWritingNew = false;
		},
		/** Accept, Reject or Withdraw one suggestion, resolving the thread arguing about it. */
		decide(card: Extract<MarginCard, { kind: 'suggestion' }>, decision: SuggestionDecision) {
			if (editor === null) return;

			decideOneSuggestion(editor, card.suggestion.id, decision);
			postResolvedThreads(card.thread === null ? [] : [card.thread.id]);
			if (chosen?.id === card.suggestion.id) chosen = null;
		},
		decideAll(decision: SuggestionDecision) {
			if (editor === null) return;

			const threadIds = threadsOfOthersSuggestions(cards, setup.userId);
			decideAllSuggestions(editor, decision, setup.userId);
			postResolvedThreads(threadIds);
			chosen = null;
		}
	};
}
