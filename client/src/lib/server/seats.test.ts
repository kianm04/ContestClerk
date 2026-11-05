import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addSeats, deleteSeat, getSeat, moveSeat, setSeatAvailability } from './seats';

// These tests are about the requests this module builds and what it makes of
// the answers: which conditions end up on a query, what it decides to insert
// and what it skips, and how it tells a refused delete from one that worked.
// Nothing here talks to a database; the stand-in client below writes down what
// it was asked for and answers with fixed rows. Whether the database really
// lets an organiser make these changes is Row Level Security's decision, and
// that is tested in `tests/db/committees-access.test.ts`.

/** An error in the shape the real client reports one. */
type QueryError = { message: string; code?: string };

/** What one query this module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns `.select(...)` was given, or `''` for a query that read nothing back. */
	columns: string;
	/** The rows `.insert(...)` was given, or `null` when the query added none. */
	inserted: Record<string, unknown>[] | null;
	/** The columns `.update(...)` was given, or `null` when the query changed nothing. */
	updated: Record<string, unknown> | null;
	/** `true` when the query removed rows rather than reading or changing them. */
	isDelete: boolean;
	eq: [string, unknown][];
	/** `[column, values]` for every `.in(...)`, which asks about a whole list at once. */
	in: [string, unknown[]][];
	/** `[column, value]` for every `.lt(...)` and `.gt(...)`, which look for a neighbour. */
	lt: [string, unknown][];
	gt: [string, unknown][];
	/** `[column, ascending]` for every `.order(...)`. */
	order: [string, boolean][];
	limit: number[];
	/** The first and last index `.range(...)` asked for, or `null` for no window. */
	range: [number, number] | null;
};

/** What the stand-in should answer with. Everything here has a harmless default. */
type StandInAnswers = {
	/**
	 * The rows each relation answers with, as a list of answers rather than as
	 * one: a move asks the `seats` table twice, once for the seat it is moving and
	 * once for its neighbour, and those two have to differ. Every query takes the
	 * next answer along, and the last one is repeated once the list runs out, so a
	 * relation that always answers the same thing is a list of one.
	 */
	rows?: Record<string, unknown[][]>;
	/** The relations whose query fails, and the message each fails with. */
	errors?: Record<string, string>;
	/**
	 * The error code each failing relation reports beside its message, for the
	 * one code this module reads: `PGRST103`, a window past the last row.
	 */
	errorCodes?: Record<string, string>;
	/**
	 * The most rows one answer may hold, the way `max_rows` in
	 * `supabase/config.toml` caps every answer PostgREST gives. Unset, there is no
	 * cap.
	 */
	maxRows?: number;
	/**
	 * The message `.rpc(...)` raises with, for the one function in this module
	 * that calls a database function rather than building a query.
	 */
	rpcError?: string;
};

/** What an awaited query answers with: a list of rows, or nothing and a message. */
type QueryAnswer = {
	data: unknown[] | null;
	error: QueryError | null;
};

/** What a chain ending in `maybeSingle` answers with: one row rather than a list. */
type SingleRowAnswer = {
	data: unknown;
	error: QueryError | null;
};

/** The end of a chain that asked for one row rather than a list. */
type SingleRowBuilder = {
	overrideTypes: () => Promise<SingleRowAnswer>;
	then: (resolve: (answer: SingleRowAnswer) => void) => void;
};

/**
 * One step of a query. Every step hands the builder back, which is what lets
 * the next step be called on it.
 */
type QueryBuilder = {
	select: (columns: string) => QueryBuilder;
	insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => QueryBuilder;
	update: (columns: Record<string, unknown>) => QueryBuilder;
	delete: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	lt: (column: string, value: unknown) => QueryBuilder;
	gt: (column: string, value: unknown) => QueryBuilder;
	order: (column: string, options: { ascending: boolean }) => QueryBuilder;
	limit: (count: number) => QueryBuilder;
	range: (first: number, last: number) => QueryBuilder;
	maybeSingle: () => SingleRowBuilder;
	overrideTypes: () => Promise<QueryAnswer>;
	/** What makes a chain that is awaited without `overrideTypes` on the end work. */
	then: (resolve: (answer: QueryAnswer) => void) => void;
};

