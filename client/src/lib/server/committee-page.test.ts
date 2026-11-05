import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCommitteePage } from './committee-page';

// These tests are about the decisions this module makes: which relation it
// reads a seat list out of and why, what it counts, and what it tells the page
// the reader is allowed to see. Nothing here talks to a database; the stand-in
// client below writes down what it was asked for and answers with fixed rows.
// Whether the database really lets a reader see those rows is Row Level
// Security's decision, and that is tested in `tests/db/`.

/** The two relations a seat list can come out of. Which one is the point of half these tests. */
const SEATS_TABLE = 'seats';
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
	/**
	 * What each permission question answers, by the permission asked about,
	 * such as `run_room`. One not named here answers `false`.
	 */
	helpers?: Record<string, boolean>;
	/** The permissions whose question fails instead of answering. */
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
			const permission = String(helperArguments.permission);

			if (answers.failingHelpers?.includes(permission)) {
				return { data: null, error: { message: 'permission denied' } };
			}

			return { data: answers.helpers?.[permission] ?? false, error: null };
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

/**
 * One row of the conference view, cut down to the columns these tests read.
 * `getConferenceBySlug` has a test of its own next to it for the rest.
 */
function conferenceRow() {
	return {
		id: 'conference-1',
		slug: 'thimun-2027',
		name: 'THIMUN The Hague 2027',
		country_code: 'NL',
		start_time: null,
		end_time: null,
		website_url: null,
		organization_name: 'THIMUN Foundation',
		organization_slug: 'thimun-foundation',
		// The conference's committees arrive as a list of rows from another table.
		committees: [
			{ name: 'Security Council', abbreviation: 'UNSC', position: 1 },
			{ name: 'General Assembly', abbreviation: null, position: 2 }
		]
	};
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

/** One row of the `seats` table, which only the people inside the conference may read. */
function seatRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'seat-1',
		name: 'France',
		kind: 'country',
		country_code: 'FR',
		position: 0,
		is_available: true,
		user_id: null,
		...changes
	};
}

/** The answers a committee page needs before a test changes the part it is about. */
function pageAnswers(changes: StandInAnswers = {}): StandInAnswers {
	return {
		...changes,
		rows: {
			conferences_with_organization: [conferenceRow()],
			committees: [committeeRow('committee-1', 'unsc')],
			...changes.rows
		}
	};
}

