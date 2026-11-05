import { describe, expect, it } from 'vitest';
import type { PaperPerson } from '$lib/committee-papers';
import type { PaperThread } from '$lib/paper-comments';
import type { Suggestion } from '$lib/paper-suggestions';
import { paper, paragraph } from '../../tests/paper-suggestion-fixtures';
import {
	NEW_THREAD_KEY,
	capitalised,
	cardLocationText,
	marginCards,
	marginLayout,
	passageLocation,
	placeCards,
	suggesterOf,
	suggestionKey,
	suggestionSummarySentence,
	threadKey,
	type CardBox,
	type MarginCard,
	type ThreadPlace
} from './paper-margin';

/** A thread on the passage `quoted`, or on the whole paper when `quoted` is `null`. */
function thread(
	id: string,
	quoted: string | null,
	suggestionId: string | null = null
): PaperThread {
	return {
		id,
		fragment: 'body',
		anchorStart: quoted === null ? null : `start-${id}`,
		anchorEnd: quoted === null ? null : `end-${id}`,
		quotedText: quoted,
		suggestionId,
		isResolved: false,
		resolvedByName: null,
		comments: []
	};
}

function suggestionAt(id: string, from: number): Suggestion {
	return {
		id,
		userId: 'ben',
		at: '2026-10-09T09:00:00.000Z',
		from,
		to: from + 4,
		summary: { verb: 'add', inserted: 'more' }
	};
}

/** Where each thread's words are, by id; a thread not listed has no known place. */
function placesBy(places: Record<string, ThreadPlace>) {
	return (each: PaperThread) => places[each.id] ?? { place: null, isGone: false };
}

describe('threadKey and suggestionKey', () => {
	it('name the cards the way notifications link to them', () => {
		expect(threadKey('t1')).toBe('thread-t1');
		expect(suggestionKey('s1')).toBe('suggestion-s1');
	});
});

describe('marginCards', () => {
	it('puts the comments on the whole paper first, then every card in reading order', () => {
		const cards = marginCards({
			threads: [thread('late', 'later words'), thread('whole', null), thread('early', 'first')],
			suggestions: [suggestionAt('s1', 12)],
			placeOf: placesBy({
				late: { place: 30, isGone: false },
				early: { place: 2, isGone: false }
			}),
			newThread: null
		});

		expect(cards.map((card) => card.key)).toEqual([
			'thread-whole',
			'thread-early',
			'suggestion-s1',
			'thread-late'
		]);
	});

	it('shows a reply to an open suggestion on its card, and on a card of its own once decided', () => {
		const contents = {
			threads: [thread('about-s1', 'Add ‘more’', 's1'), thread('about-s2', 'Delete ‘x’', 's2')],
			suggestions: [suggestionAt('s1', 5)],
			placeOf: placesBy({ 'about-s2': { place: 9, isGone: false } }),
			newThread: null
		};

		const cards = marginCards(contents);

		expect(cards.map((card) => card.key)).toEqual(['suggestion-s1', 'thread-about-s2']);
		expect(cards[0]).toMatchObject({ kind: 'suggestion', thread: { id: 'about-s1' } });
	});

	it('keeps a removed passage where its words were, and a card with no place at the end', () => {
		const cards = marginCards({
			threads: [thread('lost', 'nowhere'), thread('gone', 'deleted words'), thread('here', 'kept')],
			suggestions: [],
			placeOf: placesBy({
				gone: { place: 3, isGone: true },
				here: { place: 8, isGone: false },
				lost: { place: null, isGone: true }
			}),
			newThread: null
		});

		expect(cards.map((card) => card.key)).toEqual(['thread-gone', 'thread-here', 'thread-lost']);
		expect(cards[0]).toMatchObject({ isGone: true, place: 3 });
	});

	it('puts a new comment on the whole paper above every other, and one on words beside them', () => {
		const threads = [thread('whole', null), thread('words', 'words')];
		const placeOf = placesBy({ words: { place: 10, isGone: false } });

		const onWholePaper = marginCards({
			threads,
			suggestions: [],
			placeOf,
			newThread: { place: null }
		});
		const onWords = marginCards({ threads, suggestions: [], placeOf, newThread: { place: 4 } });

		expect(onWholePaper.map((card) => card.key)).toEqual([
			NEW_THREAD_KEY,
			'thread-whole',
			'thread-words'
		]);
		expect(onWords.map((card) => card.key)).toEqual([
			'thread-whole',
			NEW_THREAD_KEY,
			'thread-words'
		]);
	});

	it('lists the threads in the order they were started where nobody knows their places', () => {
		const cards = marginCards({
			threads: [thread('second', 'b'), thread('whole', null), thread('first', 'a')],
			suggestions: [],
			placeOf: placesBy({}),
			newThread: null
		});

		expect(cards.map((card) => card.key)).toEqual([
			'thread-whole',
			'thread-second',
			'thread-first'
		]);
	});
});

