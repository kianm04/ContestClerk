import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GridSeat } from '$lib/allocation';
import {
	freeSeat,
	hasPaidInvoiceForSeat,
	listSeatsWithHolders,
	listUnseatedAcceptedDelegations,
	moveDelegate,
	removeDelegationSeat,
	revokeSeat,
	swapDelegates
} from './allocation-grid';
import { removeOrphanedDocumentFiles } from './orphaned-document-files';

// Emptying a seat ends by removing the position paper's file, which talks to
// Storage with the service role key. These tests only check that it is asked
// for, so it is replaced with a stand-in that does nothing.
vi.mock('./orphaned-document-files', () => ({ removeOrphanedDocumentFiles: vi.fn() }));

// These tests are about `/manage/[slug]/allocation`'s module: the shape of the
// requests the grid sends and what it makes of the rows. Nothing here talks to
// a database; the stand-in client below writes down what it was asked for and
// answers with fixed rows. Whether the database would let an organiser send
// them is decided in `tests/db/`, and `tests/db/allocation.test.ts` reads the
// grid's changes back out of a real one.

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

/** One `seats` row as the grid asks for it, committee and delegation embedded. */
function gridSeatRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'seat-1',
		committee_id: 'committee-1',
		name: 'France',
		country_code: 'FR',
		is_available: true,
		user_id: null,
		delegation_id: null,
		application_id: null,
		committees: {
			conference_id: 'conference-1',
			id: 'committee-1',
			name: 'Security Council',
			abbreviation: 'UNSC',
			position: 0
		},
		delegations: null,
		...changes
	};
}

/** This many grid rows, each its own seat with its own id and name. */
function manyGridSeatRows(count: number) {
	return Array.from({ length: count }, (_, index) =>
		gridSeatRow({ id: `seat-${index}`, name: `Seat ${index}` })
	);
}

