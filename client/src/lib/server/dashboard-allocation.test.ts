import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readSchedulePublicity } from '$lib/server/schedule';
import { loadAllocationFacts } from './dashboard-allocation';

// Whether the programme is public is `$lib/server/schedule`'s own read, tested
// there, so it is replaced here with a stand-in that answers `true`.
vi.mock('$lib/server/schedule', () => ({ readSchedulePublicity: vi.fn() }));

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

describe('loadAllocationFacts', () => {
	beforeEach(() => {
		vi.mocked(readSchedulePublicity).mockResolvedValue(true);
	});

	it('reads the accepted delegations with their seats, and every event of the conference', async () => {
		const { supabase, callsByTable } = makeStandIn({});

		await loadAllocationFacts(supabase, 'conference-id');

		expect(callsByTable.delegations).toContainEqual([
			'select',
			'id, name, requested_seats, seats(id)'
		]);
		expect(callsByTable.delegations).toContainEqual(['eq', 'status', 'accepted']);
		expect(callsByTable.schedule_events).toContainEqual(['eq', 'conference_id', 'conference-id']);
		expect(readSchedulePublicity).toHaveBeenCalledWith(supabase, 'conference-id');
	});

	it('keeps only the delegations short of seats', async () => {
		const { supabase } = makeStandIn({
			delegations: [
				{
					id: 'harbour',
					name: 'Harbour View',
					requested_seats: 3,
					seats: [{ id: 's1' }, { id: 's2' }]
				},
				{ id: 'kingsway', name: 'Kingsway', requested_seats: 1, seats: [{ id: 's3' }] }
			],
			schedule_events: [{ starts_at: '2026-11-14T09:00:00Z' }]
		});

		const facts = await loadAllocationFacts(supabase, 'conference-id');

		expect(facts).toEqual({
			shortDelegations: [{ id: 'harbour', name: 'Harbour View', requestedSeats: 3, givenSeats: 2 }],
			eventStarts: ['2026-11-14T09:00:00Z'],
			isProgrammePublic: true
		});
	});
});