/**
 * A stand-in Supabase client that writes down what was asked of it.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` one with `.eq(...)` on it, and so on.
 * Each step adds one condition to a query that is only sent once the chain is
 * awaited. This copies that shape: every step records its arguments and hands
 * the same builder back, and the awaited answer is whatever `answers` asked for
 * for that relation.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
	/** `[name, arguments]` for every `.rpc(...)`, the way `access.test.ts` records them. */
	rpcCalls: [string, unknown][];
} {
	const queries: RecordedQuery[] = [];
	const rpcCalls: [string, unknown][] = [];
	// How many queries each relation has been sent, so the next answer along can
	// be found for it.
	const answersUsed = new Map<string, number>();

	function nextRows(table: string): unknown[] {
		const answerList = answers.rows?.[table] ?? [];
		const used = answersUsed.get(table) ?? 0;

		answersUsed.set(table, used + 1);

		if (answerList.length === 0) {
			return [];
		}

		return answerList[Math.min(used, answerList.length - 1)];
	}

	function builderFor(table: string): QueryBuilder {
		const query: RecordedQuery = {
			table,
			columns: '',
			inserted: null,
			updated: null,
			isDelete: false,
			eq: [],
			in: [],
			lt: [],
			gt: [],
			order: [],
			limit: [],
			range: null
		};
		queries.push(query);

		const message = answers.errors?.[table];
		const rows = nextRows(table);
		const error = message ? { message, code: answers.errorCodes?.[table] } : null;

		// Worked out when the chain is awaited rather than now, because `.range(...)`
		// comes later in the chain and a window answers only the rows inside it,
		// the way the real client does.
		function listAnswer(): QueryAnswer {
			if (message) {
				return { data: null, error };
			}

			const windowRows =
				query.range === null ? rows : rows.slice(query.range[0], query.range[1] + 1);

			return { data: windowRows.slice(0, answers.maxRows ?? windowRows.length), error: null };
		}
		const singleRowAnswer: SingleRowAnswer = { data: message ? null : (rows[0] ?? null), error };
		const singleRowBuilder: SingleRowBuilder = {
			overrideTypes: async () => singleRowAnswer,
			then: (resolve) => resolve(singleRowAnswer)
		};

		const builder: QueryBuilder = {
			select: (columns) => {
				query.columns = columns;
				return builder;
			},
			insert: (rows) => {
				query.inserted = Array.isArray(rows) ? rows : [rows];
				return builder;
			},
			update: (columns) => {
				query.updated = columns;
				return builder;
			},
			delete: () => {
				query.isDelete = true;
				return builder;
			},
			eq: (column, value) => {
				query.eq.push([column, value]);
				return builder;
			},
			in: (column, values) => {
				query.in.push([column, values]);
				return builder;
			},
			lt: (column, value) => {
				query.lt.push([column, value]);
				return builder;
			},
			gt: (column, value) => {
				query.gt.push([column, value]);
				return builder;
			},
			order: (column, options) => {
				query.order.push([column, options.ascending]);
				return builder;
			},
			limit: (count) => {
				query.limit.push(count);
				return builder;
			},
			range: (first, last) => {
				query.range = [first, last];
				return builder;
			},
			maybeSingle: () => singleRowBuilder,
			// In the real client `overrideTypes` changes the type of the answer and
			// not the answer itself, so here it is simply where the chain ends.
			overrideTypes: async () => listAnswer(),
			then: (resolve) => resolve(listAnswer())
		};

		return builder;
	}

	const supabase = {
		from: builderFor,
		// A database function is not a query, so it is not a chain either: it is
		// called once and answers straight away.
		rpc: async (name: string, functionArguments: unknown) => {
			rpcCalls.push([name, functionArguments]);

			return { data: null, error: answers.rpcError ? { message: answers.rpcError } : null };
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, queries, rpcCalls };
}

/** The relations this module asked for, in the order it asked for them. */
function tablesRead(queries: RecordedQuery[]): string[] {
	return queries.map((query) => query.table);
}

/** The first query sent to one relation, so a test can read its conditions back. */
function queryOn(queries: RecordedQuery[], table: string): RecordedQuery {
	const query = queries.find((sent) => sent.table === table);

	if (!query) {
		throw new Error(`Nothing was ever sent to "${table}"`);
	}

	return query;
}

/** One `seats` row with every column this module reads. */
function seatRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'seat-1',
		name: 'France',
		kind: 'country',
		country_code: 'FR',
		position: 0,
		is_available: true,
		user_id: null,
		delegation_id: null,
		...changes
	};
}