describe('getCommitteePage', () => {
	it('answers with nothing when there is no such conference', async () => {
		const { supabase, calls } = createStandInSupabase();

		expect(await getCommitteePage(supabase, 'no-such-conference', 'unsc', null)).toBeNull();
		// It stops at the conference rather than going on to look for a committee
		// inside one that is not there.
		expect(tablesRead(calls)).toEqual(['conferences_with_organization']);
	});

	it('answers with nothing when the conference has no committee with that slug', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: { conferences_with_organization: [conferenceRow()] }
		});

		// This is the "unknown slug pair" the page turns into a 404.
		expect(await getCommitteePage(supabase, 'thimun-2027', 'no-such-committee', null)).toBeNull();
		expect(queryOn(calls, 'committees').eq).toEqual([
			['conference_id', 'conference-1'],
			['slug', 'no-such-committee']
		]);
	});

	it('reads the view and shows no names at all to a signed-out visitor', async () => {
		const { supabase, calls } = createStandInSupabase(
			pageAnswers({
				rows: {
					public_seats: [
						{
							id: 'seat-1',
							name: 'France',
							kind: 'country',
							country_code: 'FR',
							position: 0,
							is_taken: true
						}
					]
				}
			})
		);

		const page = await getCommitteePage(supabase, 'thimun-2027', 'unsc', null);

		// The view has no `user_id` in it, so a visitor sees that a seat is taken
		// without seeing by whom.
		expect(tablesRead(calls)).toContain(PUBLIC_SEATS_VIEW);
		expect(tablesRead(calls)).not.toContain(SEATS_TABLE);
		expect(page?.viewer.canSeeSeatHolders).toBe(false);
		expect(page?.seats[0].isTaken).toBe(true);
		expect(page?.seats[0].holderName).toBeNull();
		// A picture would name them as surely as their name would.
		expect(page?.seats[0].holderAvatarPath).toBeNull();
	});

	it('asks the database nothing about a signed-out visitor', async () => {
		const { supabase, calls } = createStandInSupabase(pageAnswers());

		await getCommitteePage(supabase, 'thimun-2027', 'unsc', null);

		// Both helpers are granted to signed-in readers only, so asking them here
		// would fail rather than answer "no".
		expect(calls.helpers).toEqual([]);
	});

	it('reads the table and shows the delegates to somebody inside the committee', async () => {
		const { supabase, calls } = createStandInSupabase(
			pageAnswers({
				rows: {
					seats: [
						seatRow({ id: 'seat-1', user_id: 'user-1' }),
						seatRow({ id: 'seat-2', name: 'China', country_code: 'CN', position: 1 })
					],
					profiles: [{ id: 'user-1', full_name: 'Daniel Park', avatar_path: 'avatars/daniel.jpg' }]
				}
			})
		);

		const page = await getCommitteePage(supabase, 'thimun-2027', 'unsc', 'user-2');

		// Rows came back from `seats` itself, which only a delegate of this
		// committee or the conference's staff may read, so the names may show.
		expect(queryOn(calls, SEATS_TABLE).order).toEqual([['position', true]]);
		expect(page?.viewer.canSeeSeatHolders).toBe(true);
		expect(page?.seats[0].holderName).toBe('Daniel Park');
		// The picture comes along with the name, so the seat row shows the same
		// `Avatar` the chairs above it have rather than initials for everybody.
		expect(page?.seats[0].holderAvatarPath).toBe('avatars/daniel.jpg');
		// A free seat has nobody to name.
		expect(page?.seats[1].isTaken).toBe(false);
		expect(page?.seats[1].holderName).toBeNull();
		expect(page?.seats[1].holderAvatarPath).toBeNull();
	});

	it('never shows a seat the organiser is not offering, whoever is reading', async () => {
		const { supabase } = createStandInSupabase(
			pageAnswers({
				rows: {
					seats: [
						seatRow({ id: 'seat-1' }),
						seatRow({ id: 'seat-2', name: 'China', position: 1, is_available: false })
					]
				}
			})
		);

		const page = await getCommitteePage(supabase, 'thimun-2027', 'unsc', 'user-1');

		// `public_seats` leaves a hidden seat out, and the table must not put it
		// back in for the people who can read the table.
		expect(page?.seats.map((seat) => seat.id)).toEqual(['seat-1']);
	});

	it('points the reader at their own seat', async () => {
		const { supabase } = createStandInSupabase(
			pageAnswers({
				rows: {
					seats: [
						seatRow({ id: 'seat-1', user_id: 'user-1' }),
						seatRow({ id: 'seat-2', name: 'China', position: 1, user_id: 'user-2' })
					],
					profiles: [
						{ id: 'user-1', full_name: 'Daniel Park' },
						{ id: 'user-2', full_name: 'Ana Bauer' }
					]
				}
			})
		);

		const page = await getCommitteePage(supabase, 'thimun-2027', 'unsc', 'user-2');

		expect(page?.viewer.mySeatId).toBe('seat-2');
	});

	it('falls back to the view when a signed-in reader is not in the committee', async () => {
		const { supabase, calls } = createStandInSupabase(
			pageAnswers({
				rows: {
					public_seats: [
						{
							id: 'seat-1',
							name: 'France',
							kind: 'country',
							country_code: 'FR',
							position: 0,
							is_taken: false
						}
					]
				},
				errors: { seats: 'permission denied for table seats' }
			})
		);

		const page = await getCommitteePage(supabase, 'thimun-2027', 'unsc', 'user-9');

		// Being turned away by the seats policy is the ordinary case for a signed-in
		// reader who is neither a delegate here nor on the team, not a fault.
		expect(tablesRead(calls)).toContain(PUBLIC_SEATS_VIEW);
		expect(page?.viewer.canSeeSeatHolders).toBe(false);
		expect(page?.viewer.mySeatId).toBeNull();
	});

	it('asks whether the reader runs the room and edits the committee', async () => {
		const { supabase, calls } = createStandInSupabase(pageAnswers({ helpers: { run_room: true } }));

		const page = await getCommitteePage(supabase, 'thimun-2027', 'unsc', 'user-1');

		expect(calls.helpers).toContainEqual([
			'has_committee_permission',
			{ committee_id: 'committee-1', permission: 'manage_committees' }
		]);
		expect(calls.helpers).toContainEqual([
			'has_committee_permission',
			{ committee_id: 'committee-1', permission: 'run_room' }
		]);
		expect(page?.viewer.isChair).toBe(true);
		expect(page?.viewer.canManage).toBe(false);
	});

	it('answers "no" rather than failing when a permission helper cannot be asked', async () => {
		const { supabase } = createStandInSupabase(
			pageAnswers({ failingHelpers: ['manage_committees', 'run_room'] })
		);

		const page = await getCommitteePage(supabase, 'thimun-2027', 'unsc', 'user-1');

		// Hiding a link the reader might have had is much better than answering
		// the whole page with an error.
		expect(page?.viewer).toMatchObject({ canManage: false, isChair: false });
	});

	it('gives no position paper status to a reader with no seat here to have one', async () => {
		const { supabase, calls } = createStandInSupabase(
			pageAnswers({ rows: { seats: [seatRow({ id: 'seat-1', user_id: 'user-1' })] } })
		);

		const page = await getCommitteePage(supabase, 'thimun-2027', 'unsc', 'user-9');

		expect(page?.viewer.myPaperStatus).toBeNull();
		// Nothing here to ask `documents` about, so it is never queried at all.
		expect(tablesRead(calls)).not.toContain('documents');
	});

	it("reports 'missing' for a seated reader who has not uploaded a paper", async () => {
		const { supabase, calls } = createStandInSupabase(
			pageAnswers({ rows: { seats: [seatRow({ id: 'seat-1', user_id: 'user-1' })] } })
		);

		const page = await getCommitteePage(supabase, 'thimun-2027', 'unsc', 'user-1');

		expect(page?.viewer.myPaperStatus).toBe('missing');
		expect(queryOn(calls, 'documents').eq).toEqual([
			['seat_id', 'seat-1'],
			['kind', 'position_paper']
		]);
	});

	it("carries the reader's own paper's review status", async () => {
		const { supabase } = createStandInSupabase(
			pageAnswers({
				rows: {
					seats: [seatRow({ id: 'seat-1', user_id: 'user-1' })],
					documents: [{ review_status: 'changes_requested' }]
				}
			})
		);

		const page = await getCommitteePage(supabase, 'thimun-2027', 'unsc', 'user-1');

		expect(page?.viewer.myPaperStatus).toBe('changes_requested');
	});
});