describe('placeCards', () => {
	const box = (key: string, desiredTop: number, height = 50): CardBox => ({
		key,
		desiredTop,
		height
	});

	it('sets each card level with its words, pushing the next down when they would overlap', () => {
		const tops = placeCards([box('a', 0), box('b', 30), box('c', 200)], 12, null);

		expect(tops).toEqual([0, 62, 200]);
	});

	it('keeps the chosen card at its words and pushes the cards before it up', () => {
		const tops = placeCards([box('a', 100), box('b', 120), box('c', 130)], 10, 'b');

		expect(tops).toEqual([60, 120, 180]);
	});

	it('stacks from the top when pushing up would lift a card above the margin', () => {
		const tops = placeCards([box('a', 0), box('b', 20)], 10, 'b');

		expect(tops).toEqual([0, 60]);
	});

	it('never puts a card above the top of the margin', () => {
		expect(placeCards([box('a', -40)], 10, null)).toEqual([0]);
		expect(placeCards([box('a', -40)], 10, 'a')).toEqual([0]);
	});
});

describe('passageLocation', () => {
	// The positions of the words, worked out by ProseMirror's counting: one for
	// every character, and one for each edge of a block.
	const document = paper(
		paragraph('Opening.'),
		{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Aims' }] },
		paragraph('Second.'),
		{
			type: 'bulletList',
			content: [
				{ type: 'listItem', content: [paragraph('One')] },
				{
					type: 'listItem',
					content: [
						paragraph('Two'),
						{ type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('Inner')] }] }
					]
				}
			]
		},
		paragraph('Last.')
	);
	const positionOf = (words: string) => {
		let found = -1;
		document.descendants((node, position) => {
			if (node.isText && node.text === words) found = position;
		});
		return found;
	};

	it('names the opening paragraph, a heading and a later paragraph', () => {
		expect(passageLocation(document, positionOf('Opening.') + 2)).toBe('opening paragraph');
		expect(passageLocation(document, positionOf('Aims'))).toBe('heading');
		// A heading is not a paragraph, so the one after it is the second.
		expect(passageLocation(document, positionOf('Second.'))).toBe('paragraph 2');
		expect(passageLocation(document, positionOf('Last.'))).toBe('paragraph 3');
	});

	it('names a list item by its place in its list, an inner item by its top item', () => {
		expect(passageLocation(document, positionOf('One'))).toBe('item 1');
		expect(passageLocation(document, positionOf('Two') + 1)).toBe('item 2');
		expect(passageLocation(document, positionOf('Inner'))).toBe('item 2');
	});

	it('names the last block for a place past the end', () => {
		expect(passageLocation(document, document.content.size)).toBe('paragraph 3');
		expect(passageLocation(document, document.content.size + 10)).toBe('paragraph 3');
	});
});

describe('capitalised', () => {
	it('starts a place with a capital, for a line that is only the place', () => {
		expect(capitalised('opening paragraph')).toBe('Opening paragraph');
		expect(capitalised('')).toBe('');
	});
});

