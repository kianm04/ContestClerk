import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardRooms } from './dashboard-rooms';

// What `loadDashboardRooms` asks the database and how it puts the answers
// together into the Rooms table's rooms. The stand-in client below answers each
// table with whatever the test gave it and records the filters it was handed.
// Which rows Row Level Security lets the conference's team have is tested in
// `tests/db/`.

/** One filter call the stand-in recorded: its method, then its arguments. */
type RecordedCall = [string, ...unknown[]];

/**
 * A client whose `from(table)` answers with `rowsByTable[table]`, and which
 * writes down every filter each table's query was given.
 */
function makeStandIn(rowsByTable: Record<string, unknown[]>) {
	const callsByTable: Record<string, RecordedCall[]> = {};

	function from(table: string) {
		const calls: RecordedCall[] = [];
		callsByTable[table] = calls;

		const query = {
			select: (...args: unknown[]) => record('select', args),
			eq: (...args: unknown[]) => record('eq', args),
			in: (...args: unknown[]) => record('in', args),
			not: (...args: unknown[]) => record('not', args),
			order: (...args: unknown[]) => record('order', args),
			overrideTypes: () => Promise.resolve({ data: rowsByTable[table] ?? [], error: null })
		};

		function record(method: string, args: unknown[]) {
			calls.push([method, ...args]);
			return query;
		}

		return query;
	}

	const supabase = { from } as unknown as SupabaseClient;

	return { supabase, callsByTable };
}

/** Two committees: the Security Council sitting, the Third Committee stopped for the day. */
const COMMITTEES = [
	{ id: 'unsc-id', slug: 'unsc', name: 'Security Council', abbreviation: 'UNSC' },
	{ id: 'sochum-id', slug: 'sochum', name: 'Third Committee', abbreviation: null }
];

const STATES = [
	{
		committee_id: 'unsc-id',
		mode: 'formal_debate',
		current_session_id: 'session-2',
		committee_sessions: { name: 'Session 2', status: 'in_progress' }
	},
	{
		committee_id: 'sochum-id',
		mode: 'idle',
		current_session_id: 'sochum-session-1',
		committee_sessions: { name: 'Session 1', status: 'ended' }
	}
];

describe('loadDashboardRooms', () => {
	it("counts the latest roll call of each sitting room and names each room's last session", async () => {
		const { supabase, callsByTable } = makeStandIn({
			committees: COMMITTEES,
			committee_state: STATES,
			committee_sessions: [
				{ committee_id: 'sochum-id', name: 'Session 1', ended_at: '2026-10-02T15:58:00Z' },
				{ committee_id: 'unsc-id', name: 'Session 1', ended_at: '2026-10-02T11:00:00Z' }
			],
			seats: [
				{ committee_id: 'unsc-id' },
				{ committee_id: 'unsc-id' },
				{ committee_id: 'sochum-id' }
			],
			// Latest first: the first roll call of Session 2 here is the one that counts.
			roll_calls: [
				{
					session_id: 'session-2',
					taken_at: '2026-10-02T10:02:00Z',
					roll_call_entries: [
						{ status: 'present_and_voting', seats: { name: 'France', user_id: 'user-1' } },
						{ status: 'absent', seats: { name: 'Nigeria', user_id: 'user-2' } }
					]
				},
				{
					session_id: 'session-2',
					taken_at: '2026-10-02T09:02:00Z',
					roll_call_entries: [
						{ status: 'present', seats: { name: 'France', user_id: 'user-1' } },
						{ status: 'absent', seats: { name: 'Chile', user_id: 'user-3' } }
					]
				}
			],
			profiles: [{ id: 'user-2', full_name: 'Zoe Adams' }]
		});

		const rooms = await loadDashboardRooms(supabase, 'conference-id');

		expect(rooms).toEqual([
			{
				committeeId: 'unsc-id',
				committeeSlug: 'unsc',
				committeeName: 'UNSC',
				session: { name: 'Session 2', mode: 'formal_debate' },
				presentCount: 1,
				lastSession: { name: 'Session 1', endedAt: '2026-10-02T11:00:00Z' },
				seatedCount: 2,
				// Only the latest roll call's absentees: Chile has come back since.
				absentees: [
					{ fullName: 'Zoe Adams', seatName: 'Nigeria', markedAt: '2026-10-02T10:02:00Z' }
				]
			},
			{
				committeeId: 'sochum-id',
				committeeSlug: 'sochum',
				committeeName: 'Third Committee',
				session: null,
				presentCount: null,
				lastSession: { name: 'Session 1', endedAt: '2026-10-02T15:58:00Z' },
				seatedCount: 1,
				absentees: []
			}
		]);

		// Only the sitting room's session has its roll calls read.
		expect(callsByTable.roll_calls).toContainEqual(['in', 'session_id', ['session-2']]);
		expect(callsByTable.seats).toContainEqual(['not', 'user_id', 'is', null]);
		expect(callsByTable.profiles).toContainEqual(['in', 'id', ['user-2']]);
	});

	it('reads no roll call when no room is sitting', async () => {
		const { supabase, callsByTable } = makeStandIn({
			committees: COMMITTEES.slice(1),
			committee_state: STATES.slice(1)
		});

		const rooms = await loadDashboardRooms(supabase, 'conference-id');

		expect(rooms[0].session).toBeNull();
		expect(callsByTable.roll_calls).toBeUndefined();
		expect(callsByTable.profiles).toBeUndefined();
	});

	it('says "no roll call yet" by a null count for a sitting room nobody has called', async () => {
		const { supabase } = makeStandIn({
			committees: COMMITTEES.slice(0, 1),
			committee_state: STATES.slice(0, 1)
		});

		const rooms = await loadDashboardRooms(supabase, 'conference-id');

		expect(rooms[0].presentCount).toBeNull();
		expect(rooms[0].seatedCount).toBe(0);
	});
});