describe('getSeat', () => {
	it('brings back the seat with the delegate and the delegation named', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				seats: [[seatRow({ user_id: 'user-1', delegation_id: 'delegation-1' })]],
				profiles: [[{ full_name: 'Daniel Park' }]],
				participant_delegations: [[{ name: "St Mary's College" }]]
			}
		});

		const seat = await getSeat(supabase, 'committee-1', 'seat-1');

		// The committee is part of the question, so a seat id from another
		// committee is nothing rather than a seat to change.
		expect(queryOn(queries, 'seats').eq).toEqual([
			['committee_id', 'committee-1'],
			['id', 'seat-1']
		]);
		// The page refuses to hide or delete a filled seat, and says who has it.
		// A seat somebody has moved into is no longer being held for the delegation.
		expect(seat?.isFilled).toBe(true);
		expect(seat?.isReserved).toBe(false);
		expect(seat?.holderName).toBe('Daniel Park');
		expect(seat?.delegationName).toBe("St Mary's College");
		expect(seat?.countryCode).toBe('FR');
	});

	it('calls a seat filled even when the delegate has no name to show', async () => {
		const { supabase } = createStandInSupabase({
			rows: { seats: [[seatRow({ user_id: 'user-1' })]], profiles: [[]] }
		});

		const seat = await getSeat(supabase, 'committee-1', 'seat-1');

		// An account made before the `handle_new_user` trigger existed has no
		// profile row. The seat is still held, and the page must not offer to
		// delete it.
		expect(seat?.isFilled).toBe(true);
		expect(seat?.holderName).toBeNull();
	});

	it('calls a seat reserved while its delegation has named nobody', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				seats: [[seatRow({ delegation_id: 'delegation-1' })]],
				participant_delegations: [[{ name: "St Mary's College" }]]
			}
		});

		const seat = await getSeat(supabase, 'committee-1', 'seat-1');

		expect(seat?.isReserved).toBe(true);
		expect(seat?.isFilled).toBe(false);
		expect(seat?.delegationName).toBe("St Mary's College");
	});

	it('looks nobody up for a seat that is still free', async () => {
		const { supabase, queries } = createStandInSupabase({ rows: { seats: [[seatRow()]] } });

		const seat = await getSeat(supabase, 'committee-1', 'seat-1');

		expect(seat?.isFilled).toBe(false);
		expect(seat?.isReserved).toBe(false);
		expect(seat?.holderName).toBeNull();
		expect(seat?.delegationName).toBeNull();
		// Nothing to look up, so neither lookup is sent at all.
		expect(tablesRead(queries)).toEqual(['seats']);
	});

	it('answers with nothing when that committee has no seat with that id', async () => {
		const { supabase } = createStandInSupabase();

		expect(await getSeat(supabase, 'committee-1', 'seat-9')).toBeNull();
	});
});

