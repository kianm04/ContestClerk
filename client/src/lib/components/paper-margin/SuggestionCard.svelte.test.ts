import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import type { PaperThread } from '$lib/paper-comments';
import { suggestionKey, type MarginCard } from '$lib/paper-margin';
import SuggestionCard from './SuggestionCard.svelte';

const PAPER_URL = '/conferences/hmun/committees/disec/resolutions/paper-1' as ResolvedPathname;

const CARD: Extract<MarginCard, { kind: 'suggestion' }> = {
	kind: 'suggestion',
	key: suggestionKey('suggestion-1'),
	suggestion: {
		id: 'suggestion-1',
		userId: 'user-ana',
		at: '2026-10-09T15:18:00Z',
		from: 3,
		to: 9,
		summary: { verb: 'replace', deleted: 'encourages', inserted: 'calls upon' }
	},
	thread: null,
	place: 3
};

function renderCard(isMine: boolean, onDecide = vi.fn(), card = CARD, isReplyShown = false) {
	render(SuggestionCard, {
		card,
		suggester: { name: 'Ana Lima', seatName: 'Brazil' },
		timeText: '17:18',
		isMine,
		isActive: false,
		paperUrl: PAPER_URL,
		onDecide,
		isReplyShown,
		startThread: () => ({ suggestionId: 'suggestion-1', quotedText: 'Replace' }),
		locationText: 'Clause 1',
		editingCommentId: null
	});

	return onDecide;
}

describe('SuggestionCard', () => {
	it('says what the suggestion does, with the struck and the added words', () => {
		renderCard(false);

		expect(screen.getByText('Brazil · 17:18')).toBeTruthy();
		expect(screen.getByText(/encourages/).tagName).toBe('DEL');
		expect(screen.getByText(/calls upon/).closest('ins')).toBeTruthy();
	});

	it('lets another author accept or reject it', () => {
		const onDecide = renderCard(false);

		screen.getByRole('button', { name: 'Accept' }).click();
		screen.getByRole('button', { name: 'Reject' }).click();

		expect(onDecide.mock.calls).toEqual([['accept'], ['reject']]);
	});

	it('lets its own writer only withdraw it', () => {
		const onDecide = renderCard(true);

		expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
		screen.getByRole('button', { name: 'Withdraw' }).click();

		expect(onDecide).toHaveBeenCalledWith('reject');
	});

	it('puts the argument about it before the buttons, and a reply field on the chosen card', () => {
		const thread: PaperThread = {
			id: 'thread-1',
			fragment: 'body',
			anchorStart: null,
			anchorEnd: null,
			quotedText: 'Replace',
			suggestionId: 'suggestion-1',
			isResolved: false,
			resolvedByName: null,
			comments: [
				{
					id: 'comment-1',
					writerName: 'Jonas Berg',
					seatName: 'Norway',
					body: 'Keep it as it was.',
					isDeleted: false,
					writtenAt: '17:20',
					isMine: false
				}
			]
		};
		renderCard(false, vi.fn(), { ...CARD, thread }, true);

		const comment = screen.getByText('Keep it as it was.');
		const accept = screen.getByRole('button', { name: 'Accept' });
		// DOCUMENT_POSITION_FOLLOWING: the button comes after the comment.
		expect(comment.compareDocumentPosition(accept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(screen.getByRole('textbox', { name: 'Reply to Ana Lima' })).toBeTruthy();
		expect(screen.getByText('Clause 1')).toBeTruthy();
	});
});
