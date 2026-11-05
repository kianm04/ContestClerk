import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NO_ALLOCATION_FACTS } from '$lib/dashboard-allocation';
import { NO_UNPAID_INVOICES } from '$lib/dashboard-invoices';
import { NO_WAITING_FACTS } from '$lib/dashboard-waiting';
import { hasSeatedDelegates } from '$lib/server/conferences';
import { loadAllocationFacts } from '$lib/server/dashboard-allocation';
import { loadUnpaidInvoices } from '$lib/server/dashboard-invoices';
import { loadDashboardRooms } from '$lib/server/dashboard-rooms';
import { loadTodaySchedule } from '$lib/server/dashboard-today';
import { loadWaitingFacts } from '$lib/server/dashboard-waiting';
import { loadPhaseCards } from './dashboard-cards';

// Which reads `loadPhaseCards` runs in each phase, and what it hands back for
// the ones it skips. The other server modules are replaced with stand-ins that
// answer at once, since each has its own tests; `vi.mock` swaps a module for
// the one the factory returns before this file imports it.

vi.mock('$lib/server/conferences', () => ({ hasSeatedDelegates: vi.fn(async () => true) }));
vi.mock('$lib/server/manage-committees', () => ({
	listCommitteesForManage: vi.fn(async () => [{ id: 'committee' }])
}));
vi.mock('$lib/server/dashboard-waiting', () => ({
	loadWaitingFacts: vi.fn(async () => ({ oldestApplicationAt: 'waiting' }))
}));
vi.mock('$lib/server/dashboard-allocation', () => ({
	loadAllocationFacts: vi.fn(async () => ({ isProgrammePublic: true }))
}));
vi.mock('$lib/server/dashboard-invoices', () => ({
	loadUnpaidInvoices: vi.fn(async () => ({ count: 3 }))
}));
vi.mock('$lib/server/dashboard-rooms', () => ({
	loadDashboardRooms: vi.fn(async () => [{ committeeId: 'room' }])
}));
vi.mock('$lib/server/dashboard-today', () => ({
	loadTodaySchedule: vi.fn(async () => [{ id: 'event' }])
}));

const CONFERENCE = { id: 'conference-id', timezone: 'Europe/London' };
const NOW = new Date('2026-10-02T10:00:00Z');

/**
 * A client for the one read this file makes itself, the awards. It writes
 * down every table it was asked for.
 */
function makeStandIn() {
	const tables: string[] = [];

	function from(table: string) {
		tables.push(table);

		const query = {
			select: () => query,
			eq: () => query,
			overrideTypes: () =>
				Promise.resolve({
					data: [{ status: 'proposed' }, { status: 'confirmed' }, { status: 'confirmed' }],
					error: null
				})
		};

		return query;
	}

	const supabase = { from } as unknown as SupabaseClient;

	return { supabase, tables };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('loadPhaseCards', () => {
	it('reads the committees, whether anybody is seated and what waits while applications are open', async () => {
		const { supabase, tables } = makeStandIn();

		const cards = await loadPhaseCards(supabase, CONFERENCE, 'applications', NOW);

		expect(cards).toEqual({
			committees: [{ id: 'committee' }],
			isAnybodySeated: true,
			waiting: { oldestApplicationAt: 'waiting' },
			allocation: NO_ALLOCATION_FACTS,
			unpaidInvoices: NO_UNPAID_INVOICES,
			rooms: [],
			todayEvents: [],
			awardCounts: { proposed: 0, confirmed: 0 }
		});
		expect(tables).toEqual([]);
		expect(loadAllocationFacts).not.toHaveBeenCalled();
		expect(loadUnpaidInvoices).not.toHaveBeenCalled();
	});

	it('also reads the allocation and the unpaid invoices while seats are being given', async () => {
		const { supabase } = makeStandIn();

		const cards = await loadPhaseCards(supabase, CONFERENCE, 'allocation', NOW);

		expect(cards.allocation).toEqual({ isProgrammePublic: true });
		expect(cards.unpaidInvoices).toEqual({ count: 3 });
		expect(cards.waiting).toEqual({ oldestApplicationAt: 'waiting' });
		expect(cards.isAnybodySeated).toBe(true);
	});

	it('reads the rooms, today and the unpaid invoices on a conference day', async () => {
		const { supabase, tables } = makeStandIn();

		const cards = await loadPhaseCards(supabase, CONFERENCE, 'conference-days', NOW);

		expect(cards.rooms).toEqual([{ committeeId: 'room' }]);
		expect(cards.todayEvents).toEqual([{ id: 'event' }]);
		expect(cards.committees).toEqual([{ id: 'committee' }]);
		expect(cards.unpaidInvoices).toEqual({ count: 3 });
		expect(cards.waiting).toBe(NO_WAITING_FACTS);
		expect(loadTodaySchedule).toHaveBeenCalledWith(supabase, 'conference-id', 'Europe/London', NOW);
		expect(hasSeatedDelegates).not.toHaveBeenCalled();
		expect(loadWaitingFacts).not.toHaveBeenCalled();
		expect(tables).toEqual([]);
	});

	it('counts the proposed and confirmed awards after the conference', async () => {
		const { supabase, tables } = makeStandIn();

		const cards = await loadPhaseCards(supabase, CONFERENCE, 'after', NOW);

		expect(cards.awardCounts).toEqual({ proposed: 1, confirmed: 2 });
		expect(cards.unpaidInvoices).toEqual({ count: 3 });
		expect(cards.rooms).toEqual([]);
		expect(loadDashboardRooms).not.toHaveBeenCalled();
		expect(tables).toEqual(['awards']);
	});
});
