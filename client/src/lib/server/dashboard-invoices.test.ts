import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFullNames } from '$lib/server/dashboard-people';
import { loadUnpaidInvoices } from './dashboard-invoices';

// Looking up a name is `readFullNames`'s own work, tested beside it, so it is
// replaced here with a stand-in that knows one payer.
vi.mock('$lib/server/dashboard-people', () => ({ readFullNames: vi.fn() }));

/** One filter call the stand-in recorded: its method, then its arguments. */
type RecordedCall = [string, ...unknown[]];

/** A client whose one query answers `rows`, and which writes down every filter it was given. */
function makeStandIn(rows: unknown[]) {
	const calls: RecordedCall[] = [];

	const query = {
		select: (...args: unknown[]) => record('select', args),
		eq: (...args: unknown[]) => record('eq', args),
		order: (...args: unknown[]) => record('order', args),
		overrideTypes: () => Promise.resolve({ data: rows, error: null })
	};

	function record(method: string, args: unknown[]) {
		calls.push([method, ...args]);
		return query;
	}

	const supabase = { from: () => query } as unknown as SupabaseClient;

	return { supabase, calls };
}

describe('loadUnpaidInvoices', () => {
	beforeEach(() => {
		vi.mocked(readFullNames).mockReset();
		vi.mocked(readFullNames).mockResolvedValue(new Map([['maya-id', 'Maya Thompson']]));
	});

	it('reads the unpaid invoices of the conference, oldest first', async () => {
		const { supabase, calls } = makeStandIn([]);

		await loadUnpaidInvoices(supabase, 'conference-id');

		expect(calls).toContainEqual(['eq', 'conference_id', 'conference-id']);
		expect(calls).toContainEqual(['eq', 'status', 'unpaid']);
		expect(calls).toContainEqual(['order', 'created_at', { ascending: true }]);
	});

	it('adds several up, without naming anybody', async () => {
		const { supabase } = makeStandIn([
			{
				amount_cents: 4500,
				created_at: '2026-09-23T09:00:00Z',
				payer_user_id: 'maya-id',
				delegations: null
			},
			{
				amount_cents: 12500,
				created_at: '2026-09-28T09:00:00Z',
				payer_user_id: null,
				delegations: { name: 'Harbour View' }
			}
		]);

		const unpaid = await loadUnpaidInvoices(supabase, 'conference-id');

		expect(unpaid).toEqual({
			count: 2,
			totalCents: 17000,
			oldestCreatedAt: '2026-09-23T09:00:00Z',
			onlyPayerName: null
		});
		expect(readFullNames).not.toHaveBeenCalled();
	});

	it('names the payer of the one unpaid invoice', async () => {
		const { supabase } = makeStandIn([
			{
				amount_cents: 4500,
				created_at: '2026-09-23T09:00:00Z',
				payer_user_id: 'maya-id',
				delegations: null
			}
		]);

		const unpaid = await loadUnpaidInvoices(supabase, 'conference-id');

		expect(unpaid.onlyPayerName).toBe('Maya Thompson');
	});

	it('names the delegation of the one unpaid invoice that nobody in particular pays', async () => {
		const { supabase } = makeStandIn([
			{
				amount_cents: 12500,
				created_at: '2026-09-28T09:00:00Z',
				payer_user_id: null,
				delegations: { name: 'Harbour View' }
			}
		]);

		const unpaid = await loadUnpaidInvoices(supabase, 'conference-id');

		expect(unpaid.onlyPayerName).toBe('Harbour View');
	});
});
