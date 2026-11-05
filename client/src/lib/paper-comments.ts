/*
	Comment threads on a paper's text (docs/committee-papers.md, section 4,
	"Comments and suggestions"): what the margin shows of a thread, and the
	words it uses. A thread is on a stretch of text somebody selected, on a
	suggestion, or on the whole paper; replies sit under the comment that
	opened it, one level deep.

	The database decides who may read, start, answer, resolve, edit or delete
	a thread (`start_thread` and the functions beside it in the migration), and
	`$lib/server/paper-comments.ts` asks it. This file is safe in the browser:
	it only reads and words what the server sent.
*/

import type { ResolvedPathname } from '$app/types';
import { dayInTimezone, formatTimeOfDay, formatWeekdayAndTime } from '$lib/dates';
import { quoteForCard } from '$lib/paper-suggestions';

/** The longest comment, the same limit as the database's check. */
export const PAPER_COMMENT_MAX_LENGTH = 2000;

/** The paper a thread is on: a committee's paper by its id, or a position paper by its seat. */
export type PaperCommentTarget =
	{ kind: 'committee'; paperId: string } | { kind: 'position'; seatId: string };

/**
 * The part of a paper a thread's words are in. A paper written as one text has
 * only its body; a draft resolution's preamble and operative clauses become
 * parts of their own once the editor writes them apart.
 */
export type PaperFragment = 'body' | 'preamble' | 'operative';

/** One comment of a thread, as the margin draws it. */
export type PaperComment = {
	id: string;
	/** The writer's full name. */
	writerName: string;
	/** The writer's seat in the committee, such as "Mexico"; `null` for somebody without one. */
	seatName: string | null;
	/** What they wrote, plain text; empty once it is deleted. */
	body: string;
	/** Deleted while the thread had replies, so it stays as "Comment deleted". */
	isDeleted: boolean;
	/** When it was written, as the margin says it: "16:12", or "Thu 8 Oct, 16:12" on another day. */
	writtenAt: string;
	/** Whether the reader wrote it, and so may change or delete it. */
	isMine: boolean;
};

/** One thread, with its comments. */
export type PaperThread = {
	id: string;
	fragment: PaperFragment;
	/**
	 * Where its words start and end, as Yjs positions the editor encoded
	 * (`$lib/paper-threads.ts`), which keep pointing at the same words however
	 * the text around them changes. A thread on a suggestion has the
	 * suggestion's words. Both `null` for a thread on the whole paper.
	 */
	anchorStart: string | null;
	anchorEnd: string | null;
	/** The words it was started on, shown once they are deleted from the paper. */
	quotedText: string | null;
	/** The suggestion it argues about, by the id of the suggestion's marks, or `null`. */
	suggestionId: string | null;
	isResolved: boolean;
	/** Who resolved it, `null` while it is open. */
	resolvedByName: string | null;
	/** Its comments in the order written, the one that opened it first. */
	comments: PaperComment[];
};

/** A piece of a comment's text: words, or a link written into them. */
export type CommentBodyPart = { kind: 'text'; text: string } | { kind: 'link'; href: string };

