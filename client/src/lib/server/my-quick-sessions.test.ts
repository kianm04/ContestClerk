import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listMyQuickSessions, type QuickSessionCommittee } from './my-quick-sessions';

// What `listMyQuickSessions` asks the database and what it makes of the
// answer. The stand-in client writes down every step of the one query and
// answers it with the rows a test gives. Whether a quick session's chair may
// read its committee and sessions is Row Level Security's, tested in
// `tests/db/quick-sessions.test.ts`.

/** Every step of the query, in the order the reader called them. */
type RecordedSteps = {
	tables: string[];
	selects: string[];
	in: [string, unknown[]][];
	order: [string, unknown][];
	limit: [number, unknown][];
};

/** A client that answers every query with `rows`, or fails with `failure`. */
function createStandInSupabase(rows: unknown[], failure: string | null = null) {
	const steps: RecordedSteps = { tables: [], selects: [], in: [], order: [], limit: [] };

	const builder = {
		select: (columns: string) => {
			steps.selects.push(columns);
			return builder;
		},
		in: (column: string, values: unknown[]) => {
			steps.in.push([column, values]);
			return builder;
		},
		order: (column: string, options: unknown) => {
			steps.order.push([column, options]);
			return builder;
		},
		limit: (count: number, options: unknown) => {
			steps.limit.push([count, options]);
			return builder;
		},
		overrideTypes: async () =>
			failure === null ? { data: rows, error: null } : { data: null, error: { message: failure } }
	};

	const supabase = {
		from: (table: string) => {
			steps.tables.push(table);
			return builder;
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, steps };
}

/** A quick session's committee as the home dashboard hands it over. */
function committee(overrides: Partial<QuickSessionCommittee> = {}): QuickSessionCommittee {
	return {
		committeeId: 'committee-thursday',
		committeeName: 'Thursday practice',
		committeeSlug: 'thursday-practice',
		conferenceSlug: 'quick-ab12cd34ef',
		timezone: 'Europe/Amsterdam',
		...overrides
	};
}

describe('listMyQuickSessions', () => {
	it('asks nothing for somebody who has never run a quick session', async () => {
		const { supabase, steps } = createStandInSupabase([]);

		expect(await listMyQuickSessions(supabase, [])).toEqual([]);
		expect(steps.tables).toEqual([]);
	});

	it('reads every committee once, each with its newest session alone', async () => {
		const { supabase, steps } = createStandInSupabase([]);

		await listMyQuickSessions(supabase, [
			committee(),
			committee({ committeeId: 'committee-model-ga' })
		]);

		expect(steps.tables).toEqual(['committees']);
		expect(steps.selects).toEqual(['id, created_at, committee_sessions(name, status, started_at)']);
		expect(steps.in).toEqual([['id', ['committee-thursday', 'committee-model-ga']]]);
		// The newest session of each committee, cut per committee rather than overall.
		expect(steps.order).toEqual([
			['created_at', { referencedTable: 'committee_sessions', ascending: false }]
		]);
		expect(steps.limit).toEqual([[1, { referencedTable: 'committee_sessions' }]]);
	});

	it('words each row from its newest session and lists the most recently used first', async () => {
		const { supabase } = createStandInSupabase([
			{ id: 'committee-thursday', created_at: '2026-09-01T10:00:00Z', committee_sessions: [] },
			{
				id: 'committee-model-ga',
				created_at: '2026-08-01T10:00:00Z',
				committee_sessions: [
					{ name: 'Session 2', status: 'in_progress', started_at: '2026-10-01T17:00:00Z' }
				]
			}
		]);

		const rows = await listMyQuickSessions(supabase, [
			committee(),
			committee({
				committeeId: 'committee-model-ga',
				committeeName: 'Model GA',
				committeeSlug: 'model-ga',
				conferenceSlug: 'quick-zz98yy76xx'
			})
		]);

		expect(rows).toEqual([
			{
				committeeId: 'committee-model-ga',
				committeeName: 'Model GA',
				statusLine: 'Session 2 in progress',
				isInProgress: true,
				href: '/conferences/quick-zz98yy76xx/committees/model-ga/chair'
			},
			{
				committeeId: 'committee-thursday',
				committeeName: 'Thursday practice',
				statusLine: 'No session yet',
				isInProgress: false,
				href: '/conferences/quick-ab12cd34ef/committees/thursday-practice/chair'
			}
		]);
	});

	it('leaves out a committee that did not come back', async () => {
		const { supabase } = createStandInSupabase([]);

		expect(await listMyQuickSessions(supabase, [committee()])).toEqual([]);
	});

	it('raises when the query fails, as every lookup of the dashboard does', async () => {
		const { supabase } = createStandInSupabase([], 'no connection');

		await expect(listMyQuickSessions(supabase, [committee()])).rejects.toThrow('no connection');
	});
});
