import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	listPassedPapers,
	listVoteSubjects,
	readAmendmentVotes,
	readPaperDecidedAt,
	readPaperVote,
	readRoomPaperVote
} from './paper-votes';

type Answer = { data?: unknown; count?: number | null; error: { message: string } | null };

/** One query as the stand-in saw it: its table and the filters asked of it. */
type RecordedQuery = { table: string; filters: unknown[][] };

/**
 * A stand-in Supabase client answering each table with its own answer, or
 * with a list of answers in turn, which records every filter so a test can
 * see what was asked. A query is awaited, so each builder is a "thenable":
 * `await` calls its `then`.
 */
function createStandIn(answers: Record<string, Answer | Answer[]>) {
	const queries: RecordedQuery[] = [];

	const supabase = {
		from: (table: string) => {
			const query: RecordedQuery = { table, filters: [] };
			const index = queries.filter((earlier) => earlier.table === table).length;
			queries.push(query);
			const answer = answers[table];
			const record =
				(name: string) =>
				(...args: unknown[]) => {
					query.filters.push([name, ...args]);
					return builder;
				};

			const builder = {
				then: (resolve: (answer: Answer) => unknown) =>
					resolve(Array.isArray(answer) ? answer[index] : answer),
				select: record('select'),
				eq: record('eq'),
				in: record('in'),
				not: record('not'),
				order: record('order'),
				limit: record('limit'),
				maybeSingle: () => builder,
				overrideTypes: () => builder
			};

			return builder;
		}
	} as unknown as SupabaseClient;

	return { supabase, queries };
}

const DRAFT_ROW = {
	id: 'paper-1',
	kind: 'draft_resolution',
	status: 'introduced',
	title: 'Human control',
	topic_number: 1,
	sequence: 1
};

describe('listVoteSubjects', () => {
	it('lists the introduced drafts once a motion to close debate has passed', async () => {
		const { supabase, queries } = createStandIn({
			committee_papers: { data: [DRAFT_ROW], error: null },
			motions: { count: 1, error: null },
			amendments: { data: [], error: null }
		});

		expect(await listVoteSubjects(supabase, 'committee-1', 'session-1')).toEqual([
			{ id: 'paper-1', name: 'Draft resolution 1.1', title: 'Human control' }
		]);
		const motions = queries.find((query) => query.table === 'motions');
		expect(motions?.filters).toContainEqual(['eq', 'session_id', 'session-1']);
		expect(motions?.filters).toContainEqual(['eq', 'kind', 'close_debate']);
		expect(motions?.filters).toContainEqual(['eq', 'status', 'passed']);
	});

	it('lists nothing while debate is still open', async () => {
		const { supabase } = createStandIn({
			committee_papers: { data: [DRAFT_ROW], error: null },
			motions: { count: 0, error: null },
			amendments: { data: [], error: null }
		});

		expect(await listVoteSubjects(supabase, 'committee-1', 'session-1')).toEqual([]);
	});

	it('lists the approved amendments at any time, before the drafts', async () => {
		const { supabase, queries } = createStandIn({
			committee_papers: { data: [DRAFT_ROW], error: null },
			motions: { count: 1, error: null },
			amendments: {
				data: [{ id: 'amendment-2', paper_id: 'paper-1', sequence: 2, parent_amendment_id: null }],
				error: null
			}
		});

		expect(await listVoteSubjects(supabase, 'committee-1', 'session-1')).toEqual([
			{
				id: 'amendment-2',
				name: 'Amendment 2 to Draft resolution 1.1',
				title: 'Human control',
				isAmendment: true
			},
			{ id: 'paper-1', name: 'Draft resolution 1.1', title: 'Human control' }
		]);
		const amendments = queries.find((query) => query.table === 'amendments');
		expect(amendments?.filters).toContainEqual(['eq', 'paper.committee_id', 'committee-1']);
		expect(amendments?.filters).toContainEqual(['eq', 'status', 'approved']);
	});
});

