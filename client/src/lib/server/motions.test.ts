import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decideMotion, dropMotions, listMotions, proposeMotion, restoreMotions } from './motions';

// Nothing here talks to a database. The stand-in client below writes down the
// one query each function makes and answers with fixed rows. Row Level Security
// is tested in `tests/db/`, and the whole page runs against a real database in
// `tests/e2e/motions.spec.ts`.

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { message: string } | null };

/** What the query asked for. */
type RecordedQuery = {
	table: string;
	eq: [string, unknown][];
	/** The `in` filter, a column and the values it may hold. */
	inList: [string, unknown[]] | null;
	inserted: Record<string, unknown> | null;
	updated: Record<string, unknown> | null;
};

/** One step of a query. Every step hands the builder back, and awaiting it gives the answer. */
type QueryBuilder = {
	then: (resolve: (answer: Answer) => void) => void;
	select: () => QueryBuilder;
	insert: (row: Record<string, unknown>) => QueryBuilder;
	update: (columns: Record<string, unknown>) => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	order: () => QueryBuilder;
	overrideTypes: () => QueryBuilder;
};

/** A stand-in Supabase client whose every query answers `answer`. */
function createStandIn(answer: Answer) {
	const record: RecordedQuery = { table: '', eq: [], inList: null, inserted: null, updated: null };

	const builder: QueryBuilder = {
		then: (resolve) => resolve(answer),
		select: () => builder,
		insert: (row) => {
			record.inserted = row;
			return builder;
		},
		update: (columns) => {
			record.updated = columns;
			return builder;
		},
		eq: (column, value) => {
			record.eq.push([column, value]);
			return builder;
		},
		in: (column, values) => {
			record.inList = [column, values];
			return builder;
		},
		order: () => builder,
		overrideTypes: () => builder
	};

	const supabase = {
		from: (table: string) => {
			record.table = table;
			return builder;
		}
	} as unknown as SupabaseClient;

	return { supabase, record };
}

const NOW = new Date('2026-01-01T10:00:00.000Z');

describe('listMotions', () => {
	it("reads a session's motions with the seat that raised each", async () => {
		const { supabase, record } = createStandIn({
			data: [
				{
					id: 'motion-1',
					kind: 'moderated_caucus',
					status: 'proposed',
					topic: 'Climate finance',
					total_time_seconds: 600,
					speaking_time_seconds: 60,
					votes_for: null,
					votes_against: null,
					decided_at: null,
					created_at: '2026-01-01T09:00:00.000Z',
					started_without_vote: false,
					proposer: { id: 'seat-br', name: 'Brazil', country_code: 'BR' }
				},
				{
					id: 'motion-2',
					kind: 'suspend_meeting',
					status: 'failed',
					topic: null,
					total_time_seconds: null,
					speaking_time_seconds: null,
					votes_for: 4,
					votes_against: 10,
					decided_at: '2026-01-01T09:30:00.000Z',
					created_at: '2026-01-01T09:05:00.000Z',
					started_without_vote: true,
					proposer: null
				}
			],
			error: null
		});

		const motions = await listMotions(supabase, 'session-1');

		expect(record.table).toBe('motions');
		expect(record.eq).toEqual([['session_id', 'session-1']]);
		expect(motions[0].proposedBy).toEqual({ id: 'seat-br', name: 'Brazil', countryCode: 'BR' });
		expect(motions[0].totalTimeSeconds).toBe(600);
		expect(motions[0].startedWithoutVote).toBe(false);
		expect(motions[1]).toMatchObject({
			proposedBy: null,
			votesFor: 4,
			votesAgainst: 10,
			startedWithoutVote: true
		});
	});

	it('throws when the query fails', async () => {
		const { supabase } = createStandIn({ data: null, error: { message: 'down' } });

		await expect(listMotions(supabase, 'session-1')).rejects.toThrow('down');
	});
});

