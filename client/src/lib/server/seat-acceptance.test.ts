import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	acceptApplication,
	allocateDelegationSeats,
	listFreeSeats,
	listSeatsByCommittee,
	readSeatLabel
} from './seat-acceptance';

// These tests are about the requests this module builds and what it makes of
// the answers: which seats of a conference count as free, how the seat picker
// groups them, and what reaches the database functions that accept somebody.
// Nothing here talks to a database; the stand-in client below writes down what
// it was asked for and answers with fixed rows. What each of
// `accept_application`'s and `allocate_delegation_seats`'s own checks refuses
// is Row Level Security's and those functions' decision, tested in
// `tests/db/invoice-allocation.test.ts`.

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

/** One `seats` row as `listFreeSeats` asks for it, which names the committee as well. */
function allocatableSeatRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'seat-1',
		committee_id: 'committee-1',
		name: 'France',
		country_code: 'FR',
		is_available: true,
		delegation_id: null,
		user_id: null,
		...changes
	};
}

describe('acceptApplication', () => {
	it('hands the application and the seat to the database function', async () => {
		const { supabase, rpcCalls } = createStandInSupabase();

		await acceptApplication(supabase, 'application-1', 'seat-1');

		// The seat, the status, the decision and the invoice are one statement in
		// the database rather than four queries from here.
		expect(rpcCalls).toEqual([
			['accept_application', { application_id: 'application-1', seat_id: 'seat-1' }]
		]);
	});

	it("passes the database's own message on, because the page shows it", async () => {
		const { supabase } = createStandInSupabase({ rpcError: 'That seat is not free' });

		// Every check is inside the security definer function, so a refusal arrives
		// as an exception with the sentence the organiser needs to read.
		await expect(acceptApplication(supabase, 'application-1', 'seat-1')).rejects.toThrow(
			'That seat is not free'
		);
	});
});

describe('listFreeSeats', () => {
	it('asks for the seats of one conference through the committees they are in', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { seats: [[allocatableSeatRow()]] }
		});

		await listFreeSeats(supabase, 'conference-1');

		// `seats` has no conference of its own, so the committee is the way to ask.
		// Without the `!inner` the filter on the committee would not narrow which
		// seats come back.
		expect(queryOn(queries, 'seats').columns).toContain('committees!inner(conference_id)');
		expect(queryOn(queries, 'seats').eq).toEqual([['committees.conference_id', 'conference-1']]);
		// The organiser's own order, with the name settling two seats that share a
		// position and the id settling the rest, so that every window is cut from
		// the same list.
		expect(queryOn(queries, 'seats').order).toEqual([
			['position', true],
			['name', true],
			['id', true]
		]);
		expect(queryOn(queries, 'seats').range).toEqual([0, 499]);
	});

	it('reads every seat of a conference larger than `max_rows`, a window at a time', async () => {
		// 1,200 seats, of which only the very last is free. Read in one answer it
		// would be the 1,200th row and past `max_rows`, and the panel would offer
		// nothing at all.
		const seatRows = Array.from({ length: 1200 }, (_, index) =>
			allocatableSeatRow({ id: `seat-${index + 1}`, user_id: `user-${index + 1}` })
		);
		seatRows[1199] = allocatableSeatRow({ id: 'seat-1200', name: 'Peru' });
		const { supabase, queries } = createStandInSupabase({
			rows: { seats: [seatRows] },
			maxRows: 1000
		});

		const seats = await listFreeSeats(supabase, 'conference-1');

		expect(seats.map((seat) => seat.id)).toEqual(['seat-1200']);
		// Three full or partial windows, then an empty one that ends the loop.
		expect(queries.map((query) => query.range)).toEqual([
			[0, 499],
			[500, 999],
			[1000, 1499],
			[1200, 1699]
		]);
	});

	it('moves along by the rows that arrived when `max_rows` is below the window', async () => {
		// Every seat is free, and each answer is cut to 200 rows. Moving by the 500
		// asked for would step over 300 seats in every window.
		const seatRows = Array.from({ length: 450 }, (_, index) =>
			allocatableSeatRow({ id: `seat-${index + 1}` })
		);
		const { supabase } = createStandInSupabase({
			rows: { seats: [seatRows] },
			maxRows: 200
		});

		const seats = await listFreeSeats(supabase, 'conference-1');

		expect(seats).toHaveLength(450);
	});

	it('stops at a window that starts past the last row', async () => {
		// PostgREST answers such a window with `PGRST103` rather than an empty list.
		const { supabase } = createStandInSupabase({
			errors: { seats: 'Requested range not satisfiable' },
			errorCodes: { seats: 'PGRST103' }
		});

		await expect(listFreeSeats(supabase, 'conference-1')).resolves.toEqual([]);
	});

	it('keeps only the seats that are really free, and names the columns the way the app does', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				seats: [
					[
						allocatableSeatRow(),
						allocatableSeatRow({ id: 'seat-2', name: 'China', is_available: false }),
						allocatableSeatRow({ id: 'seat-3', name: 'Chad', user_id: 'user-1' }),
						allocatableSeatRow({ id: 'seat-4', name: 'Peru', delegation_id: 'delegation-1' })
					]
				]
			}
		});

		const seats = await listFreeSeats(supabase, 'conference-1');

		// Hidden, filled and reserved are all dropped, and which is which is
		// `seatState` in `$lib/allocation.ts` rather than a second rule written here.
		expect(seats).toEqual([
			{
				id: 'seat-1',
				committeeId: 'committee-1',
				name: 'France',
				countryCode: 'FR',
				isAvailable: true,
				delegationId: null,
				userId: null
			}
		]);
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { seats: 'connection closed' } });

		await expect(listFreeSeats(supabase, 'conference-1')).rejects.toThrow(
			'Could not read the free seats'
		);
	});
});