describe('readAmendmentVotes', () => {
	it('reads the closed vote on each amendment, by its id', async () => {
		const { supabase, queries } = createStandIn({
			votes: {
				data: [
					{
						amendment_id: 'amendment-2',
						passed: false,
						votes_for: 12,
						votes_against: 25,
						votes_abstain: 6,
						closed_at: '2026-03-15T15:30:00Z'
					}
				],
				error: null
			}
		});

		expect(await readAmendmentVotes(supabase, ['amendment-2', 'amendment-3'])).toEqual({
			'amendment-2': {
				passed: false,
				counts: { for: 12, against: 25, abstain: 6 },
				closedAt: '2026-03-15T15:30:00Z'
			}
		});
		expect(queries[0].filters).toContainEqual([
			'in',
			'amendment_id',
			['amendment-2', 'amendment-3']
		]);
		expect(queries[0].filters).toContainEqual(['eq', 'status', 'closed']);
	});

	it('asks nothing when there are no amendments', async () => {
		const { supabase, queries } = createStandIn({});

		expect(await readAmendmentVotes(supabase, [])).toEqual({});
		expect(queries).toEqual([]);
	});
});

describe('readPaperVote', () => {
	it('reads the closed vote tied to the paper', async () => {
		const { supabase, queries } = createStandIn({
			votes: {
				data: {
					passed: true,
					votes_for: 31,
					votes_against: 6,
					votes_abstain: null,
					closed_at: '2027-03-16T16:40:00Z'
				},
				error: null
			}
		});

		expect(await readPaperVote(supabase, 'paper-1')).toEqual({
			passed: true,
			counts: { for: 31, against: 6, abstain: 0 },
			closedAt: '2027-03-16T16:40:00Z'
		});
		expect(queries[0].filters).toContainEqual(['eq', 'paper_id', 'paper-1']);
	});

	it('answers null for a paper with no closed vote', async () => {
		const { supabase } = createStandIn({ votes: { data: null, error: null } });

		expect(await readPaperVote(supabase, 'paper-1')).toBeNull();
	});
});

describe('readRoomPaperVote', () => {
	it('names the paper of the room’s vote and says whether it is open', async () => {
		const { supabase } = createStandIn({
			committee_state: { data: { current_vote_id: 'vote-1' }, error: null },
			votes: { data: { status: 'open', paper: DRAFT_ROW }, error: null }
		});

		expect(await readRoomPaperVote(supabase, 'committee-1')).toEqual({
			paper: { id: 'paper-1', name: 'Draft resolution 1.1', title: 'Human control' },
			isOpen: true
		});
	});

	it('answers null while the room has no vote, or its vote is on no paper', async () => {
		const noVote = createStandIn({
			committee_state: { data: { current_vote_id: null }, error: null }
		});
		const typed = createStandIn({
			committee_state: { data: { current_vote_id: 'vote-1' }, error: null },
			votes: { data: { status: 'open', paper: null }, error: null }
		});

		expect(await readRoomPaperVote(noVote.supabase, 'committee-1')).toBeNull();
		expect(await readRoomPaperVote(typed.supabase, 'committee-1')).toBeNull();
	});
});

describe('listPassedPapers', () => {
	it('names each passed paper as the record does, and leaves out an unanswered refusal', async () => {
		const { supabase } = createStandIn({
			committee_papers: {
				data: [
					{ ...DRAFT_ROW, status: 'passed' },
					{ ...DRAFT_ROW, id: 'paper-2', kind: 'committee_directive', status: 'carried_out' },
					// A draft resolution is never refused; were one, it would not be a resolution.
					{ ...DRAFT_ROW, id: 'paper-3', status: 'refused' }
				],
				error: null
			}
		});

		expect(await listPassedPapers(supabase, 'committee-1')).toEqual([
			{ id: 'paper-1', name: 'Resolution 1.1', title: 'Human control' },
			{ id: 'paper-2', name: 'Committee directive 1.1', title: 'Human control' }
		]);
	});

	it('throws when the papers cannot be read', async () => {
		const { supabase } = createStandIn({
			committee_papers: { data: null, error: { message: 'boom' } }
		});

		await expect(listPassedPapers(supabase, 'committee-1')).rejects.toThrow(/boom/);
	});
});

describe('readPaperDecidedAt', () => {
	it('reads when the paper was decided, or null for one never decided', async () => {
		const decided = createStandIn({
			committee_papers: { data: { decided_at: '2027-03-16T16:40:00Z' }, error: null }
		});
		const undecided = createStandIn({ committee_papers: { data: null, error: null } });

		expect(await readPaperDecidedAt(decided.supabase, 'paper-1')).toBe('2027-03-16T16:40:00Z');
		expect(decided.queries[0].filters).toContainEqual(['eq', 'id', 'paper-1']);
		expect(await readPaperDecidedAt(undecided.supabase, 'paper-1')).toBeNull();
	});
});
