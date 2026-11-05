/*
	The margin beside a live paper (docs/committee-papers.md, sections 4 and 6):
	which cards it holds, in what order, where each one sits, and the words
	that say where its text is. A card is a comment thread, a suggestion with
	the thread arguing about it, or the new comment being written.

	On a desktop each card sits level with its words, as in Google Docs; on a
	phone the cards follow the paper in one column, and a line on each says
	where its words are. This file only works the answers out; the components
	in `$lib/components/paper-margin/` draw them.
*/

import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { quotedTextOn, type PaperThread } from '$lib/paper-comments';
import type { Suggestion, SuggestionSummary } from '$lib/paper-suggestions';

/** The new comment's card, which is never more than one. */
export const NEW_THREAD_KEY = 'new-thread';

/** A thread card's key, which is also its element's id: notifications link to `#thread-<id>`. */
export function threadKey(threadId: string): string {
	return `thread-${threadId}`;
}

/** A suggestion card's key, which is also its element's id. */
export function suggestionKey(suggestionId: string): string {
	return `suggestion-${suggestionId}`;
}

/**
 * Where a card's words are in the editor's document: a position, or `null`
 * for a card that is on the whole paper or whose place is not known.
 */
type Place = number | null;

/** One card of the margin. `key` names it while the text around it changes. */
export type MarginCard =
	| { kind: 'new'; key: string; place: Place }
	| {
			kind: 'thread';
			key: string;
			thread: PaperThread;
			place: Place;
			/** Whether the words it was on have been deleted from the paper. */
			isGone: boolean;
	  }
	| {
			kind: 'suggestion';
			key: string;
			suggestion: Suggestion;
			/** The thread arguing about it, once somebody has replied to it. */
			thread: PaperThread | null;
			place: Place;
	  };

/** Where a thread's words are now, as the editor finds them. */
export type ThreadPlace = { place: Place; isGone: boolean };

/** What the margin is made from. */
export type MarginContents = {
	/** The paper's threads, in the order they were started. */
	threads: PaperThread[];
	/** The open suggestions in the text, in the order they are read. */
	suggestions: Suggestion[];
	/** Where a thread's words are: on the server, and without JavaScript, nobody knows. */
	placeOf: (thread: PaperThread) => ThreadPlace;
	/** The new comment being written, on the words at `place` or on the whole paper. */
	newThread: { place: Place } | null;
};

/** Whether a card belongs at the top, with the comments on the whole paper. */
function isOnWholePaper(card: MarginCard): boolean {
	if (card.kind === 'new') return card.place === null;
	if (card.kind === 'thread') return card.thread.anchorStart === null;

	return false;
}

/**
 * The cards in the order the margin shows them: the comments on the whole
 * paper first, then every card in the order its words are read, then the
 * cards whose place nobody knows, in the order they were started. A thread
 * on a suggestion still open is shown on the suggestion's own card.
 */
export function marginCards(contents: MarginContents): MarginCard[] {
	const openSuggestionIds = new Set(contents.suggestions.map((suggestion) => suggestion.id));
	const threadsBySuggestion = new Map<string, PaperThread>();
	const cards: MarginCard[] = [];

	for (const thread of contents.threads) {
		if (thread.suggestionId !== null && openSuggestionIds.has(thread.suggestionId)) {
			threadsBySuggestion.set(thread.suggestionId, thread);
			continue;
		}
		cards.push({ kind: 'thread', key: threadKey(thread.id), thread, ...contents.placeOf(thread) });
	}

	for (const suggestion of contents.suggestions) {
		cards.push({
			kind: 'suggestion',
			key: suggestionKey(suggestion.id),
			suggestion,
			thread: threadsBySuggestion.get(suggestion.id) ?? null,
			place: suggestion.from
		});
	}

	if (contents.newThread) {
		cards.push({ kind: 'new', key: NEW_THREAD_KEY, place: contents.newThread.place });
	}

	const onWholePaper = cards.filter(isOnWholePaper);
	// The new comment on the whole paper goes first, where its writer is looking.
	onWholePaper.sort(
		(first, second) => Number(second.kind === 'new') - Number(first.kind === 'new')
	);
	const placed = cards.filter((card) => !isOnWholePaper(card) && card.place !== null);
	// `sort` keeps cards at the same place in the order they were added above.
	placed.sort((first, second) => (first.place ?? 0) - (second.place ?? 0));
	const unplaced = cards.filter((card) => !isOnWholePaper(card) && card.place === null);

	return [...onWholePaper, ...placed, ...unplaced];
}

