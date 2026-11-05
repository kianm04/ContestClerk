import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadTodaySchedule } from './dashboard-today';

// What `loadTodaySchedule` asks the database and how it turns the rows into the
// Today list's events. The stand-in client below answers with the rows the test
// gave it and records the filters it was handed. Which events fall on today is
// `eventsOfToday`'s work, tested in `$lib/dashboard-today.test.ts`.

/** Eleven in the morning in London, on a conference day. */
const NOW = new Date('2026-10-02T10:00:00Z');

/** One filter call the stand-in recorded: its method, then its arguments. */
type RecordedCall = [string, ...unknown[]];

/** A client whose one query answers `rows`, and which writes down every filter it was given. */
function makeStandIn(rows: unknown[]) {
	const calls: RecordedCall[] = [];

	const query = {
		select: (...args: unknown[]) => record('select', args),
		eq: (...args: unknown[]) => record('eq', args),
		gt: (...args: unknown[]) => record('gt', args),
		lt: (...args: unknown[]) => record('lt', args),
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

describe('loadTodaySchedule', () => {
	it('reads the events starting within a day either side of now, soonest first', async () => {
		const { supabase, calls } = makeStandIn([]);

		await loadTodaySchedule(supabase, 'conference-id', 'Europe/London', NOW);

		expect(calls).toContainEqual(['eq', 'conference_id', 'conference-id']);
		expect(calls).toContainEqual(['gt', 'starts_at', '2026-10-01T10:00:00.000Z']);
		expect(calls).toContainEqual(['lt', 'starts_at', '2026-10-03T10:00:00.000Z']);
		expect(calls).toContainEqual(['order', 'starts_at', { ascending: true }]);
	});

	it("names each event's committee by its short name, and keeps only today's", async () => {
		const { supabase } = makeStandIn([
			{
				id: 'session',
				title: 'Committee session II',
				starts_at: '2026-10-02T08:00:00Z',
				ends_at: '2026-10-02T09:30:00Z',
				location: 'Council Chamber',
				committees: { name: 'Security Council', abbreviation: 'UNSC' }
			},
			{
				id: 'social',
				title: 'Delegates’ social',
				starts_at: '2026-10-02T18:30:00Z',
				ends_at: '2026-10-02T21:00:00Z',
				location: null,
				committees: null
			},
			{
				id: 'tomorrow',
				title: 'Closing ceremony',
				starts_at: '2026-10-03T08:00:00Z',
				ends_at: '2026-10-03T09:00:00Z',
				location: null,
				committees: null
			}
		]);

		const events = await loadTodaySchedule(supabase, 'conference-id', 'Europe/London', NOW);

		expect(events).toEqual([
			{
				id: 'session',
				title: 'Committee session II',
				startsAt: '2026-10-02T08:00:00Z',
				endsAt: '2026-10-02T09:30:00Z',
				location: 'Council Chamber',
				committeeName: 'UNSC'
			},
			{
				id: 'social',
				title: 'Delegates’ social',
				startsAt: '2026-10-02T18:30:00Z',
				endsAt: '2026-10-02T21:00:00Z',
				location: null,
				committeeName: null
			}
		]);
	});
});
