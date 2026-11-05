/**
 * Comment threads on a paper (`docs/committee-papers.md`, section 4): reading
 * a paper's threads for its margin, and starting, answering, changing,
 * deleting, resolving and reopening them.
 *
 * Each change goes through the database's own function (`start_thread` and
 * the ones beside it), which checks who may do it. A refused one answers with
 * the function's own sentence, such as "Comments on this paper are closed.",
 * which the page shows as it is, so the rule and its wording live in one
 * place. Which threads a reader sees at all is Row Level Security's decision
 * (`may_read_thread`).
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	commentTimeText,
	type PaperComment,
	type PaperCommentTarget,
	type PaperFragment,
	type PaperThread
} from '$lib/paper-comments';
import { UNKNOWN_MEMBER_NAME } from '$lib/server/delegations';

/**
 * Who is reading: their id says which comments are theirs, their committee
 * which seat names to show, and the conference's timezone what time it was.
 */
/**
 * Who reads the threads. `committeeId` names the seats the comments are
 * written from; a position paper's delegation sits in different committees,
 * so it has none and its comments carry only their writers' names.
 */
export type ThreadReader = { id: string; committeeId: string | null; timeZone: string };

type CommentRow = {
	id: string;
	written_by: string | null;
	body: string;
	deleted_at: string | null;
	created_at: string;
};

type ThreadRow = {
	id: string;
	anchor_fragment: PaperFragment;
	anchor_start: string | null;
	anchor_end: string | null;
	quoted_text: string | null;
	suggestion_id: string | null;
	resolved_at: string | null;
	resolved_by: string | null;
	comments: CommentRow[];
};

/** The column a target's threads are found by. */
function targetColumn(target: PaperCommentTarget): [string, string] {
	return target.kind === 'committee'
		? ['committee_paper_id', target.paperId]
		: ['position_paper_seat_id', target.seatId];
}

/** Each person's full name by their id. Anybody signed in may read every profile. */
async function readNames(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<Map<string, string>> {
	if (userIds.length === 0) return new Map();

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name')
		.in('id', userIds)
		.overrideTypes<{ id: string; full_name: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the names of the people commenting: ${error.message}`);
	}

	return new Map((data ?? []).map((row) => [row.id, row.full_name]));
}

/**
 * The seat each person holds in the committee, such as "Mexico", by their id,
 * or for a member of the dais their title on it, such as "Vice-chair": the
 * authors read the dais's notes under the dais's own names.
 */
async function readSeatNames(
	supabase: SupabaseClient,
	committeeId: string | null,
	userIds: string[]
): Promise<Map<string, string>> {
	if (userIds.length === 0 || committeeId === null) return new Map();

	const [seats, chairs] = await Promise.all([
		supabase
			.from('seats')
			.select('user_id, name')
			.eq('committee_id', committeeId)
			.in('user_id', userIds)
			.overrideTypes<{ user_id: string; name: string }[], { merge: false }>(),
		supabase
			.from('committee_chairs')
			.select('user_id, title')
			.eq('committee_id', committeeId)
			.in('user_id', userIds)
			.overrideTypes<{ user_id: string; title: string }[], { merge: false }>()
	]);

	if (seats.error) {
		throw new Error(`Could not read the seats of the people commenting: ${seats.error.message}`);
	}

	if (chairs.error) {
		throw new Error(`Could not read the dais of the people commenting: ${chairs.error.message}`);
	}

	// A seat comes second, so somebody who is both is named by the seat they write for.
	return new Map([
		...(chairs.data ?? []).map((row): [string, string] => [row.user_id, row.title]),
		...(seats.data ?? []).map((row): [string, string] => [row.user_id, row.name])
	]);
}

/**
 * Every thread on a paper the reader may see, in the order they were started,
 * each with its comments in the order written.
 */
export async function readPaperThreads(
	supabase: SupabaseClient,
	target: PaperCommentTarget,
	reader: ThreadReader,
	now = new Date()
): Promise<PaperThread[]> {
	const [column, value] = targetColumn(target);
	const { data, error } = await supabase
		.from('paper_comment_threads')
		// `comments:paper_comments(…)` brings each thread's comments along under the name `comments`.
		.select(
			'id, anchor_fragment, anchor_start, anchor_end, quoted_text, suggestion_id, resolved_at, resolved_by, created_at, comments:paper_comments(id, written_by, body, deleted_at, created_at)'
		)
		.eq(column, value)
		.order('created_at')
		.overrideTypes<ThreadRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the comments on the paper: ${error.message}`);
	}

	// A thread whose last comment was deleted is deleted with it, so every thread has one.
	const rows = (data ?? []).filter((row) => row.comments.length > 0);
	const writerIds = rows.flatMap((row) =>
		row.comments.flatMap((comment) => (comment.written_by ? [comment.written_by] : []))
	);
	const resolverIds = rows.flatMap((row) => (row.resolved_by ? [row.resolved_by] : []));
	const [names, seatNames] = await Promise.all([
		readNames(supabase, [...new Set([...writerIds, ...resolverIds])]),
		readSeatNames(supabase, reader.committeeId, [...new Set(writerIds)])
	]);
	const nameOf = (userId: string | null) =>
		(userId ? names.get(userId) : undefined) ?? UNKNOWN_MEMBER_NAME;

	function toComment(row: CommentRow): PaperComment {
		return {
			id: row.id,
			writerName: nameOf(row.written_by),
			seatName: row.written_by ? (seatNames.get(row.written_by) ?? null) : null,
			body: row.body,
			isDeleted: row.deleted_at !== null,
			writtenAt: commentTimeText(row.created_at, now, reader.timeZone),
			isMine: row.written_by !== null && row.written_by === reader.id
		};
	}

	return rows.map((row) => ({
		id: row.id,
		fragment: row.anchor_fragment,
		anchorStart: row.anchor_start,
		anchorEnd: row.anchor_end,
		quotedText: row.quoted_text,
		suggestionId: row.suggestion_id,
		isResolved: row.resolved_at !== null,
		resolvedByName: row.resolved_at === null ? null : nameOf(row.resolved_by),
		// Two comments can share a moment; their ids keep them in one order every time.
		comments: [...row.comments]
			.sort(
				(first, second) =>
					first.created_at.localeCompare(second.created_at) || first.id.localeCompare(second.id)
			)
			.map(toComment)
	}));
}

