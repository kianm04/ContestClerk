import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWaitingFacts } from './dashboard-waiting';

// What `loadWaitingFacts` asks the database and how it puts the answers
// together. The stand-in client answers each table with the rows the test gave
// it, and writes down every filter it was handed, by table.

/** One filter call the stand-in recorded: its method, then its arguments. */
type RecordedCall = [string, ...unknown[]];

/** A client that answers each table with `rowsByTable`, recording the filters by table. */
function makeStandIn(rowsByTable: Record<string, unknown[]>) {
	const callsByTable: Record<string, RecordedCall[]> = {};

	function queryFor(table: string) {
		const calls: RecordedCall[] = [];
		callsByTable[table] = calls;

		const query = {
			select: (...args: unknown[]) => record('select', args),
			eq: (...args: unknown[]) => record('eq', args),
			order: (...args: unknown[]) => record('order', args),
			overrideTypes: () => Promise.resolve({ data: rowsByTable[table] ?? [], error: null })
		};

		function record(method: string, args: unknown[]) {
			calls.push([method, ...args]);
			return query;
		}

		return query;
	}

	const supabase = { from: queryFor } as unknown as SupabaseClient;

	return { supabase, callsByTable };
}

describe('loadWaitingFacts', () => {
	it('reads only what is waiting, oldest first', async () => {
		const { supabase, callsByTable } = makeStandIn({});

		await loadWaitingFacts(supabase, 'conference-id');

		for (const table of ['applications', 'delegations_with_heads']) {
			expect(callsByTable[table]).toContainEqual(['eq', 'conference_id', 'conference-id']);
			expect(callsByTable[table]).toContainEqual(['eq', 'status', 'submitted']);
			expect(callsByTable[table]).toContainEqual(['order', 'submitted_at', { ascending: true }]);
		}
	});

	it('finds the oldest application, each first preference and the requests', async () => {
		const { supabase } = makeStandIn({
			applications: [
				{
					id: 'louis-id',
					committee_preferences: ['disec-id', 'hrc-id'],
					submitted_at: '2026-09-26T09:00:00Z'
				},
				{ id: 'ana-id', committee_preferences: [], submitted_at: '2026-10-01T09:00:00Z' }
			],
			delegations_with_heads: [
				{
					id: 'harbour-id',
					name: 'Harbour View College',
					institution_name: 'Harbour View College',
					requested_seats: 3,
					head_names: null
				}
			]
		});

		const facts = await loadWaitingFacts(supabase, 'conference-id');

		expect(facts).toEqual({
			oldestApplicationAt: '2026-09-26T09:00:00Z',
			firstPreferenceByApplication: { 'louis-id': 'disec-id' },
			delegationRequests: [
				{
					id: 'harbour-id',
					name: 'Harbour View College',
					institutionName: 'Harbour View College',
					requestedSeats: 3,
					headNames: []
				}
			]
		});
	});

	it('says nothing is waiting when nothing is', async () => {
		const { supabase } = makeStandIn({});

		const facts = await loadWaitingFacts(supabase, 'conference-id');

		expect(facts.oldestApplicationAt).toBeNull();
		expect(facts.delegationRequests).toEqual([]);
	});
});