describe('proposeMotion', () => {
	it('writes the motion on the floor of the session', async () => {
		const { supabase, record } = createStandIn({ data: null, error: null });

		await proposeMotion(supabase, 'committee-1', 'session-1', {
			kind: 'unmoderated_caucus',
			proposedBySeatId: null,
			topic: null,
			totalTimeSeconds: 300,
			speakingTimeSeconds: null,
			paperId: null
		});

		expect(record.inserted).toEqual({
			committee_id: 'committee-1',
			session_id: 'session-1',
			proposed_by_seat_id: null,
			kind: 'unmoderated_caucus',
			topic: null,
			total_time_seconds: 300,
			speaking_time_seconds: null,
			paper_id: null,
			status: 'proposed'
		});
	});

	it('names the approved paper a motion to introduce a document introduces', async () => {
		const { supabase, record } = createStandIn({ data: null, error: null });

		await proposeMotion(supabase, 'committee-1', 'session-1', {
			kind: 'introduce_document',
			proposedBySeatId: 'seat-france',
			topic: 'Working paper 1.1',
			totalTimeSeconds: null,
			speakingTimeSeconds: null,
			paperId: 'paper-1'
		});

		expect(record.inserted).toMatchObject({ topic: 'Working paper 1.1', paper_id: 'paper-1' });
	});

	it('saves it under the id the browser chose, so the row shown and the row saved are the same', async () => {
		const { supabase, record } = createStandIn({ data: null, error: null });

		await proposeMotion(
			supabase,
			'committee-1',
			'session-1',
			{
				kind: 'unmoderated_caucus',
				proposedBySeatId: null,
				topic: null,
				totalTimeSeconds: 300,
				speakingTimeSeconds: null,
				paperId: null
			},
			'motion-chosen'
		);

		expect(record.inserted).toMatchObject({ id: 'motion-chosen' });
	});
});

describe('decideMotion', () => {
	it('decides only a motion still on the floor, and says whether it did', async () => {
		const decided = createStandIn({ data: [{ id: 'motion-1' }], error: null });
		const decision = { status: 'passed' as const, votesFor: 9, votesAgainst: 5 };

		expect(await decideMotion(decided.supabase, 'motion-1', decision, NOW)).toBe(true);
		expect(decided.record.updated).toEqual({
			status: 'passed',
			votes_for: 9,
			votes_against: 5,
			decided_at: NOW.toISOString()
		});
		expect(decided.record.eq).toEqual([
			['id', 'motion-1'],
			['status', 'proposed']
		]);

		const alreadyDecided = createStandIn({ data: [], error: null });

		expect(await decideMotion(alreadyDecided.supabase, 'motion-1', decision, NOW)).toBe(false);
	});
});

describe('dropMotions', () => {
	it('drops every motion of the session still on the floor and answers their ids', async () => {
		const { supabase, record } = createStandIn({
			data: [{ id: 'motion-1' }, { id: 'motion-2' }],
			error: null
		});

		expect(await dropMotions(supabase, 'session-1', NOW)).toEqual(['motion-1', 'motion-2']);
		expect(record.updated).toEqual({ status: 'dropped', decided_at: NOW.toISOString() });
		expect(record.eq).toEqual([
			['session_id', 'session-1'],
			['status', 'proposed']
		]);
	});

	it('throws when the update fails', async () => {
		const { supabase } = createStandIn({ data: null, error: { message: 'down' } });

		await expect(dropMotions(supabase, 'session-1', NOW)).rejects.toThrow('down');
	});
});

describe('restoreMotions', () => {
	it('puts the dropped motions of the session back on the floor and counts them', async () => {
		const { supabase, record } = createStandIn({
			data: [{ id: 'motion-1' }, { id: 'motion-2' }],
			error: null
		});

		expect(await restoreMotions(supabase, 'session-1', ['motion-1', 'motion-2'])).toBe(2);
		expect(record.updated).toEqual({ status: 'proposed', decided_at: null });
		expect(record.eq).toEqual([
			['session_id', 'session-1'],
			['status', 'dropped']
		]);
		expect(record.inList).toEqual(['id', ['motion-1', 'motion-2']]);
	});

	it('throws when the update fails', async () => {
		const { supabase } = createStandIn({ data: null, error: { message: 'down' } });

		await expect(restoreMotions(supabase, 'session-1', ['motion-1'])).rejects.toThrow('down');
	});
});
