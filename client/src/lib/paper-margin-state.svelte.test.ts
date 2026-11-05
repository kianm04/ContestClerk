import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaperThread } from './paper-comments';
import { NEW_THREAD_KEY, suggestionKey, threadKey, type MarginCard } from './paper-margin';
import {
	cardChoice,
	chosenCardKey,
	createPaperMargin,
	postResolvedThreads,
	suggestionThreadFields,
	threadAnchors,
	threadPlace,
	threadsOfOthersSuggestions
} from './paper-margin-state.svelte';

const OPEN_THREAD: PaperThread = {
	id: 'thread-1',
	fragment: 'body',
	anchorStart: 'c3RhcnQ=',
	anchorEnd: 'ZW5k',
	quotedText: 'autonomous weapons',
	suggestionId: null,
	isResolved: false,
	resolvedByName: null,
	comments: []
};
const WHOLE_PAPER_THREAD: PaperThread = {
	...OPEN_THREAD,
	id: 'thread-2',
	anchorStart: null,
	anchorEnd: null
};

function suggestionCard(userId: string, thread: PaperThread | null): MarginCard {
	return {
		kind: 'suggestion',
		key: suggestionKey(`suggestion-${userId}`),
		suggestion: {
			id: `suggestion-${userId}`,
			userId,
			at: '2026-10-09T10:31:00Z',
			from: 1,
			to: 4,
			summary: { verb: 'add', inserted: 'urgently' }
		},
		thread,
		place: 1
	};
}

afterEach(() => vi.unstubAllGlobals());

describe('threadAnchors', () => {
	it('follows the threads on passages, drawing only the open ones that argue no suggestion', () => {
		const resolved = { ...OPEN_THREAD, id: 'thread-3', isResolved: true };
		const onSuggestion = { ...OPEN_THREAD, id: 'thread-4', suggestionId: 'suggestion-1' };

		expect(threadAnchors([OPEN_THREAD, WHOLE_PAPER_THREAD, resolved, onSuggestion])).toEqual([
			{ threadId: 'thread-1', start: 'c3RhcnQ=', end: 'ZW5k', isDrawn: true },
			{ threadId: 'thread-3', start: 'c3RhcnQ=', end: 'ZW5k', isDrawn: false },
			{ threadId: 'thread-4', start: 'c3RhcnQ=', end: 'ZW5k', isDrawn: false }
		]);
	});
});

describe('threadPlace', () => {
	it('knows no place before the editor runs, or for a comment on the whole paper', () => {
		expect(threadPlace(null, OPEN_THREAD)).toEqual({ place: null, isGone: false });
		expect(threadPlace(null, WHOLE_PAPER_THREAD)).toEqual({ place: null, isGone: false });
	});
});

describe('chosenCardKey and cardChoice', () => {
	it('names the chosen card, or the new comment while one is being written', () => {
		expect(chosenCardKey({ kind: 'thread', id: 'thread-1' }, true)).toBe(threadKey('thread-1'));
		expect(chosenCardKey({ kind: 'suggestion', id: 'one' }, false)).toBe(suggestionKey('one'));
		expect(chosenCardKey(null, true)).toBe(NEW_THREAD_KEY);
		expect(chosenCardKey(null, false)).toBeNull();
	});

	it('tells the editor which words to draw for a card', () => {
		const threadCard: MarginCard = {
			kind: 'thread',
			key: threadKey('thread-1'),
			thread: OPEN_THREAD,
			place: 3,
			isGone: false
		};

		expect(cardChoice(threadCard)).toEqual({ kind: 'thread', id: 'thread-1' });
		expect(cardChoice(suggestionCard('ana', null))).toEqual({
			kind: 'suggestion',
			id: 'suggestion-ana'
		});
		expect(cardChoice({ kind: 'new', key: NEW_THREAD_KEY, place: null })).toBeNull();
	});
});

describe('threadsOfOthersSuggestions', () => {
	it('leaves out the reader’s own suggestions and those nobody has replied to', () => {
		const cards = [
			suggestionCard('ana', OPEN_THREAD),
			suggestionCard('me', WHOLE_PAPER_THREAD),
			suggestionCard('ben', null)
		];

		expect(threadsOfOthersSuggestions(cards, 'me')).toEqual(['thread-1']);
	});
});

describe('postResolvedThreads', () => {
	it('resolves the threads in the background, and sends nothing for none', () => {
		const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
		vi.stubGlobal('fetch', fetchMock);

		postResolvedThreads([]);
		expect(fetchMock).not.toHaveBeenCalled();

		postResolvedThreads(['thread-1', 'thread-2']);
		const [address, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		const body = request.body as FormData;

		expect(address).toBe('?/resolveThreads');
		expect(body.getAll('threadId')).toEqual(['thread-1', 'thread-2']);
		expect(body.get('background')).toBe('1');
	});
});

describe('suggestionThreadFields', () => {
	it('starts a suggestion’s thread with what it does, and its words once the editor runs', () => {
		const card = suggestionCard('user-ana', null);
		if (card.kind !== 'suggestion') throw new Error('Expected a suggestion card');

		expect(suggestionThreadFields(null, card.suggestion)).toEqual({
			suggestionId: 'suggestion-user-ana',
			quotedText: 'Add ‘urgently’'
		});
	});
});

describe('createPaperMargin', () => {
	it('shows the threads before the editor runs, and the new comment once started', () => {
		// `$effect.root` gives the margin's `$effect` an owner outside a component.
		const stop = $effect.root(() => {
			const margin = createPaperMargin({ threads: () => [WHOLE_PAPER_THREAD], userId: 'me' });
			flushSync();

			expect(margin.cards.map((card) => card.key)).toEqual([threadKey('thread-2')]);
			expect(margin.activeKey).toBeNull();
			expect(margin.isSuggesting).toBe(false);
			expect(margin.suggestionCount).toBe(0);

			margin.startComment();
			flushSync();
			expect(margin.isWritingNew).toBe(true);
			expect(margin.activeKey).toBe(NEW_THREAD_KEY);

			margin.stopComment();
			expect(margin.isWritingNew).toBe(false);
		});

		stop();
	});
});
