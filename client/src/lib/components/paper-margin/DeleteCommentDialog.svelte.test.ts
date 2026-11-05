import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import DeleteCommentDialog from './DeleteCommentDialog.svelte';

const PAPER_URL = '/conferences/hmun/committees/disec/resolutions/paper-1' as ResolvedPathname;

describe('DeleteCommentDialog', () => {
	it('asks before deleting the comment, and keeps it on the way back', () => {
		render(DeleteCommentDialog, { commentId: 'comment-1', closeHref: PAPER_URL });

		expect(screen.getByRole('heading', { name: 'Delete this comment?' })).toBeTruthy();
		const button = screen.getByRole('button', { name: 'Delete comment' });
		const form = button.closest('form');
		expect(form?.getAttribute('action')).toBe('?/deleteComment');
		expect(new FormData(form ?? undefined).get('commentId')).toBe('comment-1');
		expect(screen.getByRole('link', { name: 'Keep the comment' }).getAttribute('href')).toBe(
			PAPER_URL
		);
	});
});