/** A text field of a form, `null` when it is missing or empty. */
function optionalField(formData: FormData, name: string): string | null {
	const value = formData.get(name);

	return typeof value === 'string' && value !== '' ? value : null;
}

/** A new thread as the "Comment" form sends it. */
export type NewThread = {
	body: string;
	/** Where its words start and end in the paper, both `null` for a comment on the whole paper. */
	anchorStart: string | null;
	anchorEnd: string | null;
	quotedText: string | null;
	/** The suggestion it is about, by the id of the suggestion's marks. */
	suggestionId: string | null;
	/** The part of a draft resolution its words start in, as the editor said. */
	part: string | null;
};

/** The new thread a "Comment" form sent. Without JavaScript it has only a body. */
export function readNewThreadForm(formData: FormData): NewThread {
	return {
		body: readCommentBody(formData),
		anchorStart: optionalField(formData, 'anchorStart'),
		anchorEnd: optionalField(formData, 'anchorEnd'),
		quotedText: optionalField(formData, 'quotedText'),
		suggestionId: optionalField(formData, 'suggestionId'),
		part: optionalField(formData, 'part')
	};
}

/**
 * Which part of the paper a new thread is kept with. A comment on the whole
 * paper is on its 'body'; one on some words is on the part the editor said
 * they are in, when the paper has that part, and otherwise on its first.
 */
export function newThreadFragment(
	parts: readonly PaperFragment[],
	thread: NewThread
): PaperFragment {
	if (thread.anchorStart === null) return 'body';

	return parts.find((part) => part === thread.part) ?? parts[0] ?? 'body';
}

/** What a comment form says. The database trims it and checks it is written. */
export function readCommentBody(formData: FormData): string {
	return optionalField(formData, 'body') ?? '';
}

/** The comment a form is about, `''` when it names none, which the database treats as none. */
export function readCommentId(formData: FormData): string {
	return optionalField(formData, 'commentId') ?? '';
}

/**
 * The threads a form is about. Deciding a suggestion resolves its thread with
 * it, and "Accept all" resolves every one of theirs at once, so there can be several.
 */
export function readThreadIds(formData: FormData): string[] {
	return formData
		.getAll('threadId')
		.filter((value): value is string => typeof value === 'string' && value !== '');
}

/**
 * The codes the comment functions refuse with, each carrying a sentence for
 * the reader: not theirs to do (42501), not now or not that (22023), and no
 * such comment (P0002). Anything else is a fault, not a refusal.
 */
const REFUSAL_CODES = new Set(['42501', '22023', 'P0002']);

/** A uuid, so a form naming something else is refused here rather than failing in the database. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The database's answer when a form names no comment or thread it knows. */
const NO_SUCH_COMMENT = 'That comment does not exist.';

/** What a change came to: `refusal` is `null` once it is done, or the sentence that says why not. */
export type CommentChange = { refusal: string | null };

/** The change, or the sentence it was refused with. Throws on a fault. */
function toChange(error: { code: string; message: string } | null, failure: string): CommentChange {
	if (error === null) return { refusal: null };

	if (REFUSAL_CODES.has(error.code)) return { refusal: error.message };

	throw new Error(`${failure}: ${error.message}`);
}

/** A thread just started: its id, for the page to scroll to, or the sentence it was refused with. */
export type StartedThread = CommentChange & { threadId: string | null };

/**
 * Start a thread on the paper with its first comment. `fragment` is the part
 * of the paper its words are in; a working paper and a position paper have
 * only their body.
 */