describe('listSeatsWithHolders', () => {
	it('asks for one conference, in the order the grid draws it', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { seats: [[gridSeatRow()]] }
		});

		await listSeatsWithHolders(supabase, 'conference-1');

		// `seats` has no conference of its own, so the committee is the way to ask,
		// and without the `!inner` the filter on it would not narrow which seats
		// come back.
		expect(queryOn(queries, 'seats').columns).toContain('committees!inner(');
		expect(queryOn(queries, 'seats').columns).toContain('delegations(name)');
		expect(queryOn(queries, 'seats').eq).toEqual([['committees.conference_id', 'conference-1']]);
		// The committee's own order first, so the columns come out the way the
		// organiser arranged them, then the seat's place in its committee, then the
		// name to settle two seats sharing a position, and the id last so that two
		// committees sharing a position cannot make the windows disagree.
		expect(queryOn(queries, 'seats').order).toEqual([
			['committees(position)', true],
			['position', true],
			['name', true],
			['id', true]
		]);
		expect(queryOn(queries, 'seats').range).toEqual([0, 499]);
	});

	it('reads every seat of a conference with more than a thousand of them', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { seats: [manyGridSeatRows(1200)] },
			maxRows: 1000
		});

		const seats = await listSeatsWithHolders(supabase, 'conference-1');

		// One query would have stopped at `max_rows`, and the counts at the top
		// of the grid would have been wrong. Windows of 500 reach all 1200, and
		// the fourth one, starting past the end, is what says there are no more.
		expect(seats).toHaveLength(1200);
		expect(seats[1199].id).toBe('seat-1199');
		expect(queries.map((query) => query.range)).toEqual([
			[0, 499],
			[500, 999],
			[1000, 1499],
			[1200, 1699]
		]);
	});

	it('moves the window by the rows that came back, not by the rows it asked for', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { seats: [manyGridSeatRows(450)] },
			maxRows: 200
		});

		const seats = await listSeatsWithHolders(supabase, 'conference-1');

		// With `max_rows` below the window, stepping 500 at a time would skip rows
		// 200 to 499 and nobody would be told.
		expect(seats).toHaveLength(450);
		expect(queries.map((query) => query.range)).toEqual([
			[0, 499],
			[200, 699],
			[400, 899],
			[450, 949]
		]);
	});

	it('reads a window past the last row as the end of the seats', async () => {
		const { supabase } = createStandInSupabase({
			errors: { seats: 'Requested range not satisfiable' },
			errorCodes: { seats: 'PGRST103' }
		});

		// PostgREST answers a window starting past the end with this code rather
		// than with no rows, and it is not a fault.
		await expect(listSeatsWithHolders(supabase, 'conference-1')).resolves.toEqual([]);
	});

	it("looks the delegates' profiles up a hundred at a time", async () => {
		const filledRows = manyGridSeatRows(250).map((row, index) => ({
			...row,
			user_id: `user-${index}`
		}));
		const profileRows = filledRows.map((row, index) => ({
			id: row.user_id,
			full_name: `Delegate ${index}`,
			avatar_path: null,
			country_code: null,
			institution_name: null
		}));
		const { supabase, queries } = createStandInSupabase({
			rows: {
				seats: [filledRows],
				profiles: [profileRows.slice(0, 100), profileRows.slice(100, 200), profileRows.slice(200)]
			}
		});

		const seats = await listSeatsWithHolders(supabase, 'conference-1');

		const profileLookups = queries.filter((query) => query.table === 'profiles');

		expect(profileLookups.map((query) => query.in[0][1].length)).toEqual([100, 100, 50]);
		expect(seats[0].holderName).toBe('Delegate 0');
		expect(seats[249].holderName).toBe('Delegate 249');
	});

	it("brings the delegate's name, picture, country and school along with a filled seat", async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				seats: [[gridSeatRow({ user_id: 'user-1', application_id: 'application-1' })]],
				profiles: [
					[
						{
							id: 'user-1',
							full_name: 'Anna Kowalski',
							avatar_path: 'avatars/anna.png',
							country_code: 'PL',
							institution_name: 'Liceum Batorego'
						}
					]
				]
			}
		});

		const seats = await listSeatsWithHolders(supabase, 'conference-1');

		// The name is a second query, because `seats.user_id` points at
		// `auth.users` and PostgREST can only bring along a table a foreign key
		// names.
		expect(queryOn(queries, 'profiles').in).toEqual([['id', ['user-1']]]);
		expect(seats).toEqual([
			{
				id: 'seat-1',
				committeeId: 'committee-1',
				name: 'France',
				countryCode: 'FR',
				isAvailable: true,
				delegationId: null,
				userId: 'user-1',
				applicationId: 'application-1',
				committee: { id: 'committee-1', name: 'Security Council', abbreviation: 'UNSC' },
				holderName: 'Anna Kowalski',
				holderAvatarPath: 'avatars/anna.png',
				holderCountryCode: 'PL',
				holderInstitution: 'Liceum Batorego',
				delegationName: null
			}
		]);
	});

	it('names the delegation of a reserved seat and leaves the holder empty', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				seats: [
					[
						gridSeatRow({
							delegation_id: 'delegation-1',
							delegations: { name: 'Lycée Français' }
						})
					]
				]
			}
		});

		const seats = await listSeatsWithHolders(supabase, 'conference-1');

		// The delegation can be embedded, because `seats.delegation_id` really is a
		// foreign key naming `delegations`.
		expect(seats[0].delegationName).toBe('Lycée Français');
		expect(seats[0].delegationId).toBe('delegation-1');
		expect(seats[0].holderName).toBeNull();
	});

	it('asks nothing of profiles when nobody is sitting anywhere', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { seats: [[gridSeatRow(), gridSeatRow({ id: 'seat-2', name: 'China' })]] }
		});

		await listSeatsWithHolders(supabase, 'conference-1');

		// Nobody to look up, and `.in('id', [])` would be a pointless request. The
		// second `seats` query is the window after the last row, which comes back
		// empty and ends the read.
		expect(tablesRead(queries)).toEqual(['seats', 'seats']);
	});

	it("leaves the holder's name empty when their profile is missing", async () => {
		const { supabase } = createStandInSupabase({
			rows: { seats: [[gridSeatRow({ user_id: 'user-1' })]], profiles: [[]] }
		});

		const seats = await listSeatsWithHolders(supabase, 'conference-1');

		// An account made before the `handle_new_user` trigger existed has no
		// profile row. The seat is still filled, and the grid must not colour it
		// free.
		expect(seats[0].userId).toBe('user-1');
		expect(seats[0].holderName).toBeNull();
		expect(seats[0].holderAvatarPath).toBeNull();
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { seats: 'connection closed' } });

		await expect(listSeatsWithHolders(supabase, 'conference-1')).rejects.toThrow(
			'Could not read the seats: connection closed'
		);
	});
});

/** One accepted `delegations` row with the seats reserved for it embedded. */
function acceptedDelegationRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'delegation-1',
		name: 'Lycée Français',
		country_code: 'FR',
		requested_seats: 5,
		seats: [{ id: 'seat-1' }, { id: 'seat-2' }],
		...changes
	};
}