/** A card as `placeCards` sees it: where its words are, and how tall it is drawn. */
export type CardBox = {
	key: string;
	/** The top of its words, measured from the top of the margin. */
	desiredTop: number;
	height: number;
};

/** Every card stacked from the top, each at its words unless the one before is in the way. */
function stackedFromTheTop(cards: CardBox[], gap: number): number[] {
	const tops: number[] = [];

	cards.forEach((card, index) => {
		const previousBottom = index === 0 ? 0 : tops[index - 1] + cards[index - 1].height + gap;
		tops.push(Math.max(card.desiredTop, previousBottom, 0));
	});

	return tops;
}

/**
 * Where each card's top goes, in the order the cards are handed in. Each sits
 * level with its words, and pushes the cards after it down when they would
 * overlap. The chosen card sits at its words exactly and pushes the cards
 * before it up instead, as Google Docs does, unless they would then go above
 * the top of the margin.
 */
export function placeCards(cards: CardBox[], gap: number, activeKey: string | null): number[] {
	const active = cards.findIndex((card) => card.key === activeKey);
	if (active === -1) return stackedFromTheTop(cards, gap);

	const tops = new Array<number>(cards.length);
	tops[active] = Math.max(cards[active].desiredTop, 0);

	for (let index = active + 1; index < cards.length; index++) {
		const previousBottom = tops[index - 1] + cards[index - 1].height + gap;
		tops[index] = Math.max(cards[index].desiredTop, previousBottom);
	}

	for (let index = active - 1; index >= 0; index--) {
		const nextTop = tops[index + 1];
		tops[index] = Math.min(cards[index].desiredTop, nextTop - gap - cards[index].height);
	}

	return tops[0] < 0 ? stackedFromTheTop(cards, gap) : tops;
}

function isList(block: ProseMirrorNode): boolean {
	return block.type.name === 'bulletList' || block.type.name === 'orderedList';
}

/** Whether a block of the paper is one a reader calls a paragraph: not a heading or a list. */
function isParagraph(block: ProseMirrorNode): boolean {
	return block.type.name !== 'heading' && !isList(block);
}

/**
 * Where `position` is in a working paper, the way a writer points at it:
 * "opening paragraph", "paragraph 3", "item 2" (of the list it is in, an
 * item inside an item counting as its top item) or "heading".
 */
export function passageLocation(document: ProseMirrorNode, position: number): string {
	const resolved = document.resolve(Math.max(0, Math.min(position, document.content.size)));
	// The block of the paper the position is in, counted from 0; past the last one, the last.
	const blockIndex = Math.min(resolved.index(0), document.childCount - 1);
	const block = document.child(blockIndex);

	if (block.type.name === 'heading') return 'heading';
	if (isList(block)) {
		const itemIndex = resolved.depth >= 1 ? Math.min(resolved.index(1), block.childCount - 1) : 0;
		return `item ${itemIndex + 1}`;
	}

	let paragraphNumber = 0;
	for (let index = 0; index <= blockIndex; index++) {
		if (isParagraph(document.child(index))) paragraphNumber += 1;
	}

	return paragraphNumber === 1 ? 'opening paragraph' : `paragraph ${paragraphNumber}`;
}

