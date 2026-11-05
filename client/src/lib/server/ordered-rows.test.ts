import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { placeOrderedRow, type OrderedList } from './ordered-rows';

// These tests are about what `placeOrderedRow` asks for and writes. Nothing
// here talks to a database: the stand-in client below answers the read with
// fixed rows and writes down every update. Whether an organiser may really
// change these rows is Row Level Security's decision, tested in `tests/db/`.

/** One `.update(...)` the stand-in was sent, with the `.eq(...)` filters after it. */
type RecordedUpdate = {
	table: string;
	values: Record<string, unknown>;
	eq: [string, unknown][];
};

/** What the stand-in saw: the filters on the read, and every update. */
type Recorded = {
	readEq: [string, unknown][];
	readOrder: string[];
	updates: RecordedUpdate[];
};

/**
 * A client whose read answers with `rows` and whose updates all work.
 *
 * Each builder method hands back the same object so calls can be chained the
 * way the real client allows, and `await` on it gives the answer.
 */
function makeStandIn(rows: { id: string; position: number }[]): {
	supabase: SupabaseClient;
	recorded: Recorded;
} {
	const recorded: Recorded = { readEq: [], readOrder: [], updates: [] };

	function from(table: string) {
		let update: RecordedUpdate | null = null;

		const query = {
			select: () => query,
			update: (values: Record<string, unknown>) => {
				update = { table, values, eq: [] };
				recorded.updates.push(update);
				return query;
			},
			eq: (column: string, value: unknown) => {
				if (update) update.eq.push([column, value]);
				else recorded.readEq.push([column, value]);
				return query;
			},
			order: (column: string) => {
				recorded.readOrder.push(column);
				return query;
			},
			overrideTypes: () => query,
			then: (resolve: (answer: unknown) => void) =>
				resolve(update ? { error: null } : { data: rows, error: null })
		};

		return query;
	}

	return { supabase: { from } as unknown as SupabaseClient, recorded };
}

const FEES: OrderedList = { table: 'fees', ownerColumn: 'conference_id', ownerId: 'conf-1' };

const ROWS = [
	{ id: 'a', position: 1 },
	{ id: 'b', position: 2 },
	{ id: 'c', position: 3 }
];

describe('placeOrderedRow', () => {
	it('reads the list in the order the pages draw it, inside its owner only', async () => {
		const { supabase, recorded } = makeStandIn(ROWS);

		await placeOrderedRow(supabase, FEES, 'c', 0);

		expect(recorded.readEq).toEqual([['conference_id', 'conf-1']]);
		expect(recorded.readOrder).toEqual(['position', 'id']);
	});

	it('writes the new position of every row that moves, and no other', async () => {
		const { supabase, recorded } = makeStandIn(ROWS);

		const isPlaced = await placeOrderedRow(supabase, FEES, 'c', 0);

		expect(isPlaced).toBe(true);
		expect(recorded.updates).toEqual([
			{
				table: 'fees',
				values: { position: 1 },
				eq: [
					['id', 'c'],
					['conference_id', 'conf-1']
				]
			},
			{
				table: 'fees',
				values: { position: 2 },
				eq: [
					['id', 'a'],
					['conference_id', 'conf-1']
				]
			},
			{
				table: 'fees',
				values: { position: 3 },
				eq: [
					['id', 'b'],
					['conference_id', 'conf-1']
				]
			}
		]);
	});

	it('answers false and writes nothing for a row that is not in the list', async () => {
		const { supabase, recorded } = makeStandIn(ROWS);

		const isPlaced = await placeOrderedRow(supabase, FEES, 'somebody-elses', 0);

		expect(isPlaced).toBe(false);
		expect(recorded.updates).toEqual([]);
	});
});