describe('listUnseatedAcceptedDelegations', () => {
	it('keeps only the accepted delegations that are still short', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				delegations: [
					[
						acceptedDelegationRow(),
						acceptedDelegationRow({
							id: 'delegation-2',
							name: "St Mary's College",
							requested_seats: 2
						}),
						acceptedDelegationRow({
							id: 'delegation-3',
							name: 'Colegio Bolívar',
							requested_seats: 1
						})
					]
				]
			}
		});

		const unseated = await listUnseatedAcceptedDelegations(supabase, 'conference-1');

		expect(queryOn(queries, 'delegations').eq).toEqual([
			['conference_id', 'conference-1'],
			['status', 'accepted']
		]);
		// The id settles two delegations sharing a name, so the windows line up.
		expect(queryOn(queries, 'delegations').order).toEqual([
			['name', true],
			['id', true]
		]);
		expect(queryOn(queries, 'delegations').range).toEqual([0, 499]);
		// A request is a wish and not a limit, so the group given exactly as many
		// seats as it asked for and the one given more are both seated enough.
		expect(unseated).toEqual([
			{
				id: 'delegation-1',
				name: 'Lycée Français',
				countryCode: 'FR',
				requestedSeats: 5,
				allocatedSeats: 2
			}
		]);
	});

	it('finds a short delegation that sorts after the thousandth', async () => {
		const seatedEnough = Array.from({ length: 1100 }, (_, index) =>
			acceptedDelegationRow({
				id: `delegation-${index}`,
				name: `Delegation ${index}`,
				requested_seats: 2
			})
		);
		seatedEnough[1099] = acceptedDelegationRow({ id: 'delegation-last', requested_seats: 3 });
		const { supabase } = createStandInSupabase({
			rows: { delegations: [seatedEnough] },
			maxRows: 1000
		});

		const unseated = await listUnseatedAcceptedDelegations(supabase, 'conference-1');

		// One query would have stopped at `max_rows` and the warning would have
		// said nothing about this delegation.
		expect(unseated.map((delegation) => delegation.id)).toEqual(['delegation-last']);
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { delegations: 'connection closed' } });

		await expect(listUnseatedAcceptedDelegations(supabase, 'conference-1')).rejects.toThrow(
			'Could not read the accepted delegations: connection closed'
		);
	});
});

describe('hasPaidInvoiceForSeat', () => {
	it('answers yes when a paid invoice for the seat comes back', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { invoices: [[{ id: 'invoice-1' }]] }
		});

		expect(await hasPaidInvoiceForSeat(supabase, 'seat-1')).toBe(true);
		expect(queryOn(queries, 'invoices').eq).toEqual([
			['seat_id', 'seat-1'],
			['status', 'paid']
		]);
		// One row is enough to answer the question.
		expect(queryOn(queries, 'invoices').limit).toEqual([1]);
	});

	it('answers no when there is no paid invoice for the seat', async () => {
		const { supabase } = createStandInSupabase();

		expect(await hasPaidInvoiceForSeat(supabase, 'seat-1')).toBe(false);
	});
});

describe('revokeSeat', () => {
	it('hands the seat to the database function', async () => {
		const { supabase, rpcCalls } = createStandInSupabase();

		await revokeSeat(supabase, 'seat-1');

		expect(rpcCalls).toEqual([['revoke_seat', { seat_id: 'seat-1' }]]);
	});

	it('then removes the file of the position paper revoke_seat deleted', async () => {
		vi.mocked(removeOrphanedDocumentFiles).mockClear();
		const { supabase } = createStandInSupabase();

		await revokeSeat(supabase, 'seat-1');

		expect(removeOrphanedDocumentFiles).toHaveBeenCalledOnce();
	});

	it("passes the database's own message on, because the page shows it", async () => {
		vi.mocked(removeOrphanedDocumentFiles).mockClear();
		const { supabase } = createStandInSupabase({ rpcError: 'Nobody is sitting in that seat' });

		await expect(revokeSeat(supabase, 'seat-1')).rejects.toThrow('Nobody is sitting in that seat');
		expect(removeOrphanedDocumentFiles).not.toHaveBeenCalled();
	});
});

describe('removeDelegationSeat', () => {
	it('hands the seat to the database function', async () => {
		const { supabase, rpcCalls } = createStandInSupabase();

		await removeDelegationSeat(supabase, 'seat-1');

		expect(rpcCalls).toEqual([['remove_delegation_seat', { seat_id: 'seat-1' }]]);
	});

	it("passes the database's own message on, because the page shows it", async () => {
		const { supabase } = createStandInSupabase({
			rpcError: 'Somebody is sitting in that seat. Revoke it instead.'
		});

		await expect(removeDelegationSeat(supabase, 'seat-1')).rejects.toThrow(
			'Somebody is sitting in that seat. Revoke it instead.'
		);
	});
});

