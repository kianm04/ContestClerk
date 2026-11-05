import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listCommitteesWithSeatCounts } from './committees';

// These tests are about the decisions this module makes: which committees it
// asks for, in what order, and how it counts their seats. Nothing here talks to
// a database; the stand-in client below writes down what it was asked for and
// answers with fixed rows. Whether the database really lets a reader see those
// rows is Row Level Security's decision, and that is tested in `tests/db/`.

/** The view the seat counts come out of. */
const PUBLIC_SEATS_VIEW = 'public_seats';

/** An error in the shape the real client reports one. */
type QueryError = { message: string; code?: string };

/** What one query the module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	eq: [string, unknown][];
	/** `[column, value]` for every `.neq(...)`, which asks for a column to be anything else. */
	neq: [string, unknown][];
	/** `[column, value]` for every `.gte(...)`, which asks for a column to be that or more. */
	gte: [string, unknown][];
	in: [string, unknown[]][];
	/** `[column, ascending]` for every `.order(...)`. */
	order: [string, boolean][];
	/** The row count of every `.limit(...)`, which asks for no more rows than that. */
	limit: number[];
};

/** Everything the stand-in wrote down, in the order the module asked for it. */
type RecordedCalls = {
	queries: RecordedQuery[];
	/** `[name, arguments]` for every permission helper the module asked the database. */
	helpers: [string, Record<string, unknown>][];
};

/** What the stand-in should answer with. Everything here has a harmless default. */
type StandInAnswers = {
	/** The rows each relation gives back. A relation with no entry gives back none. */
	rows?: Record<string, unknown[]>;
	/** The relations whose query fails, and the message each fails with. */
	errors?: Record<string, string>;
	/** What each permission helper answers. One not named here answers `false`. */
	helpers?: Record<string, boolean>;
	/** The permission helpers whose call fails instead of answering. */
	failingHelpers?: string[];
};

/** The end of a chain that asked for one row rather than a list. */
type SingleRowBuilder = {
	overrideTypes: () => Promise<{ data: unknown; error: QueryError | null }>;
};

/**
 * One step of a query. Every step hands the builder back, which is what lets
 * the next step be called on it.
 */
type QueryBuilder = {
	select: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	neq: (column: string, value: unknown) => QueryBuilder;
	gte: (column: string, value: unknown) => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	order: (column: string, options: { ascending: boolean }) => QueryBuilder;
	limit: (count: number) => QueryBuilder;
	maybeSingle: () => SingleRowBuilder;
	overrideTypes: () => Promise<{ data: unknown[] | null; error: QueryError | null }>;
};

/**
 * The most rows one answer may hold, the way `max_rows` in
 * `supabase/config.toml` caps what the real PostgREST sends back.
 */
const STAND_IN_MAX_ROWS = 1000;

/**
 * The rows of a relation that a list query would get back: the ones matching
 * every `.eq(...)` on a column the row has, no more than `.limit(...)` asked
 * for, and never more than `STAND_IN_MAX_ROWS`.
 *
 * A condition on a column the stand-in's rows leave out is ignored, because
 * most tests hand over rows cut down to the columns they are about.
 */
function matchingRows(rows: unknown[], query: RecordedQuery): unknown[] {
	const matches = rows.filter((row) =>
		query.eq.every(([column, value]) => {
			const record = row as Record<string, unknown>;
			return !(column in record) || record[column] === value;
		})
	);
	const rowLimit = Math.min(STAND_IN_MAX_ROWS, ...query.limit);

	return matches.slice(0, rowLimit);
}

