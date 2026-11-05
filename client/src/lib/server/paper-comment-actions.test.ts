import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import {
	COMMENT_DELETED_MESSAGE,
	paperCommentActions,
	type CommentedPaper
} from './paper-comment-actions';

// The margin's actions with the database stood in for: what each hands the
// comment functions, where it sends the writer back to, and how it answers a
// refusal. The readers of the form are the real ones. The rows themselves are
// tested in `tests/db/paper-comments.test.ts`.
vi.mock('./flash', () => ({ setFlash: vi.fn() }));
vi.mock('./paper-comments', async (importOriginal) => ({
	...(await importOriginal<typeof import('./paper-comments')>()),
	startPaperThread: vi.fn(),
	replyToPaperThread: vi.fn(),
	editPaperComment: vi.fn(),
	deletePaperComment: vi.fn(),
	resolvePaperThreads: vi.fn(),
	reopenPaperThread: vi.fn()
}));

import { setFlash } from './flash';
import {
	deletePaperComment,
	editPaperComment,
	reopenPaperThread,
	replyToPaperThread,
	resolvePaperThreads,
	startPaperThread
} from './paper-comments';

const SUPABASE = {};
const COOKIES = {};
const PAGE = '/conferences/thimun-2027/committees/disec/resolutions/paper-1';
const PAPER: CommentedPaper = {
	target: { kind: 'committee', paperId: 'paper-1' },
	pageUrl: PAGE
};
const DONE = { refusal: null };
const REFUSED = { refusal: 'Only the writer of a comment may change it.' };

const findPaper = vi.fn(async () => PAPER);
const actions = paperCommentActions(findPaper);

/** An action's request with `fields` posted, several values for a name given as a list. */
function makeEvent(fields: Record<string, string | string[]>): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		for (const one of [value].flat()) formData.append(name, one);
	}

	return {
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** Run an action expected to redirect, and give back where it sent the writer. */
async function redirectedTo(run: () => unknown): Promise<string> {
	try {
		await run();
	} catch (thrown) {
		return (thrown as { location: string }).location;
	}

	throw new Error('The action did not redirect');
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('paperCommentActions', () => {
	it('starts a thread on the chosen words and goes back to it', async () => {
		vi.mocked(startPaperThread).mockResolvedValue({ refusal: null, threadId: 'thread-9' });
		const event = makeEvent({
			body: 'Is 2028 too soon?',
			anchorStart: 'AQ==',
			anchorEnd: 'Ag==',
			quotedText: 'no later than 2028'
		});

		expect(await redirectedTo(() => actions.startThread(event))).toBe(`${PAGE}#thread-thread-9`);
		expect(findPaper).toHaveBeenCalledWith(event);
		expect(startPaperThread).toHaveBeenCalledWith(
			SUPABASE,
			PAPER.target,
			{
				body: 'Is 2028 too soon?',
				anchorStart: 'AQ==',
				anchorEnd: 'Ag==',
				quotedText: 'no later than 2028',
				suggestionId: null,
				part: null
			},
			'body'
		);
	});

	it("keeps a thread on a draft resolution's words with the part they are in", async () => {
		vi.mocked(startPaperThread).mockResolvedValue({ refusal: null, threadId: 'thread-9' });
		findPaper.mockResolvedValueOnce({ ...PAPER, parts: ['preamble', 'operative'] });
		const event = makeEvent({
			body: 'Is 2028 too soon?',
			anchorStart: 'AQ==',
			anchorEnd: 'Ag==',
			quotedText: 'no later than 2028',
			part: 'operative'
		});

		await redirectedTo(() => actions.startThread(event));
		expect(startPaperThread).toHaveBeenCalledWith(
			SUPABASE,
			PAPER.target,
			expect.objectContaining({ part: 'operative' }),
			'operative'
		);
	});

	it('replies, edits and reopens at the thread', async () => {
		vi.mocked(replyToPaperThread).mockResolvedValue(DONE);
		vi.mocked(editPaperComment).mockResolvedValue(DONE);
		vi.mocked(reopenPaperThread).mockResolvedValue(DONE);
		const atThread = `${PAGE}#thread-thread-1`;

		const reply = makeEvent({ threadId: 'thread-1', body: 'Agreed.' });
		const edit = makeEvent({ threadId: 'thread-1', commentId: 'comment-1', body: 'Agreed!' });
		const reopen = makeEvent({ threadId: 'thread-1' });

		expect(await redirectedTo(() => actions.reply(reply))).toBe(atThread);
		expect(await redirectedTo(() => actions.editComment(edit))).toBe(atThread);
		expect(await redirectedTo(() => actions.reopenThread(reopen))).toBe(atThread);
		expect(replyToPaperThread).toHaveBeenCalledWith(SUPABASE, 'thread-1', 'Agreed.');
		expect(editPaperComment).toHaveBeenCalledWith(SUPABASE, 'comment-1', 'Agreed!');
		expect(reopenPaperThread).toHaveBeenCalledWith(SUPABASE, 'thread-1');
	});

	it('deletes a comment, says so, and closes the dialog by going back to the page', async () => {
		vi.mocked(deletePaperComment).mockResolvedValue(DONE);

		const event = makeEvent({ commentId: 'comment-1' });

		expect(await redirectedTo(() => actions.deleteComment(event))).toBe(PAGE);
		expect(deletePaperComment).toHaveBeenCalledWith(SUPABASE, 'comment-1');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: COMMENT_DELETED_MESSAGE
		});
	});

	it('resolves one thread at its card, several at the page, and answers a background resolve', async () => {
		vi.mocked(resolvePaperThreads).mockResolvedValue(DONE);

		const one = makeEvent({ threadId: 'thread-1' });
		const several = makeEvent({ threadId: ['thread-1', 'thread-2'] });
		const background = makeEvent({ threadId: ['thread-1', 'thread-2'], background: '1' });

		expect(await redirectedTo(() => actions.resolveThreads(one))).toBe(`${PAGE}#thread-thread-1`);
		expect(await redirectedTo(() => actions.resolveThreads(several))).toBe(PAGE);
		expect(await actions.resolveThreads(background)).toEqual({
			threadsResolved: ['thread-1', 'thread-2']
		});
		expect(resolvePaperThreads).toHaveBeenLastCalledWith(SUPABASE, ['thread-1', 'thread-2']);
	});

	it('answers a refusal with its sentence, leaving the page where it was', async () => {
		vi.mocked(editPaperComment).mockResolvedValue(REFUSED);
		vi.mocked(startPaperThread).mockResolvedValue({ ...REFUSED, threadId: null });

		const refusedWith = {
			status: 400,
			data: { flash: { tone: 'error', message: REFUSED.refusal } }
		};

		expect(await actions.editComment(makeEvent({ commentId: 'comment-2' }))).toMatchObject(
			refusedWith
		);
		expect(await actions.startThread(makeEvent({ body: 'Hm' }))).toMatchObject(refusedWith);
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('names no thread when a form has none, which the change refuses', async () => {
		vi.mocked(reopenPaperThread).mockResolvedValue(REFUSED);

		await actions.reopenThread(makeEvent({}));

		expect(reopenPaperThread).toHaveBeenCalledWith(SUPABASE, '');
	});
});
