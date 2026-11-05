import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	deletePaperComment,
	editPaperComment,
	markThreadNotificationsRead,
	newThreadFragment,
	readCommentBody,
	readCommentId,
	readNewThreadForm,
	readPaperThreads,
	readThreadIds,
	reopenPaperThread,
	replyToPaperThread,
	resolvePaperThreads,
	startPaperThread
} from './paper-comments';

// These tests are about how this module reads its rows and hands changes to
// the database. Who may read, start or change a thread is the database's
// decision, tested with a real database in `tests/db/paper-comments.test.ts`.

/** A database answer: rows, or an error with a Postgres code. */
type Answer = { data: unknown; error: { code: string; message: string } | null };

/** One query or function call the module sent, with each step of it. */
type RecordedCall = { name: string; steps: unknown[][] };

/**
 * A stand-in Supabase client that answers each table, each update (named
 * "update <table>") and each function with what it is handed, nothing by
 * default, recording every call.
 */
function createStandIn(answers: Record<string, Answer> = {}) {
	const calls: RecordedCall[] = [];
	const answerFor = (name: string) => answers[name] ?? { data: null, error: null };

	function rpc(name: string, parameters: unknown) {
		calls.push({ name, steps: [[parameters]] });
		return Promise.resolve(answerFor(name));
	}

	function from(table: string) {
		const call: RecordedCall = { name: table, steps: [] };
		calls.push(call);

		// Every step hands the builder back, which is what lets the module chain them.
		const step =
			(stepName: string) =>
			(...stepArguments: unknown[]) => {
				if (stepName === 'update') call.name = `update ${table}`;
				call.steps.push([stepName, ...stepArguments]);
				return builder;
			};
		const builder = {
			select: step('select'),
			update: step('update'),
			eq: step('eq'),
			in: step('in'),
			is: step('is'),
			order: step('order'),
			overrideTypes: () => Promise.resolve(answerFor(call.name)),
			// An update is awaited as it is, without `overrideTypes`.
			then: (resolve: (answer: Answer) => unknown) =>
				Promise.resolve(answerFor(call.name)).then(resolve)
		};

		return builder;
	}

	return { supabase: { rpc, from } as unknown as SupabaseClient, calls };
}

const FAILURE = { data: null, error: { code: 'XX000', message: 'down' } };
const REFUSED = {
	data: null,
	error: { code: '42501', message: 'You cannot comment on this paper.' }
};

const THREAD_ID = '6f1c2a54-0d3e-4c71-9a55-2f4f1b8e9a01';
const OTHER_THREAD_ID = '6f1c2a54-0d3e-4c71-9a55-2f4f1b8e9a02';
const COMMENT_ID = '0b7e4f2d-91a6-4f0e-8c35-7d2b6a1e5c03';

