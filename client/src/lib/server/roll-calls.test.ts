import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	getOrCreateRollCall,
	listRollCalls,
	markAllPresent,
	readRollCallAttendance,
	readRollCallSessionId,
	setRollCallStatus,
	startRollCall
} from './roll-calls';

// What this module decides on its own: which rows it writes, which filters it
// sends, and how it turns the rows it reads into the page's shapes. Nothing
// here talks to a database; the stand-in client below writes down what it was
// asked for and answers with fixed rows, the way `speakers-lists.test.ts` does.
// What the rows themselves allow is tested in `tests/db/committee-room.test.ts`,
// and the whole page against a real database in `tests/e2e/roll-call.spec.ts`.

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { message: string; code?: string } | null };

/** What one query this module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** `insert`, `update`, `upsert`, `delete`, or `select` for a read. */
	kind: string;
	/** What `insert`, `update` or `upsert` was given. */
	written: unknown;
	/** Every `.eq` and `.in` filter, in the order they were added. */
	filters: [string, unknown][];
};

/**
 * A stand-in Supabase client that writes down what each query asked for and
 * answers from `answers`, keyed by table name. A list answers a table's
 * queries one after the other, the last one repeating.
 */
function createStandIn(answers: Partial<Record<string, Answer | Answer[]>>) {
	const calls: RecordedQuery[] = [];
	const timesAsked = new Map<string, number>();

	function nextAnswer(table: string): Answer {
		const configured = answers[table] ?? { data: null, error: null };
		const list = Array.isArray(configured) ? configured : [configured];
		const count = timesAsked.get(table) ?? 0;
		timesAsked.set(table, count + 1);

		return list[Math.min(count, list.length - 1)];
	}

	function builderFor(table: string) {
		const record: RecordedQuery = { table, kind: 'select', written: null, filters: [] };
		calls.push(record);

		const answer = nextAnswer(table);

		/** Every step hands the builder back; awaiting it gives the answer. */
		const builder = {
			then: (resolve: (value: Answer) => void) => resolve(answer),
			select: () => builder,
			order: () => builder,
			limit: () => builder,
			single: () => builder,
			maybeSingle: () => builder,
			overrideTypes: () => builder,
			eq: (column: string, value: unknown) => {
				record.filters.push([column, value]);
				return builder;
			},
			in: (column: string, values: unknown) => {
				record.filters.push([column, values]);
				return builder;
			},
			insert: (rows: unknown) => write('insert', rows),
			update: (columns: unknown) => write('update', columns),
			upsert: (row: unknown) => write('upsert', row),
			delete: () => write('delete', null)
		};

		function write(kind: string, written: unknown) {
			record.kind = kind;
			record.written = written;
			return builder;
		}

		return builder;
	}

	return { supabase: { from: builderFor } as unknown as SupabaseClient, calls };
}

const OK_EMPTY: Answer = { data: null, error: null };

describe('startRollCall', () => {
	it('adds the roll call, then every seat marked absent', async () => {
		const { supabase, calls } = createStandIn({
			roll_calls: { data: { id: 'roll-1' }, error: null },
			roll_call_entries: OK_EMPTY
		});

		const rollCallId = await startRollCall(supabase, 'session-1', ['france', 'ghana']);

		expect(rollCallId).toBe('roll-1');
		expect(calls[0]).toMatchObject({ table: 'roll_calls', written: { session_id: 'session-1' } });
		expect(calls[1]).toMatchObject({
			table: 'roll_call_entries',
			kind: 'insert',
			written: [
				{ roll_call_id: 'roll-1', seat_id: 'france', status: 'absent' },
				{ roll_call_id: 'roll-1', seat_id: 'ghana', status: 'absent' }
			]
		});
	});

	it('takes the roll call away again when its seats cannot be added', async () => {
		const { supabase, calls } = createStandIn({
			roll_calls: [{ data: { id: 'roll-1' }, error: null }, OK_EMPTY],
			roll_call_entries: { data: null, error: { message: 'refused' } }
		});

		await expect(startRollCall(supabase, 'session-1', ['france'])).rejects.toThrow('refused');

		const removal = calls.find((call) => call.kind === 'delete');
		expect(removal).toMatchObject({ table: 'roll_calls', filters: [['id', 'roll-1']] });
	});

	it('adds no entries to a committee with no seats', async () => {
		const { supabase, calls } = createStandIn({
			roll_calls: { data: { id: 'roll-1' }, error: null }
		});

		await startRollCall(supabase, 'session-1', []);

		expect(calls.map((call) => call.table)).toEqual(['roll_calls']);
	});
});