describe('addSeats', () => {
	it('sends no request at all for an empty list', async () => {
		const { supabase, queries } = createStandInSupabase();

		expect(await addSeats(supabase, 'committee-1', [])).toEqual({
			addedCount: 0,
			existingCount: 0
		});
		expect(queries).toEqual([]);
	});

	it('skips a name the committee already has, whatever its case, and counts it', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				seats: [
					[
						{ name: 'France', position: 0 },
						{ name: 'China', position: 1 }
					]
				]
			}
		});

		const result = await addSeats(supabase, 'committee-1', [
			{ name: 'france', countryCode: 'FR' },
			{ name: 'Chad', countryCode: 'TD' }
		]);

		// A name that is already there is not an error: the organiser expects the
		// rest of the list to appear.
		expect(result).toEqual({ addedCount: 1, existingCount: 1 });
		// The new seat carries on from the highest position the committee has, and
		// keeps the spelling it was handed in with.
		expect(queries[1].inserted).toEqual([
			{
				committee_id: 'committee-1',
				name: 'Chad',
				kind: 'country',
				country_code: 'TD',
				position: 2
			}
		]);
	});

	it('inserts nothing when the committee already has every name', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { seats: [[{ name: 'France', position: 0 }]] }
		});

		const result = await addSeats(supabase, 'committee-1', [{ name: 'France', countryCode: 'FR' }]);

		expect(result).toEqual({ addedCount: 0, existingCount: 1 });
		// Only the query that read what was already there.
		expect(queries).toHaveLength(1);
	});

	it('skips a name that is twice over in the list handed in', async () => {
		const { supabase } = createStandInSupabase();

		const result = await addSeats(supabase, 'committee-1', [
			{ name: 'Chad', countryCode: 'TD' },
			{ name: 'chad', countryCode: 'TD' }
		]);

		// The unique index on (committee_id, name) would refuse the pair, so the
		// second one is counted as one the committee already has.
		expect(result).toEqual({ addedCount: 1, existingCount: 1 });
	});

	it('calls a seat with no country code a character rather than a country', async () => {
		const { supabase, queries } = createStandInSupabase();

		// The ready-made country lists say nothing about the kind, so the country
		// code is what decides it for them.
		await addSeats(supabase, 'committee-1', [{ name: 'Minister of Defence', countryCode: null }]);

		expect(queries[1].inserted).toEqual([
			{
				committee_id: 'committee-1',
				name: 'Minister of Defence',
				kind: 'other',
				country_code: null,
				// An empty committee starts its list at nought.
				position: 0
			}
		]);
	});

	it('saves the kind the editor picked rather than working one out', async () => {
		const { supabase, queries } = createStandInSupabase();

		await addSeats(supabase, 'committee-1', [
			{ name: 'Holy See', countryCode: 'VA', kind: 'observer' }
		]);

		// An organiser who picks "Observer" for a seat that has a country code gets
		// an observer, because the form's answer beats the guess.
		expect(queries[1].inserted).toEqual([
			{
				committee_id: 'committee-1',
				name: 'Holy See',
				kind: 'observer',
				country_code: 'VA',
				position: 0
			}
		]);
	});
});

describe('setSeatAvailability', () => {
	it('asks set_seat_availability to write the new answer onto the one seat named', async () => {
		const { supabase, rpcCalls } = createStandInSupabase();

		await setSeatAvailability(supabase, 'seat-1', false);

		expect(rpcCalls).toEqual([
			['set_seat_availability', { seat_id: 'seat-1', is_available: false }]
		]);
	});

	it('says so when the database refuses', async () => {
		const { supabase } = createStandInSupabase({ rpcError: 'Only the organisers' });

		await expect(setSeatAvailability(supabase, 'seat-1', true)).rejects.toThrow(
			'Could not change the seat'
		);
	});
});

describe('moveSeat', () => {
	it('swaps places with the seat below', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				seats: [[{ id: 'seat-1', position: 0 }], [{ id: 'seat-2', position: 1 }]]
			}
		});

		await moveSeat(supabase, 'committee-1', 'seat-1', 'down');

		// Down the list is towards the higher positions, so the neighbour is the
		// lowest position above this one.
		expect(queries[1].gt).toEqual([['position', 0]]);
		expect(queries[1].order).toEqual([
			['position', true],
			['id', true]
		]);
		expect(queries[1].limit).toEqual([1]);
		// The two trade positions, and no other seat is touched.
		expect(queries[2].updated).toEqual({ position: 1 });
		expect(queries[2].eq).toEqual([['id', 'seat-1']]);
		expect(queries[3].updated).toEqual({ position: 0 });
		expect(queries[3].eq).toEqual([['id', 'seat-2']]);
	});

	it('does nothing at all when there is no neighbour to swap with', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { seats: [[{ id: 'seat-1', position: 0 }], []] }
		});

		await moveSeat(supabase, 'committee-1', 'seat-1', 'up');

		// The seat at the top of the list has nothing above it, and the arrow there
		// does nothing rather than failing.
		const changes = queries.filter((query) => query.updated !== null);

		expect(changes).toEqual([]);
	});
});

describe('deleteSeat', () => {
	it('answers yes when the seat was really deleted', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { seats: [[{ id: 'seat-1' }]] }
		});

		expect(await deleteSeat(supabase, 'seat-1')).toBe(true);
		expect(queryOn(queries, 'seats').isDelete).toBe(true);
		expect(queryOn(queries, 'seats').eq).toEqual([['id', 'seat-1']]);
	});

	it('answers no when Row Level Security refused, which is not an error', async () => {
		const { supabase } = createStandInSupabase();

		// The delete policy only allows a seat with no `user_id`, so a delegate's
		// seat comes back with nothing deleted and no message. Asking which ids
		// were deleted is what tells that apart from a delete that worked.
		expect(await deleteSeat(supabase, 'seat-1')).toBe(false);
	});
});