describe('readPaperThreads', () => {
	const READER = { id: 'clara', committeeId: 'disec', timeZone: 'Europe/London' };
	const NOW = new Date('2026-10-09T15:00:00Z');

	const ON_A_PASSAGE = {
		id: 't1',
		anchor_fragment: 'body',
		anchor_start: 'AQID',
		anchor_end: 'BAUG',
		quoted_text: 'no later than 2028',
		suggestion_id: null,
		resolved_at: null,
		resolved_by: null,
		created_at: '2026-10-09T14:12:00Z',
		// Out of order, as the database may send them.
		comments: [
			{
				id: 'c2',
				written_by: 'clara',
				body: 'Agreed.',
				deleted_at: null,
				created_at: '2026-10-09T14:20:00Z'
			},
			{
				id: 'c1',
				written_by: 'daniel',
				body: 'Too soon?',
				deleted_at: null,
				created_at: '2026-10-09T14:12:00Z'
			}
		]
	};

	const RESOLVED = {
		id: 't2',
		anchor_fragment: 'body',
		anchor_start: null,
		anchor_end: null,
		quoted_text: null,
		suggestion_id: null,
		resolved_at: '2026-10-09T14:30:00Z',
		resolved_by: 'clara',
		created_at: '2026-10-08T16:18:00Z',
		comments: [
			{
				id: 'c3',
				written_by: null,
				body: '',
				deleted_at: '2026-10-09T10:00:00Z',
				created_at: '2026-10-08T16:18:00Z'
			},
			{
				id: 'c4',
				written_by: 'priya',
				body: 'Numbers and dates checked.',
				deleted_at: null,
				created_at: '2026-10-09T09:00:00Z'
			}
		]
	};

	const NAMES = [
		{ id: 'clara', full_name: 'Clara Whitfield' },
		{ id: 'daniel', full_name: 'Daniel Osei' },
		{ id: 'priya', full_name: 'Priya Nair' }
	];
	const SEATS = [
		{ user_id: 'clara', name: 'France' },
		{ user_id: 'daniel', name: 'Mexico' }
	];

	function standInWithThreads(threads: unknown[]) {
		return createStandIn({
			paper_comment_threads: { data: threads, error: null },
			profiles: { data: NAMES, error: null },
			seats: { data: SEATS, error: null }
		});
	}

	it('names no seats on a position paper, whose writers sit in different committees', async () => {
		const { supabase } = standInWithThreads([ON_A_PASSAGE]);

		const threads = await readPaperThreads(
			supabase,
			{ kind: 'position', seatId: 'seat-france' },
			{ ...READER, committeeId: null },
			NOW
		);

		expect(threads[0].comments.map((comment) => comment.seatName)).toEqual([null, null]);
	});

	it('reads each thread with its comments in the order written, named and timed as the margin shows them', async () => {
		const { supabase } = standInWithThreads([ON_A_PASSAGE]);

		const threads = await readPaperThreads(
			supabase,
			{ kind: 'committee', paperId: 'paper-1' },
			READER,
			NOW
		);

		expect(threads).toEqual([
			{
				id: 't1',
				fragment: 'body',
				anchorStart: 'AQID',
				anchorEnd: 'BAUG',
				quotedText: 'no later than 2028',
				suggestionId: null,
				isResolved: false,
				resolvedByName: null,
				comments: [
					{
						id: 'c1',
						writerName: 'Daniel Osei',
						seatName: 'Mexico',
						body: 'Too soon?',
						isDeleted: false,
						writtenAt: '15:12',
						isMine: false
					},
					{
						id: 'c2',
						writerName: 'Clara Whitfield',
						seatName: 'France',
						body: 'Agreed.',
						isDeleted: false,
						writtenAt: '15:20',
						isMine: true
					}
				]
			}
		]);
	});

	it('says who resolved a thread, and keeps a deleted comment that has replies', async () => {
		const { supabase } = standInWithThreads([RESOLVED]);

		const [thread] = await readPaperThreads(
			supabase,
			{ kind: 'committee', paperId: 'paper-1' },
			READER,
			NOW
		);

		expect(thread.isResolved).toBe(true);
		expect(thread.resolvedByName).toBe('Clara Whitfield');
		expect(thread.comments.map((comment) => [comment.isDeleted, comment.writtenAt])).toEqual([
			[true, 'Thu 8 Oct, 17:18'],
			[false, '10:00']
		]);
		// Somebody whose account is gone, and somebody without a seat in the committee.
		expect(thread.comments[0].writerName).toBe('That person');
		expect(thread.comments[1].seatName).toBeNull();
	});

	it("names a member of the dais by their title on it, and a seat's holder by the seat", async () => {
		const { supabase } = createStandIn({
			paper_comment_threads: { data: [ON_A_PASSAGE], error: null },
			profiles: { data: NAMES, error: null },
			seats: { data: [{ user_id: 'clara', name: 'France' }], error: null },
			committee_chairs: {
				data: [
					{ user_id: 'daniel', title: 'Vice-chair' },
					{ user_id: 'clara', title: 'Chair' }
				],
				error: null
			}
		});

		const [thread] = await readPaperThreads(
			supabase,
			{ kind: 'committee', paperId: 'paper-1' },
			READER,
			NOW
		);

		expect(thread.comments.map((comment) => comment.seatName)).toEqual(['Vice-chair', 'France']);
	});

	it("asks for a position paper's threads by its seat, and the seats of this committee", async () => {
		const { supabase, calls } = standInWithThreads([ON_A_PASSAGE]);

		await readPaperThreads(supabase, { kind: 'position', seatId: 'seat-mexico' }, READER, NOW);

		const threadQuery = calls.find((call) => call.name === 'paper_comment_threads');
		expect(threadQuery?.steps).toContainEqual(['eq', 'position_paper_seat_id', 'seat-mexico']);
		const seatQuery = calls.find((call) => call.name === 'seats');
		expect(seatQuery?.steps).toContainEqual(['eq', 'committee_id', 'disec']);
	});

	it('asks for no names when there are no threads', async () => {
		const { supabase, calls } = standInWithThreads([]);

		expect(
			await readPaperThreads(supabase, { kind: 'committee', paperId: 'paper-1' }, READER, NOW)
		).toEqual([]);
		expect(calls.map((call) => call.name)).toEqual(['paper_comment_threads']);
	});

	it('throws when the threads cannot be read', async () => {
		const { supabase } = createStandIn({ paper_comment_threads: FAILURE });

		await expect(
			readPaperThreads(supabase, { kind: 'committee', paperId: 'paper-1' }, READER, NOW)
		).rejects.toThrow('Could not read the comments on the paper: down');
	});
});