describe('suggestionSummarySentence', () => {
	it('says what a suggestion does in one sentence', () => {
		expect(
			suggestionSummarySentence({ verb: 'replace', deleted: 'no later than', inserted: 'by' })
		).toBe('Replace ‘no later than’ with ‘by’');
		expect(suggestionSummarySentence({ verb: 'add', inserted: 'swiftly' })).toBe('Add ‘swiftly’');
		expect(suggestionSummarySentence({ verb: 'delete', deleted: 'all' })).toBe('Delete ‘all’');
		expect(suggestionSummarySentence({ verb: 'format', text: 'Aims' })).toBe(
			'Change the formatting of ‘Aims’'
		);
		expect(suggestionSummarySentence({ verb: 'split' })).toBe('Start a new paragraph');
		expect(suggestionSummarySentence({ verb: 'join' })).toBe('Join two paragraphs');
	});
});

describe('suggesterOf', () => {
	const people: PaperPerson[] = [
		{
			seatId: 'seat-mexico',
			seatName: 'Mexico',
			countryCode: 'mx',
			holderId: 'daniel',
			holderName: 'Daniel Osei',
			role: 'author',
			isLead: true,
			isMine: false
		},
		{
			seatId: 'seat-chile',
			seatName: 'Chile',
			countryCode: 'cl',
			holderId: null,
			holderName: null,
			role: 'author',
			isLead: false,
			isMine: false
		}
	];

	it('names an author by the seat they hold', () => {
		expect(suggesterOf(people, 'daniel')).toEqual({ name: 'Daniel Osei', seatName: 'Mexico' });
	});

	it('calls somebody no longer among the authors a former author', () => {
		expect(suggesterOf(people, 'priya')).toEqual({ name: 'A former author', seatName: null });
	});
});

describe('cardLocationText', () => {
	const document = paper(paragraph('Opening.'), paragraph('No later than 2028.'));
	const placeOfSecond = 'Opening.'.length + 3;

	it('says what a thread is on and where, for a phone', () => {
		const card: MarginCard = {
			kind: 'thread',
			key: threadKey('t1'),
			thread: thread('t1', 'no later than 2028'),
			place: placeOfSecond,
			isGone: false
		};

		expect(cardLocationText(card, document)).toBe('On ‘no later than 2028’, paragraph 2');
		// Without the editor, only the words are known.
		expect(cardLocationText(card, null)).toBe('On ‘no later than 2028’');
	});

	it('says a suggestion’s place, a whole-paper thread, and nothing for gone words or a new comment', () => {
		const onSuggestion: MarginCard = {
			kind: 'suggestion',
			key: suggestionKey('s1'),
			suggestion: suggestionAt('s1', 2),
			thread: null,
			place: 2
		};
		const onWholePaper: MarginCard = {
			kind: 'thread',
			key: threadKey('t2'),
			thread: thread('t2', null),
			place: null,
			isGone: false
		};
		const gone: MarginCard = { ...onWholePaper, thread: thread('t3', 'gone'), isGone: true };

		expect(cardLocationText(onSuggestion, document)).toBe('Opening paragraph');
		expect(cardLocationText(onWholePaper, document)).toBe('On the whole paper');
		expect(cardLocationText(gone, document)).toBeNull();
		expect(cardLocationText({ kind: 'new', key: NEW_THREAD_KEY, place: 2 }, document)).toBeNull();
	});
});

describe('marginLayout', () => {
	const cardAt = (id: string, place: number | null): MarginCard => ({
		kind: 'thread',
		key: threadKey(id),
		thread: thread(id, place === null ? null : id),
		place,
		isGone: false
	});

	it('sets each card level with its words and pushes the next one down', () => {
		const cards = [cardAt('a', null), cardAt('b', 10), cardAt('c', 20)];
		const topOf = (place: number) => place * 10;
		const heights = { [threadKey('a')]: 50, [threadKey('b')]: 120, [threadKey('c')]: 40 };

		expect(marginLayout(cards, topOf, heights, null, 12)).toEqual({
			tops: { [threadKey('a')]: 0, [threadKey('b')]: 100, [threadKey('c')]: 232 },
			height: 272
		});
	});

	it('stacks a card whose place the editor cannot draw under the one before', () => {
		const cards = [cardAt('a', 5), cardAt('b', 7)];
		const layout = marginLayout(cards, () => null, { [threadKey('a')]: 30 }, null, 12);

		expect(layout.tops[threadKey('b')]).toBe(42);
	});
});