/** One `committees` row, the columns `listCommitteesWithSeatCounts` reads. */
function committeeRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'committee-1',
		slug: 'unsc',
		name: 'Security Council',
		abbreviation: 'UNSC',
		description: '',
		topics: [],
		level: 'advanced',
		room: null,
		...changes
	};
}

/** One `seats` row with its committee embedded, the shape `readSeatLabel` asks for. */
function seatLabelRow(changes: Record<string, unknown> = {}) {
	return {
		name: 'France',
		committees: { name: 'Security Council', abbreviation: 'UNSC' },
		...changes
	};
}

describe('listSeatsByCommittee', () => {
	it('asks for the committees, their seat counts, and the free seats', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				committees: [[committeeRow()]],
				public_seats: [[{ committee_id: 'committee-1', is_taken: false }]],
				seats: [[allocatableSeatRow({ committee_id: 'committee-1' })]]
			}
		});

		await listSeatsByCommittee(supabase, 'conference-1');

		// `listCommitteesWithSeatCounts` and `listFreeSeats` run side by side, so
		// the order the three land in is not worth pinning down, only that all
		// three are asked for. The seats are read in windows, and the empty one that
		// ends the list is a second query to the same relation.
		const tables = [...new Set(tablesRead(queries))].sort();
		expect(tables).toEqual(['committees', 'public_seats', 'seats']);
	});

	it('groups the free seats under their committee in the committees’ own order, and drops one with none left', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				committees: [
					[
						committeeRow(),
						committeeRow({
							id: 'committee-2',
							slug: 'hrc',
							name: 'Human Rights Council',
							abbreviation: 'HRC'
						})
					]
				],
				public_seats: [[]],
				// Only committee-1 has a free seat, so committee-2 should not appear at all.
				seats: [[allocatableSeatRow({ id: 'seat-free-1', committee_id: 'committee-1' })]]
			}
		});

		const groups = await listSeatsByCommittee(supabase, 'conference-1');

		expect(groups).toEqual([
			{
				committeeId: 'committee-1',
				committeeLabel: 'UNSC',
				seats: [
					{
						id: 'seat-free-1',
						committeeId: 'committee-1',
						name: 'France',
						countryCode: 'FR',
						isAvailable: true,
						delegationId: null,
						userId: null
					}
				]
			}
		]);
	});

	it('puts the committees an applicant asked for first, in their own order', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				committees: [
					[
						committeeRow(),
						committeeRow({
							id: 'committee-2',
							slug: 'hrc',
							name: 'Human Rights Council',
							abbreviation: 'HRC'
						})
					]
				],
				public_seats: [[]],
				seats: [
					[
						allocatableSeatRow({ id: 'seat-unsc', committee_id: 'committee-1' }),
						allocatableSeatRow({ id: 'seat-hrc', committee_id: 'committee-2' })
					]
				]
			}
		});

		const groups = await listSeatsByCommittee(supabase, 'conference-1', ['committee-2']);

		expect(groups.map((group) => group.committeeLabel)).toEqual(['HRC', 'UNSC']);
	});

	it('answers with no groups when the conference has no committee yet', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { committees: [[]], seats: [[allocatableSeatRow()]] }
		});

		expect(await listSeatsByCommittee(supabase, 'conference-1')).toEqual([]);
		// Nothing to count seats for, so the second committees query is never sent.
		expect(queries.some((query) => query.table === 'public_seats')).toBe(false);
	});
});