/** A form with these fields, as the browser sends it. */
function formWith(fields: [string, string][]): FormData {
	const formData = new FormData();
	for (const [name, value] of fields) formData.append(name, value);

	return formData;
}

describe('readNewThreadForm', () => {
	it('reads a comment on the whole paper, all the plain form can send', () => {
		expect(readNewThreadForm(formWith([['body', 'Who has the figures?']]))).toEqual({
			body: 'Who has the figures?',
			anchorStart: null,
			anchorEnd: null,
			quotedText: null,
			suggestionId: null,
			part: null
		});
	});

	it('reads a comment on selected words', () => {
		const formData = formWith([
			['body', 'Too soon?'],
			['anchorStart', 'AQID'],
			['anchorEnd', 'BAUG'],
			['quotedText', 'no later than 2028'],
			['suggestionId', ''],
			['part', 'operative']
		]);

		expect(readNewThreadForm(formData)).toEqual({
			body: 'Too soon?',
			anchorStart: 'AQID',
			anchorEnd: 'BAUG',
			quotedText: 'no later than 2028',
			suggestionId: null,
			part: 'operative'
		});
	});
});

describe('newThreadFragment', () => {
	const ON_WORDS = {
		body: 'Too soon?',
		anchorStart: 'AQID',
		anchorEnd: 'BAUG',
		quotedText: 'no later than 2028',
		suggestionId: null,
		part: 'operative'
	};

	it('keeps a comment on words with the part they are in', () => {
		expect(newThreadFragment(['preamble', 'operative'], ON_WORDS)).toBe('operative');
	});

	it("keeps it on the paper's first part when the paper has no such part", () => {
		expect(newThreadFragment(['body'], ON_WORDS)).toBe('body');
		expect(newThreadFragment(['operative'], { ...ON_WORDS, part: 'preamble' })).toBe('operative');
	});

	it("keeps a comment on the whole paper on its 'body'", () => {
		const onPaper = { ...ON_WORDS, anchorStart: null, anchorEnd: null, part: null };

		expect(newThreadFragment(['preamble', 'operative'], onPaper)).toBe('body');
	});
});

describe('readCommentBody and readCommentId', () => {
	it('reads what the form says, and nothing for a field it left out', () => {
		const formData = formWith([
			['body', 'Agreed.'],
			['commentId', COMMENT_ID]
		]);

		expect(readCommentBody(formData)).toBe('Agreed.');
		expect(readCommentId(formData)).toBe(COMMENT_ID);
		expect(readCommentBody(new FormData())).toBe('');
		expect(readCommentId(new FormData())).toBe('');
	});
});