/** Web addresses written into a comment. Only `http` and `https`, so no link runs a script. */
const WEB_ADDRESS = /https?:\/\/[^\s<>"]+/g;

/** How many times `character` is in `text`. */
function countOf(text: string, character: string): number {
	return text.split(character).length - 1;
}

/**
 * An address without the punctuation that ends the sentence around it. A
 * closing bracket stays when the address opened one, as Wikipedia's do.
 */
function withoutSentenceEnd(address: string): string {
	let trimmed = address.replace(/[.,;:!?'"’”]+$/, '');

	while (trimmed.endsWith(')') && countOf(trimmed, ')') > countOf(trimmed, '(')) {
		trimmed = trimmed.slice(0, -1).replace(/[.,;:!?'"’”]+$/, '');
	}

	return trimmed;
}

/**
 * A comment's text cut into words and links, so the margin shows the links
 * as links and everything else as plain text: a comment is never HTML.
 */
export function commentBodyParts(body: string): CommentBodyPart[] {
	const parts: CommentBodyPart[] = [];
	let textStart = 0;

	for (const match of body.matchAll(WEB_ADDRESS)) {
		const href = withoutSentenceEnd(match[0]);
		// An address that is nothing but its scheme, such as "https://.", is not a link.
		if (href.length <= 'https://'.length) continue;

		if (match.index > textStart) {
			parts.push({ kind: 'text', text: body.slice(textStart, match.index) });
		}
		parts.push({ kind: 'link', href });
		textStart = match.index + href.length;
	}

	if (textStart < body.length) parts.push({ kind: 'text', text: body.slice(textStart) });

	return parts;
}

/**
 * When a comment or a suggestion was made, the way a chair says it: the time
 * alone on the day it was made, and the weekday and date before it on any
 * other, all in the conference's timezone.
 */
export function commentTimeText(moment: string, now: Date, timeZone: string): string {
	const isSameDay = dayInTimezone(new Date(moment), timeZone) === dayInTimezone(now, timeZone);

	return isSameDay ? formatTimeOfDay(moment, timeZone) : formatWeekdayAndTime(moment, timeZone);
}

/** The words a thread is on, quoted as the margin quotes them: ‘Decides to remain…’. */
export function quotedText(quoted: string): string {
	return `‘${quoteForCard(quoted)}’`;
}

/**
 * What a thread is on, for a phone, where its card sits under the paper and
 * not beside its words: "On ‘no later than 2028’".
 */
export function quotedTextOn(quoted: string): string {
	return `On ${quotedText(quoted)}`;
}

/** "1 suggestion to decide" or "4 suggestions to decide". */
export function openSuggestionsText(count: number): string {
	return count === 1 ? '1 suggestion to decide' : `${count} suggestions to decide`;
}

/**
 * Why the paper cannot be saved without JavaScript while suggestions are open:
 * the plain box holds the agreed text, and saving it would throw them away.
 */
export function plainFormSuggestionsMessage(count: number): string {
	if (count === 1) {
		return '1 suggestion is still to be decided, which needs JavaScript. Until it is, the paper cannot be saved here: saving would throw it away.';
	}

	return `${count} suggestions are still to be decided, which needs JavaScript. Until they are, the paper cannot be saved here: saving would throw them away.`;
}

/** What a paper's margin is handed by its page: the threads from `load`, and where they post back to. */
export type MarginComments = {
	threads: PaperThread[];
	/** The page the paper is written on, which every comment form comes back to. */
	paperUrl: ResolvedPathname;
	/** The conference's timezone, for the time a suggestion was made. */
	timeZone: string;
	/** The comment `?editComment=` opens, or `null`. */
	editingCommentId: string | null;
};

/** One of the reader's comments, opened by the page's address to be changed or deleted. */
export type AddressedComment = {
	action: 'edit' | 'delete';
	threadId: string;
	comment: PaperComment;
};

/**
 * The comment `?editComment=<id>` or `?deleteComment=<id>` opens, so that both work
 * without JavaScript. Only the reader's own comment, and not one already
 * deleted, can be opened; any other address opens nothing.
 */
export function addressedComment(
	searchParams: URLSearchParams,
	threads: PaperThread[]
): AddressedComment | null {
	const editId = searchParams.get('editComment');
	const deleteId = searchParams.get('deleteComment');
	const action = editId !== null ? 'edit' : 'delete';
	const commentId = editId ?? deleteId;

	if (commentId === null) return null;

	for (const thread of threads) {
		const comment = thread.comments.find((one) => one.id === commentId);

		if (comment === undefined) continue;
		if (!comment.isMine || comment.isDeleted) return null;

		return { action, threadId: thread.id, comment };
	}

	return null;
}
