import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import type { PaperComment, PaperThread } from '$lib/paper-comments';
import { threadKey } from '$lib/paper-margin';
import ThreadCard from './ThreadCard.svelte';

const PAPER_URL = '/conferences/hmun/committees/disec/resolutions/paper-1' as ResolvedPathname;

const MINE: PaperComment = {
	id: 'comment-1',
	writerName: 'Sofia Reyes',
	seatName: 'Mexico',
	body: 'Should this say “meaningful human control”?',
	isDeleted: false,
	writtenAt: '10:31',
	isMine: true
};
const THEIRS: PaperComment = {
	...MINE,
	id: 'comment-2',
	writerName: 'Jonas Berg',
	seatName: 'Norway',
	body: 'Agreed, see https://example.org/ccw.',
	isMine: false
};
const THREAD: PaperThread = {
	id: 'thread-1',
	fragment: 'body',
	anchorStart: 'c3RhcnQ=',
	anchorEnd: 'ZW5k',
	quotedText: 'human judgement',
	suggestionId: null,
	isResolved: false,
	resolvedByName: null,
	comments: [MINE, THEIRS]
};

function renderCard(
	thread: PaperThread,
	{ isGone = false, isReplyShown = true, editingCommentId = null as string | null } = {}
) {
	const card = { kind: 'thread', key: threadKey(thread.id), thread, place: 4, isGone } as const;

	return render(ThreadCard, {
		card,
		paperUrl: PAPER_URL,
		isActive: false,
		isReplyShown,
		locationText: 'On ‘human judgement’, paragraph 2',
		editingCommentId
	});
}

describe('ThreadCard', () => {
	it('shows each comment with its seat and time, Resolve, and a field to reply', () => {
		renderCard(THREAD);

		expect(screen.getByText('Mexico · 10:31')).toBeTruthy();
		expect(screen.getByText('Jonas Berg')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Resolve' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'https://example.org/ccw' })).toBeTruthy();
		expect(screen.getByRole('textbox', { name: 'Reply to Sofia Reyes' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Reply' })).toBeTruthy();
		expect(screen.getByText('On ‘human judgement’, paragraph 2')).toBeTruthy();
	});

	it('keeps the reply field for the card being read', () => {
		renderCard(THREAD, { isReplyShown: false });

		expect(screen.queryByRole('textbox')).toBeNull();
	});

	it('opens the reader’s own comment to be edited when the address asks', () => {
		renderCard(THREAD, { editingCommentId: 'comment-1', isReplyShown: false });

		const field = screen.getByRole('textbox', { name: 'Your comment' }) as HTMLTextAreaElement;
		expect(field.value).toBe(MINE.body);
		expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe(PAPER_URL);
	});

	it('lets the reader edit and delete only their own comments', () => {
		renderCard(THREAD);

		expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
			`${PAPER_URL}?editComment=comment-1#thread-thread-1`
		);
		expect(screen.getAllByRole('link', { name: 'Delete' })).toHaveLength(1);
	});

	it('folds a resolved thread to who resolved it, with Reopen', () => {
		renderCard({ ...THREAD, isResolved: true, resolvedByName: 'Jonas Berg' });

		expect(screen.getByText('Resolved by Jonas Berg')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Reopen' })).toBeTruthy();
		expect(screen.queryByRole('textbox')).toBeNull();
	});

	it('says when the words it was about were removed, and keeps a deleted comment’s place', () => {
		const deleted = { ...THEIRS, isDeleted: true };
		renderCard({ ...THREAD, comments: [MINE, deleted] }, { isGone: true });

		expect(screen.getByText('The text this was about was removed')).toBeTruthy();
		expect(screen.getByText('Comment deleted')).toBeTruthy();
	});
});