describe('getOrCreateRollCall', () => {
	it('answers the session’s latest roll call and makes none', async () => {
		const { supabase, calls } = createStandIn({
			roll_calls: { data: { id: 'roll-2' }, error: null }
		});

		const rollCallId = await getOrCreateRollCall(supabase, 'session-1', ['france']);

		expect(rollCallId).toBe('roll-2');
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			table: 'roll_calls',
			kind: 'select',
			filters: [['session_id', 'session-1']]
		});
	});

	it('makes the roll call, every seat absent, when the session has none', async () => {
		const { supabase, calls } = createStandIn({
			roll_calls: [OK_EMPTY, { data: { id: 'roll-1' }, error: null }],
			roll_call_entries: OK_EMPTY
		});

		const rollCallId = await getOrCreateRollCall(supabase, 'session-1', ['france', 'ghana']);

		expect(rollCallId).toBe('roll-1');
		expect(calls.map((call) => call.kind)).toEqual(['select', 'insert', 'insert']);
		expect(calls[2]).toMatchObject({
			table: 'roll_call_entries',
			written: [
				{ roll_call_id: 'roll-1', seat_id: 'france', status: 'absent' },
				{ roll_call_id: 'roll-1', seat_id: 'ghana', status: 'absent' }
			]
		});
	});

	it('makes one roll call for five presses sent one after the other', async () => {
		// The first press finds none and makes it; every later one reads it back,
		// as the chair's instant form sends a screen's presses in turn (T140).
		const { supabase, calls } = createStandIn({
			roll_calls: [OK_EMPTY, { data: { id: 'roll-1' }, error: null }],
			roll_call_entries: OK_EMPTY
		});
		const answers: string[] = [];

		for (let press = 0; press < 5; press += 1) {
			answers.push(await getOrCreateRollCall(supabase, 'session-1', ['france']));
		}

		const made = calls.filter((call) => call.table === 'roll_calls' && call.kind === 'insert');
		expect(made).toHaveLength(1);
		expect(answers).toEqual(['roll-1', 'roll-1', 'roll-1', 'roll-1', 'roll-1']);
	});

	it('says so when the roll call cannot be read', async () => {
		const { supabase } = createStandIn({
			roll_calls: { data: null, error: { message: 'refused' } }
		});

		await expect(getOrCreateRollCall(supabase, 'session-1', [])).rejects.toThrow('refused');
	});
});

describe('listRollCalls', () => {
	it('counts both kinds of present and names the chair who took each', async () => {
		const { supabase, calls } = createStandIn({
			roll_calls: {
				data: [
					{
						id: 'roll-2',
						taken_at: '2026-02-14T10:05:00Z',
						taken_by: 'chair-1',
						roll_call_entries: [
							{ status: 'present' },
							{ status: 'present_and_voting' },
							{ status: 'absent' }
						]
					},
					{
						id: 'roll-1',
						taken_at: '2026-02-14T09:02:00Z',
						taken_by: 'chair-2',
						roll_call_entries: []
					}
				],
				error: null
			},
			profiles: { data: [{ id: 'chair-1', full_name: 'Ada Chair' }], error: null }
		});

		const rollCalls = await listRollCalls(supabase, 'session-1');

		expect(calls[0].filters).toEqual([['session_id', 'session-1']]);
		expect(rollCalls).toEqual([
			{ id: 'roll-2', takenAt: '2026-02-14T10:05:00Z', takenByName: 'Ada Chair', presentCount: 2 },
			{ id: 'roll-1', takenAt: '2026-02-14T09:02:00Z', takenByName: null, presentCount: 0 }
		]);
	});

	it('does not ask for names when the session has no roll call', async () => {
		const { supabase, calls } = createStandIn({ roll_calls: { data: [], error: null } });

		expect(await listRollCalls(supabase, 'session-1')).toEqual([]);
		expect(calls.map((call) => call.table)).toEqual(['roll_calls']);
	});
});

describe('readRollCallAttendance', () => {
	it('keys each mark by its seat', async () => {
		const { supabase } = createStandIn({
			roll_call_entries: {
				data: [
					{ seat_id: 'france', status: 'present' },
					{ seat_id: 'ghana', status: 'absent' }
				],
				error: null
			}
		});

		expect(await readRollCallAttendance(supabase, 'roll-1')).toEqual({
			france: 'present',
			ghana: 'absent'
		});
	});
});

describe('readRollCallSessionId', () => {
	it('answers the session, or null for a roll call the reader cannot see', async () => {
		const found = createStandIn({ roll_calls: { data: { session_id: 'session-1' }, error: null } });
		const missing = createStandIn({ roll_calls: OK_EMPTY });

		expect(await readRollCallSessionId(found.supabase, 'roll-1')).toBe('session-1');
		expect(await readRollCallSessionId(missing.supabase, 'roll-1')).toBeNull();
	});

	it('answers null for an id that is not a uuid, rather than failing the page', async () => {
		const invalidId = { message: 'invalid input syntax for type uuid', code: '22P02' };
		const { supabase } = createStandIn({ roll_calls: { data: null, error: invalidId } });

		expect(await readRollCallSessionId(supabase, 'not-a-uuid')).toBeNull();
	});
});

describe('setRollCallStatus', () => {
	it('writes the one seat’s mark, adding the entry when the seat has none', async () => {
		const { supabase, calls } = createStandIn({ roll_call_entries: OK_EMPTY });

		await setRollCallStatus(supabase, 'roll-1', 'ghana', 'present_and_voting');

		expect(calls).toEqual([
			{
				table: 'roll_call_entries',
				kind: 'upsert',
				written: { roll_call_id: 'roll-1', seat_id: 'ghana', status: 'present_and_voting' },
				filters: []
			}
		]);
	});
});

describe('markAllPresent', () => {
	it('changes only the absent entries, so present and voting stays', async () => {
		const { supabase, calls } = createStandIn({ roll_call_entries: OK_EMPTY });

		await markAllPresent(supabase, 'roll-1');

		expect(calls).toEqual([
			{
				table: 'roll_call_entries',
				kind: 'update',
				written: { status: 'present' },
				filters: [
					['roll_call_id', 'roll-1'],
					['status', 'absent']
				]
			}
		]);
	});
});