export async function startPaperThread(
	supabase: SupabaseClient,
	target: PaperCommentTarget,
	thread: NewThread,
	fragment: PaperFragment = 'body'
): Promise<StartedThread> {
	const { data, error } = await supabase.rpc('start_thread', {
		body: thread.body,
		committee_paper_id: target.kind === 'committee' ? target.paperId : null,
		position_paper_seat_id: target.kind === 'position' ? target.seatId : null,
		anchor_fragment: fragment,
		anchor_start: thread.anchorStart,
		anchor_end: thread.anchorEnd,
		quoted_text: thread.quotedText,
		suggestion_id: thread.suggestionId
	});
	const change = toChange(error, 'Could not start the thread');

	// The function answers with the new thread's id.
	return { ...change, threadId: change.refusal === null && typeof data === 'string' ? data : null };
}

/** Answer a thread, which opens it again if it was resolved. */
export async function replyToPaperThread(
	supabase: SupabaseClient,
	threadId: string,
	body: string
): Promise<CommentChange> {
	if (!UUID.test(threadId)) return { refusal: NO_SUCH_COMMENT };

	const { error } = await supabase.rpc('reply_to_thread', { thread_id: threadId, body });

	return toChange(error, 'Could not answer the thread');
}

/** Change the words of the reader's own comment. */
export async function editPaperComment(
	supabase: SupabaseClient,
	commentId: string,
	body: string
): Promise<CommentChange> {
	if (!UUID.test(commentId)) return { refusal: NO_SUCH_COMMENT };

	const { error } = await supabase.rpc('edit_comment', { comment_id: commentId, body });

	return toChange(error, 'Could not change the comment');
}

/**
 * Delete the reader's own comment. A thread's opening comment with replies
 * stays as "Comment deleted"; a thread left with no comment goes with it.
 */
export async function deletePaperComment(
	supabase: SupabaseClient,
	commentId: string
): Promise<CommentChange> {
	if (!UUID.test(commentId)) return { refusal: NO_SUCH_COMMENT };

	const { error } = await supabase.rpc('delete_comment', { comment_id: commentId });

	return toChange(error, 'Could not delete the comment');
}

/**
 * Resolve threads, one after another, stopping at the first refusal. One
 * that is resolved already keeps who resolved it first.
 */
export async function resolvePaperThreads(
	supabase: SupabaseClient,
	threadIds: string[]
): Promise<CommentChange> {
	if (threadIds.length === 0 || !threadIds.every((threadId) => UUID.test(threadId))) {
		return { refusal: NO_SUCH_COMMENT };
	}

	for (const threadId of threadIds) {
		const { error } = await supabase.rpc('resolve_thread', { thread_id: threadId });
		const change = toChange(error, 'Could not resolve the thread');
		if (change.refusal !== null) return change;
	}

	return { refusal: null };
}

/** Open a resolved thread again. */
export async function reopenPaperThread(
	supabase: SupabaseClient,
	threadId: string
): Promise<CommentChange> {
	if (!UUID.test(threadId)) return { refusal: NO_SUCH_COMMENT };

	const { error } = await supabase.rpc('reopen_thread', { thread_id: threadId });

	return toChange(error, 'Could not reopen the thread');
}

/** The notifications a comment sends, which link to its thread. */
const COMMENT_NOTIFICATION_KINDS = ['paper_comment_thread', 'paper_comment_reply'];

/**
 * Mark read the reader's notifications about these threads. The page that
 * shows a thread calls this, so a writer with the paper open is not told
 * about a comment they can see arriving (section 4, "Notifications"): a
 * notification links to `…#thread-<id>`, which is how it is found. The bell is
 * counted by the layout at the same time as this runs, so it stops counting
 * them from the next page on rather than on this one.
 */
export async function markThreadNotificationsRead(
	supabase: SupabaseClient,
	userId: string,
	threadIds: string[]
): Promise<void> {
	if (threadIds.length === 0) return;

	const { data, error } = await supabase
		.from('notifications')
		.select('id, link_path')
		.eq('user_id', userId)
		.in('kind', COMMENT_NOTIFICATION_KINDS)
		.is('read_at', null)
		.overrideTypes<{ id: string; link_path: string | null }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the notifications about comments: ${error.message}`);
	}

	const threadEnds = threadIds.map((threadId) => `#thread-${threadId}`);
	const readIds = (data ?? [])
		.filter((row) => threadEnds.some((end) => row.link_path?.endsWith(end)))
		.map((row) => row.id);
	if (readIds.length === 0) return;

	// `is('read_at', null)` leaves one read in the meantime as it was.
	const { error: updateError } = await supabase
		.from('notifications')
		.update({ read_at: new Date().toISOString() })
		.in('id', readIds)
		.is('read_at', null);

	if (updateError) {
		throw new Error(`Could not mark the notifications as read: ${updateError.message}`);
	}
}