/**
 * A stand-in Supabase client that writes down what was asked of it.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` one with `.eq(...)` on it, and so on.
 * Each step adds one condition to a query that is only sent once the chain is
 * awaited. This copies that shape: every step records its arguments and hands
 * the same builder back, and the awaited answer is whatever `answers` asked for
 * for that relation, cut down by `matchingRows`. A chain ending in
 * `maybeSingle` is answered with the first of that relation's rows, the way the
 * real one answers with the first match.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	calls: RecordedCalls;
} {
	const calls: RecordedCalls = { queries: [], helpers: [] };

	function builderFor(table: string): QueryBuilder {
		const query: RecordedQuery = {
			table,
			eq: [],
			neq: [],
			gte: [],
			in: [],
			order: [],
			limit: []
		};
		calls.queries.push(query);

		const message = answers.errors?.[table];
		const rows = answers.rows?.[table] ?? [];
		const error = message ? { message } : null;
		const singleRowAnswer = { data: message ? null : (rows[0] ?? null), error };

		const builder: QueryBuilder = {
			// Which columns were asked for is not what these tests are about, so
			// `select` records nothing and only carries the chain on.
			select: () => builder,
			eq: (column, value) => {
				query.eq.push([column, value]);
				return builder;
			},
			neq: (column, value) => {
				query.neq.push([column, value]);
				return builder;
			},
			gte: (column, value) => {
				query.gte.push([column, value]);
				return builder;
			},
			in: (column, values) => {
				query.in.push([column, values]);
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
			maybeSingle: () => ({ overrideTypes: async () => singleRowAnswer }),
			// In the real client `overrideTypes` changes the type of the answer and
			// not the answer itself, so here it is simply where the chain ends. The
			// rows are picked only now, once every condition has been recorded.
			overrideTypes: async () => ({
				data: message ? null : matchingRows(rows, query),
				error
			})
		};

		return builder;
	}

	const supabase = {
		from: builderFor,
		// The permission helpers are SQL functions, which the real client calls
		// through `rpc` rather than through the builder above.
		rpc: async (name: string, helperArguments: Record<string, unknown>) => {
			calls.helpers.push([name, helperArguments]);

			if (answers.failingHelpers?.includes(name)) {
				return { data: null, error: { message: 'permission denied' } };
			}

			return { data: answers.helpers?.[name] ?? false, error: null };
		}
	};

	return { supabase: supabase as unknown as SupabaseClient, calls };
}

/** Where the module read its rows from, in the order it read them. */
function tablesRead(calls: RecordedCalls): string[] {
	return calls.queries.map((query) => query.table);
}

/** The first query the module sent to one relation, so a test can read its conditions back. */
function queryOn(calls: RecordedCalls, table: string): RecordedQuery {
	const query = calls.queries.find((sent) => sent.table === table);

	if (!query) {
		throw new Error(`Nothing was ever read from "${table}"`);
	}

	return query;
}

/** One row of the `committees` table, with the columns both lookups here ask for. */
function committeeRow(id: string, slug: string) {
	return {
		id,
		slug,
		name: 'United Nations Security Council',
		abbreviation: 'UNSC',
		description: null,
		topics: ['Sanctions'],
		level: 'intermediate',
		room: null
	};
}

describe('listCommitteesWithSeatCounts', () => {
	it('asks for the committees of one conference in the order the organiser put them in', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: { committees: [committeeRow('committee-1', 'unsc')] }
		});

		await listCommitteesWithSeatCounts(supabase, 'conference-1');

		expect(queryOn(calls, 'committees').eq).toEqual([['conference_id', 'conference-1']]);
		expect(queryOn(calls, 'committees').order).toEqual([['position', true]]);
	});

	it('counts the seats of every committee at once, taken and in total', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: {
				committees: [committeeRow('committee-1', 'unsc'), committeeRow('committee-2', 'who')],
				public_seats: [
					{ committee_id: 'committee-1', is_taken: true },
					{ committee_id: 'committee-1', is_taken: false },
					{ committee_id: 'committee-1', is_taken: true }
				]
			}
		});

		const committees = await listCommitteesWithSeatCounts(supabase, 'conference-1');

		// One request for every committee's seats, not one request each.
		expect(queryOn(calls, PUBLIC_SEATS_VIEW).in).toEqual([
			['committee_id', ['committee-1', 'committee-2']]
		]);
		expect(committees[0].seatSummary).toEqual({ taken: 2, total: 3 });
		// A committee nobody has made seats for yet has no rows in the view at all,
		// which reads as an empty committee rather than as a missing one.
		expect(committees[1].seatSummary).toEqual({ taken: 0, total: 0 });
	});

	it('asks nothing about seats when the conference has no committees yet', async () => {
		const { supabase, calls } = createStandInSupabase();

		expect(await listCommitteesWithSeatCounts(supabase, 'conference-1')).toEqual([]);
		expect(tablesRead(calls)).toEqual(['committees']);
	});
});