describe('moveDelegate', () => {
	it('hands both seats to the database function, the one moved from first', async () => {
		const { supabase, rpcCalls } = createStandInSupabase();

		await moveDelegate(supabase, 'seat-1', 'seat-2');

		expect(rpcCalls).toEqual([['move_delegate', { from_seat_id: 'seat-1', to_seat_id: 'seat-2' }]]);
	});

	it("passes the database's own message on, because the page shows it", async () => {
		const { supabase } = createStandInSupabase({ rpcError: 'That seat is not free' });

		// Somebody else took the seat while the organiser had the move panel open.
		await expect(moveDelegate(supabase, 'seat-1', 'seat-2')).rejects.toThrow(
			'That seat is not free'
		);
	});
});

describe('swapDelegates', () => {
	it('hands both seats to the database function, the dragged one first', async () => {
		const { supabase, rpcCalls } = createStandInSupabase();

		await swapDelegates(supabase, 'seat-1', 'seat-2');

		expect(rpcCalls).toEqual([
			['swap_delegates', { first_seat_id: 'seat-1', second_seat_id: 'seat-2' }]
		]);
	});

	it("passes the database's own message on, because the page matches it", async () => {
		const { supabase } = createStandInSupabase({ rpcError: 'Nobody is sitting in that seat' });

		await expect(swapDelegates(supabase, 'seat-1', 'seat-2')).rejects.toThrow(
			'Nobody is sitting in that seat'
		);
	});
});

/** One seat as the grid hands it to `freeSeat`. */
function gridSeat(changes: Partial<GridSeat> = {}): GridSeat {
	return {
		id: 'seat-1',
		committeeId: 'committee-1',
		name: 'France',
		countryCode: 'FR',
		isAvailable: true,
		delegationId: null,
		userId: null,
		applicationId: null,
		committee: { id: 'committee-1', name: 'Security Council', abbreviation: 'UNSC' },
		holderName: null,
		holderAvatarPath: null,
		holderCountryCode: null,
		holderInstitution: null,
		delegationName: null,
		...changes
	};
}

describe('freeSeat', () => {
	it("revokes an individual's seat and notes why on their application", async () => {
		const { supabase, queries, rpcCalls } = createStandInSupabase();

		await freeSeat(supabase, gridSeat({ userId: 'user-1', applicationId: 'application-1' }));

		expect(rpcCalls).toEqual([['revoke_seat', { seat_id: 'seat-1' }]]);
		// `revoke_seat` rejects the application but writes no note, so the words
		// `05-pages/organiser/allocation.md` asks for are a second write from here.
		// The id comes off the seat that was handed in, because the function has
		// already set `seats.application_id` to null by now.
		expect(queryOn(queries, 'applications').updated).toEqual({
			decision_note: 'Seat released by the organisers'
		});
		expect(queryOn(queries, 'applications').eq).toEqual([['id', 'application-1']]);
	});

	it("revokes a delegation member's seat, and has no application to note it on", async () => {
		const { supabase, queries, rpcCalls } = createStandInSupabase();

		await freeSeat(supabase, gridSeat({ userId: 'user-1', delegationId: 'delegation-1' }));

		// `revoke_seat` keeps `delegation_id`, so the seat stays reserved for the
		// group and its head can put somebody else in it.
		expect(rpcCalls).toEqual([['revoke_seat', { seat_id: 'seat-1' }]]);
		// The member sits there through the delegation, not through an application
		// of their own, so there is nothing to write a note on.
		expect(tablesRead(queries)).toEqual([]);
	});

	it('takes the reservation off a seat nobody is sitting in', async () => {
		const { supabase, rpcCalls } = createStandInSupabase();

		await freeSeat(supabase, gridSeat({ delegationId: 'delegation-1' }));

		// Giving a seat back is a decision about a count rather than about a
		// person, which is why it is the other database function.
		expect(rpcCalls).toEqual([['remove_delegation_seat', { seat_id: 'seat-1' }]]);
	});

	it('refuses a seat that is already empty', async () => {
		const { supabase, rpcCalls } = createStandInSupabase();

		await expect(freeSeat(supabase, gridSeat())).rejects.toThrow('This seat is already free.');
		expect(rpcCalls).toEqual([]);
	});

	it('does not raise when the note could not be written', async () => {
		const { supabase } = createStandInSupabase({ errors: { applications: 'permission denied' } });
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

		// The seat is free by then, which is what the organiser asked for, so a
		// failed courtesy is logged rather than thrown back at them.
		await expect(
			freeSeat(supabase, gridSeat({ userId: 'user-1', applicationId: 'application-1' }))
		).resolves.toBeUndefined();
		expect(logged).toHaveBeenCalledOnce();
		expect(logged.mock.calls[0][0]).toContain('permission denied');

		logged.mockRestore();
	});
});