describe('readThreadIds', () => {
	it('reads every thread the form names, leaving out empty ones', () => {
		const formData = formWith([
			['threadId', THREAD_ID],
			['threadId', ''],
			['threadId', OTHER_THREAD_ID]
		]);

		expect(readThreadIds(formData)).toEqual([THREAD_ID, OTHER_THREAD_ID]);
	});
});

describe('startPaperThread', () => {
	const ON_WORDS = {
		body: 'Too soon?',
		anchorStart: 'AQID',
		anchorEnd: 'BAUG',
		quotedText: 'no later than 2028',
		suggestionId: null,
		part: null
	};

	it("starts a thread on a committee paper's words and hands back its id", async () => {
		const { supabase, calls } = createStandIn({ start_thread: { data: THREAD_ID, error: null } });

		expect(
			await startPaperThread(supabase, { kind: 'committee', paperId: 'paper-1' }, ON_WORDS)
		).toEqual({ refusal: null, threadId: THREAD_ID });
		expect(calls).toEqual([
			{
				name: 'start_thread',
				steps: [
					[
						{
							body: 'Too soon?',
							committee_paper_id: 'paper-1',
							position_paper_seat_id: null,
							anchor_fragment: 'body',
							anchor_start: 'AQID',
							anchor_end: 'BAUG',
							quoted_text: 'no later than 2028',
							suggestion_id: null
						}
					]
				]
			}
		]);
	});

	it('starts a thread on a position paper by its seat', async () => {
		const { supabase, calls } = createStandIn();

		await startPaperThread(supabase, { kind: 'position', seatId: 'seat-mexico' }, ON_WORDS);

		expect(calls[0].steps[0][0]).toMatchObject({
			committee_paper_id: null,
			position_paper_seat_id: 'seat-mexico'
		});
	});

	it("hands back the database's refusal, and throws on a fault", async () => {
		const target = { kind: 'committee', paperId: 'paper-1' } as const;

		expect(
			await startPaperThread(createStandIn({ start_thread: REFUSED }).supabase, target, ON_WORDS)
		).toEqual({ refusal: 'You cannot comment on this paper.', threadId: null });
		await expect(
			startPaperThread(createStandIn({ start_thread: FAILURE }).supabase, target, ON_WORDS)
		).rejects.toThrow('Could not start the thread: down');
	});
});

describe('replyToPaperThread', () => {
	it('answers the thread', async () => {
		const { supabase, calls } = createStandIn();

		expect(await replyToPaperThread(supabase, THREAD_ID, 'Agreed.')).toEqual({ refusal: null });
		expect(calls).toEqual([
			{ name: 'reply_to_thread', steps: [[{ thread_id: THREAD_ID, body: 'Agreed.' }]] }
		]);
	});

	it('refuses a thread that is not an id without asking the database', async () => {
		const { supabase, calls } = createStandIn();

		expect(await replyToPaperThread(supabase, 'not-an-id', 'Agreed.')).toEqual({
			refusal: 'That comment does not exist.'
		});
		expect(calls).toEqual([]);
	});
});

describe('editPaperComment and deletePaperComment', () => {
	it("changes and deletes the reader's own comment", async () => {
		const { supabase, calls } = createStandIn();

		await editPaperComment(supabase, COMMENT_ID, 'Agreed, with 2030.');
		await deletePaperComment(supabase, COMMENT_ID);

		expect(calls).toEqual([
			{ name: 'edit_comment', steps: [[{ comment_id: COMMENT_ID, body: 'Agreed, with 2030.' }]] },
			{ name: 'delete_comment', steps: [[{ comment_id: COMMENT_ID }]] }
		]);
	});

	it("hands back the database's refusal", async () => {
		const notTheirs = {
			data: null,
			error: { code: '42501', message: 'Only the person who wrote a comment can change it.' }
		};
		const { supabase } = createStandIn({ edit_comment: notTheirs });

		expect(await editPaperComment(supabase, COMMENT_ID, 'Mine now.')).toEqual({
			refusal: 'Only the person who wrote a comment can change it.'
		});
	});
});

