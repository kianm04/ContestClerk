/**
 * The form actions behind a paper's margin (`docs/committee-papers.md`,
 * section 4): "Comment", "Reply", changing and deleting one's own comment,
 * "Resolve" and "Reopen". The committee paper page and the position paper
 * pages spread them into their own `actions`, each saying how to find its
 * paper, the way `floorActions` is shared between the chair's pages.
 *
 * Every answer comes back to the paper page, at the thread when there is
 * one, so the margin works the same with and without JavaScript: without it
 * the browser follows the redirect and scrolls to the thread, and with it
 * `createInPlaceForm` reads the page again where it is.
 *
 * Files under `$lib/server` only ever run on the server.
 */

import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Flash } from '$lib/flash';
import type { PaperCommentTarget, PaperFragment } from '$lib/paper-comments';
import { threadKey } from '$lib/paper-margin';
import { setFlash } from './flash';
import {
	deletePaperComment,
	newThreadFragment,
	editPaperComment,
	readCommentBody,
	readCommentId,
	readNewThreadForm,
	readThreadIds,
	reopenPaperThread,
	replyToPaperThread,
	resolvePaperThreads,
	startPaperThread
} from './paper-comments';

/** The paper an action is on, and the address of the page it is written on. */
export type CommentedPaper = {
	target: PaperCommentTarget;
	pageUrl: string;
	/** The parts its text is written in, `$lib/resolution-text.ts`'s `paperParts`; 'body' when left out. */
	parts?: readonly PaperFragment[];
};

/** The toast once a comment is deleted, the only change that closes a dialog. */
export const COMMENT_DELETED_MESSAGE = 'Comment deleted.';

/** Refuse with the database's sentence as a toast, leaving the page as it was. */
function refuse(message: string) {
	return fail(400, { flash: { tone: 'error', message } satisfies Flash });
}

/** The page's address at a thread's card: `…#thread-<id>`. */
function atThread(pageUrl: string, threadId: string | null) {
	return threadId === null ? pageUrl : `${pageUrl}#${threadKey(threadId)}`;
}

/** The one thread a form is about, `null` when it names none. */
function oneThreadId(formData: FormData): string | null {
	return readThreadIds(formData)[0] ?? null;
}

/**
 * The comment actions. `findPaper` checks again that the reader may see the
 * paper, by throwing when they may not, since each action is its own request
 * and nothing the page's `load` worked out reaches it.
 */
export function paperCommentActions<Event extends RequestEvent>(
	findPaper: (event: Event) => Promise<CommentedPaper>
) {
	return {
		/** "Comment": a thread on the words the writer chose, or on the whole paper. */
		startThread: async (event: Event) => {
			const { target, pageUrl, parts = ['body'] } = await findPaper(event);
			const thread = readNewThreadForm(await event.request.formData());
			const fragment = newThreadFragment(parts, thread);
			const started = await startPaperThread(event.locals.supabase, target, thread, fragment);

			if (started.refusal !== null) return refuse(started.refusal);

			redirect(303, atThread(pageUrl, started.threadId));
		},

		/** "Reply", which opens a resolved thread again. */
		reply: async (event: Event) => {
			const { pageUrl } = await findPaper(event);
			const formData = await event.request.formData();
			const threadId = oneThreadId(formData);
			// No thread is no uuid, which the change refuses without asking the database.
			const change = await replyToPaperThread(
				event.locals.supabase,
				threadId ?? '',
				readCommentBody(formData)
			);

			if (change.refusal !== null) return refuse(change.refusal);

			redirect(303, atThread(pageUrl, threadId));
		},

		/** "Save changes" on the reader's own comment, which leaves `?editComment=` behind. */
		editComment: async (event: Event) => {
			const { pageUrl } = await findPaper(event);
			const formData = await event.request.formData();
			const change = await editPaperComment(
				event.locals.supabase,
				readCommentId(formData),
				readCommentBody(formData)
			);

			if (change.refusal !== null) return refuse(change.refusal);

			redirect(303, atThread(pageUrl, oneThreadId(formData)));
		},

		/** "Delete comment" in its dialog, which the redirect closes. */
		deleteComment: async (event: Event) => {
			const { pageUrl } = await findPaper(event);
			const formData = await event.request.formData();
			const change = await deletePaperComment(event.locals.supabase, readCommentId(formData));

			if (change.refusal !== null) return refuse(change.refusal);

			setFlash(event.cookies, { tone: 'success', message: COMMENT_DELETED_MESSAGE });
			redirect(303, pageUrl);
		},

		/**
		 * "Resolve", and the threads of suggestions just decided. The editor
		 * sends those with `background=1` while the writer carries on, and is
		 * answered with data instead of a redirect.
		 */
		resolveThreads: async (event: Event) => {
			const { pageUrl } = await findPaper(event);
			const formData = await event.request.formData();
			const threadIds = readThreadIds(formData);
			const change = await resolvePaperThreads(event.locals.supabase, threadIds);

			if (change.refusal !== null) return refuse(change.refusal);
			if (formData.get('background') === '1') return { threadsResolved: threadIds };

			redirect(303, atThread(pageUrl, threadIds.length === 1 ? threadIds[0] : null));
		},

		/** "Reopen" on a resolved thread. */
		reopenThread: async (event: Event) => {
			const { pageUrl } = await findPaper(event);
			const threadId = oneThreadId(await event.request.formData());
			const change = await reopenPaperThread(event.locals.supabase, threadId ?? '');

			if (change.refusal !== null) return refuse(change.refusal);

			redirect(303, atThread(pageUrl, threadId));
		}
	};
}