describe('allocateDelegationSeats', () => {
	it('hands the delegation and every ticked seat to the database function', async () => {
		const { supabase, rpcCalls } = createStandInSupabase();

		await allocateDelegationSeats(supabase, 'delegation-1', ['seat-1', 'seat-2']);

		expect(rpcCalls).toEqual([
			[
				'allocate_delegation_seats',
				{ delegation_id: 'delegation-1', seat_ids: ['seat-1', 'seat-2'] }
			]
		]);
	});

	it("passes the database's own message on, because the allocate action names the seat from it", async () => {
		const { supabase } = createStandInSupabase({
			rpcError: 'One of those seats is taken, hidden, or not part of this conference'
		});

		await expect(allocateDelegationSeats(supabase, 'delegation-1', ['seat-1'])).rejects.toThrow(
			'One of those seats is taken, hidden, or not part of this conference'
		);
	});
});

describe('readSeatLabel', () => {
	it('asks for the seat by id and by its conference together', async () => {
		const { supabase, queries } = createStandInSupabase({ rows: { seats: [[seatLabelRow()]] } });

		await readSeatLabel(supabase, 'conference-1', 'seat-1');

		expect(queryOn(queries, 'seats').eq).toEqual([
			['id', 'seat-1'],
			['committees.conference_id', 'conference-1']
		]);
	});

	it('names a seat "committee · seat", the abbreviation first', async () => {
		const { supabase } = createStandInSupabase({ rows: { seats: [[seatLabelRow()]] } });

		expect(await readSeatLabel(supabase, 'conference-1', 'seat-1')).toBe('UNSC · France');
	});

	it('falls back to the committee’s full name when it has no abbreviation', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				seats: [[seatLabelRow({ committees: { name: 'Security Council', abbreviation: null } })]]
			}
		});

		expect(await readSeatLabel(supabase, 'conference-1', 'seat-1')).toBe(
			'Security Council · France'
		);
	});

	it('answers with null when the id names no seat of this conference', async () => {
		const { supabase } = createStandInSupabase();

		expect(await readSeatLabel(supabase, 'conference-1', 'seat-1')).toBeNull();
	});

	it('raises when the seat cannot be read', async () => {
		const { supabase } = createStandInSupabase({ errors: { seats: 'connection closed' } });

		await expect(readSeatLabel(supabase, 'conference-1', 'seat-1')).rejects.toThrow(
			'Could not read the seat'
		);
	});
});