describe('resolvePaperThreads', () => {
	it('resolves each thread in turn', async () => {
		const { supabase, calls } = createStandIn();

		expect(await resolvePaperThreads(supabase, [THREAD_ID, OTHER_THREAD_ID])).toEqual({
			refusal: null
		});
		expect(calls.map((call) => call.steps[0][0])).toEqual([
			{ thread_id: THREAD_ID },
			{ thread_id: OTHER_THREAD_ID }
		]);
	});

	it('stops at the first refusal', async () => {
		const closed = {
			data: null,
			error: { code: '22023', message: 'Comments on this paper are closed.' }
		};
		const { supabase, calls } = createStandIn({ resolve_thread: closed });

		expect(await resolvePaperThreads(supabase, [THREAD_ID, OTHER_THREAD_ID])).toEqual({
			refusal: 'Comments on this paper are closed.'
		});
		expect(calls).toHaveLength(1);
	});

	it('refuses a form that names no thread', async () => {
		const { supabase } = createStandIn();

		expect(await resolvePaperThreads(supabase, [])).toEqual({
			refusal: 'That comment does not exist.'
		});
	});
});

describe('reopenPaperThread', () => {
	it('opens the thread again', async () => {
		const { supabase, calls } = createStandIn();

		expect(await reopenPaperThread(supabase, THREAD_ID)).toEqual({ refusal: null });
		expect(calls).toEqual([{ name: 'reopen_thread', steps: [[{ thread_id: THREAD_ID }]] }]);
	});
});

describe('markThreadNotificationsRead', () => {
	const UNREAD = [
		{ id: 'n1', link_path: `/conferences/a/committees/b/resolutions/p#thread-${THREAD_ID}` },
		{ id: 'n2', link_path: '/conferences/a/committees/b/resolutions/p#thread-another' },
		{ id: 'n3', link_path: null }
	];

	it("marks read the reader's unread notifications that link to these threads, and no others", async () => {
		const { supabase, calls } = createStandIn({ notifications: { data: UNREAD, error: null } });

		await markThreadNotificationsRead(supabase, 'clara', [THREAD_ID]);

		expect(calls[0].steps).toContainEqual(['eq', 'user_id', 'clara']);
		expect(calls[0].steps).toContainEqual(['is', 'read_at', null]);
		expect(calls[1].name).toBe('update notifications');
		expect(calls[1].steps).toContainEqual(['in', 'id', ['n1']]);
		expect(calls[1].steps).toContainEqual(['is', 'read_at', null]);
	});

	it('changes nothing when none link to these threads', async () => {
		const { supabase, calls } = createStandIn({ notifications: { data: UNREAD, error: null } });

		await markThreadNotificationsRead(supabase, 'clara', [OTHER_THREAD_ID]);

		expect(calls.map((call) => call.name)).toEqual(['notifications']);
	});

	it('asks nothing for a paper without threads', async () => {
		const { supabase, calls } = createStandIn();

		await markThreadNotificationsRead(supabase, 'clara', []);

		expect(calls).toEqual([]);
	});

	it('throws when the notifications cannot be read or marked', async () => {
		await expect(
			markThreadNotificationsRead(createStandIn({ notifications: FAILURE }).supabase, 'clara', [
				THREAD_ID
			])
		).rejects.toThrow('Could not read the notifications about comments: down');
		await expect(
			markThreadNotificationsRead(
				createStandIn({
					notifications: { data: UNREAD, error: null },
					'update notifications': FAILURE
				}).supabase,
				'clara',
				[THREAD_ID]
			)
		).rejects.toThrow('Could not mark the notifications as read: down');
	});
});