/** "Opening paragraph", for a line that starts with the place. */
export function capitalised(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A suggestion in one sentence, which a reply to it keeps as the words it is
 * on: "Replace ‘no later than’ with ‘by the end of’".
 */
export function suggestionSummarySentence(summary: SuggestionSummary): string {
	switch (summary.verb) {
		case 'replace':
			return `Replace ‘${summary.deleted}’ with ‘${summary.inserted}’`;
		case 'add':
			return `Add ‘${summary.inserted}’`;
		case 'delete':
			return `Delete ‘${summary.deleted}’`;
		case 'format':
			return `Change the formatting of ‘${summary.text}’`;
		case 'split':
			return 'Start a new paragraph';
		case 'join':
			return 'Join two paragraphs';
	}
}

/** Who made a suggestion, as its card names them. */
export type Suggester = { name: string; seatName: string | null };

/** Who writes a new comment, as its card names them: "Eleanor Price", "Chair". */
export type NewCommentWriter = { name: string; title: string | null };

/**
 * The dais's notes for a paper's authors: the margin keeps its title on show
 * with the count, signs a new note with its writer, and offers one only while
 * `isOpen`, as the database takes them only until the paper is introduced.
 */
export type MarginNotes = {
	title: string;
	count: number;
	writer: NewCommentWriter;
	isOpen: boolean;
};

/**
 * Somebody who may have suggested words: one of a paper's authors (a
 * `PaperPerson` is one), or a member of the delegation writing a position
 * paper, who has no seat name to show.
 */
export type MarginWriter = {
	holderId: string | null;
	holderName: string | null;
	seatName: string | null;
};

/**
 * The person whose id a suggestion's marks carry, found among the paper's
 * writers. Somebody who has left the paper, or given up their seat, is "A
 * former author": their suggestion stays until somebody decides it.
 */
export function suggesterOf(writers: MarginWriter[], userId: string): Suggester {
	const writer = writers.find((each) => each.holderId === userId);
	if (writer?.holderName) return { name: writer.holderName, seatName: writer.seatName };

	return { name: 'A former author', seatName: null };
}

/**
 * The line a card starts with on a phone, where it sits under the paper and
 * not beside its words: "On ‘no later than 2028’, paragraph 2" for a thread,
 * "Paragraph 2" for a suggestion, "On the whole paper". `null` for the new
 * comment, and for a thread whose words are gone, which says so itself.
 * Without the editor's document only the quoted words are known.
 */
export function cardLocationText(
	card: MarginCard,
	document: ProseMirrorNode | null
): string | null {
	if (card.kind === 'new') return null;

	const location =
		document === null || card.place === null ? null : passageLocation(document, card.place);

	if (card.kind === 'suggestion') return location === null ? null : capitalised(location);
	if (card.isGone) return null;
	if (card.thread.anchorStart === null || card.thread.quotedText === null) {
		return 'On the whole paper';
	}

	const onWords = quotedTextOn(card.thread.quotedText);

	return location === null ? onWords : `${onWords}, ${location}`;
}

/** Where the margin's cards sit beside the text, and how tall the margin is then. */
export type MarginLayout = { tops: Record<string, number>; height: number };

/**
 * Lay the cards out beside their words. `topOf` says how far down the margin
 * a place in the text is drawn, `null` when the editor cannot say; a card on
 * the whole paper, or whose place is unknown, wants the top and is pushed
 * down by the cards before it. `heights` are the cards as last drawn.
 */
export function marginLayout(
	cards: MarginCard[],
	topOf: (place: number) => number | null,
	heights: Record<string, number>,
	activeKey: string | null,
	gap: number
): MarginLayout {
	const boxes: CardBox[] = cards.map((card) => ({
		key: card.key,
		desiredTop: card.place === null ? 0 : (topOf(card.place) ?? 0),
		height: heights[card.key] ?? 0
	}));
	const placed = placeCards(boxes, gap, activeKey);
	const tops: Record<string, number> = {};
	let height = 0;

	boxes.forEach((box, index) => {
		tops[box.key] = placed[index];
		height = Math.max(height, placed[index] + box.height);
	});

	return { tops, height };
}
