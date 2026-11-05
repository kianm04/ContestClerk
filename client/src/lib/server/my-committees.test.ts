import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MyCommitteeRow } from '$lib/committees';
import { listMyCommittees } from './my-committees';

// These tests are about the decisions `listMyCommittees` makes: which relations
// it reads and with what conditions, which rows it leaves out, and which event
// and which live room end up on each card. Putting the two lists in one order
// and dropping the conferences that are over are `mergeMyCommittees` and
// `withoutFinishedConferences` in `$lib/committees.ts`, which have tests of
// their own beside them.
//
// Nothing here talks to a database; the stand-in client below writes down what
// it was asked for and answers with fixed rows. Whether the database really lets
// a reader see those rows is Row Level Security's decision, and that is tested
// in `tests/db/`.

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

/** The moment every test below treats as "now". The page passes the real clock in. */
const NOW = new Date('2026-03-01T09:00:00Z');

/** One `conferences` row, as both committee lookups bring it along. */
function myConferenceRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'conference-1',
		slug: 'delftmun-2026',
		name: 'DelftMUN 2026',
		start_date: '2026-05-01',
		end_date: '2026-05-03',
		timezone: 'Europe/Amsterdam',
		status: 'published',
		...changes
	};
}

/** One embedded `committees` row, with the conference it belongs to attached. */
function myCommitteeRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'committee-1',
		slug: 'unsc',
		name: 'United Nations Security Council',
		abbreviation: 'UNSC',
		room: 'Room 1',
		position: 0,
		conferences: myConferenceRow(),
		...changes
	};
}

/** The second committee of the same conference, for the tests that need two cards. */
function mySecondCommitteeRow() {
	return myCommitteeRow({
		id: 'committee-2',
		slug: 'ecofin',
		name: 'Economic and Financial Committee',
		abbreviation: 'ECOFIN',
		position: 1
	});
}

/** One `seats` row of the person whose committees are being listed. */
function mySeatRow(changes: Record<string, unknown> = {}) {
	return {
		name: 'France',
		country_code: 'FR',
		committees: myCommitteeRow(),
		...changes
	};
}

/** One `committee_chairs` row. The lookup reads nothing of it but the committee. */
function myChairRow(committee: Record<string, unknown> | null) {
	return { committees: committee };
}

/** One `schedule_events` row of a committee's own programme. */
function myEventRow(changes: Record<string, unknown> = {}) {
	return {
		committee_id: 'committee-1',
		title: 'Session I',
		starts_at: '2026-05-01T08:30:00Z',
		ends_at: '2026-05-01T10:00:00Z',
		...changes
	};
}

/**
 * The card of one committee in the answer.
 *
 * Tests look a row up by its committee rather than by where it is in the list,
 * so that the order `mergeMyCommittees` puts the cards in is only ever asserted
 * where that is the point.
 */
function cardFor(rows: MyCommitteeRow[], committeeId: string): MyCommitteeRow {
	const row = rows.find((candidate) => candidate.committee.id === committeeId);

	if (!row) {
		throw new Error(`"${committeeId}" is not in the answer`);
	}

	return row;
}

describe('listMyCommittees', () => {
	it('reads the seats, the chair roles, the programme and the live rooms', async () => {
		const { supabase, calls } = createStandInSupabase({ rows: { seats: [mySeatRow()] } });

		await listMyCommittees(supabase, 'user-1', NOW, false);

		expect(tablesRead(calls)).toEqual([
			'seats',
			'committee_chairs',
			'schedule_events',
			'committee_state'
		]);
		// Both roles are asked about this person and nobody else.
		expect(queryOn(calls, 'seats').eq).toEqual([['user_id', 'user-1']]);
		expect(queryOn(calls, 'committee_chairs').eq).toEqual([['user_id', 'user-1']]);
	});

	it('asks each committee for its own soonest event, and only for one still to come', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: { seats: [mySeatRow(), mySeatRow({ committees: mySecondCommitteeRow() })] }
		});

		await listMyCommittees(supabase, 'user-1', NOW, false);

		const eventQueries = calls.queries.filter((query) => query.table === 'schedule_events');

		// One request per committee, each asking for a single row, so no answer
		// can ever be long enough for `max_rows` to cut it short.
		expect(eventQueries).toHaveLength(2);

		for (const [index, committeeId] of ['committee-1', 'committee-2'].entries()) {
			const events = eventQueries[index];

			// An opening ceremony the whole conference is invited to belongs on the
			// schedule page, not on a committee's card.
			expect(events.eq).toEqual([
				['committee_id', committeeId],
				['audience', 'committee']
			]);
			// "Next" means next: an event that has already begun is not offered.
			expect(events.gte).toEqual([['starts_at', NOW.toISOString()]]);
			// Soonest first, and only the first, is what makes the row the next one.
			expect(events.order).toEqual([['starts_at', true]]);
			expect(events.limit).toEqual([1]);
		}
	});

	it('still finds the next event of a committee whose programme starts after a thousand others', async () => {
		// A thousand and one events of the first committee, every one of them
		// sooner than the second committee's first. One query for every
		// committee's programme would have come back cut off at `max_rows`
		// before it reached the second committee.
		const crowdedProgramme = Array.from({ length: STAND_IN_MAX_ROWS + 1 }, (_, index) =>
			myEventRow({ title: `Session ${index + 1}` })
		);
		const { supabase } = createStandInSupabase({
			rows: {
				seats: [mySeatRow(), mySeatRow({ committees: mySecondCommitteeRow() })],
				schedule_events: [
					...crowdedProgramme,
					myEventRow({
						committee_id: 'committee-2',
						title: 'Opening debate',
						starts_at: '2026-05-03T08:30:00Z'
					})
				]
			}
		});

		const rows = await listMyCommittees(supabase, 'user-1', NOW, false);

		expect(cardFor(rows, 'committee-1').nextEvent?.title).toBe('Session 1');
		expect(cardFor(rows, 'committee-2').nextEvent?.title).toBe('Opening debate');
	});

	it('gives a seat its country, and gives a chair no seat at all', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				seats: [mySeatRow()],
				committee_chairs: [myChairRow(mySecondCommitteeRow())]
			}
		});

		const rows = await listMyCommittees(supabase, 'user-1', NOW, false);

		expect(cardFor(rows, 'committee-1').role).toBe('delegate');
		expect(cardFor(rows, 'committee-1').seat).toEqual({ name: 'France', countryCode: 'FR' });
		expect(cardFor(rows, 'committee-2').role).toBe('chair');
		expect(cardFor(rows, 'committee-2').seat).toBeNull();
		// The committee and its conference are named from the embedded rows.
		expect(cardFor(rows, 'committee-1').committee.room).toBe('Room 1');
		expect(cardFor(rows, 'committee-1').conference.name).toBe('DelftMUN 2026');
		expect(cardFor(rows, 'committee-1').conference.isArchived).toBe(false);
	});

	it('leaves out a row whose committee or whose conference was withheld', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				seats: [
					mySeatRow(),
					// Row Level Security withheld the committee of a draft conference.
					mySeatRow({ committees: null }),
					// It withheld the conference on its own, which leaves the card with
					// nothing to link to and no dates to sort by.
					mySeatRow({ committees: myCommitteeRow({ id: 'committee-3', conferences: null }) })
				]
			}
		});

		const rows = await listMyCommittees(supabase, 'user-1', NOW, false);

		expect(rows.map((row) => row.committee.id)).toEqual(['committee-1']);
	});

	it('leaves out a quick session, which /home lists on its own (S14)', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				committee_chairs: [
					myChairRow(
						myCommitteeRow({
							id: 'committee-quick',
							conferences: myConferenceRow({ kind: 'quick_session', status: 'draft' })
						})
					),
					myChairRow(mySecondCommitteeRow())
				]
			}
		});

		const rows = await listMyCommittees(supabase, 'user-1', NOW, true);

		expect(rows.map((row) => row.committee.id)).toEqual(['committee-2']);
	});

	it('hides a finished conference until the reader asks for the past ones', async () => {
		const pastCommittee = myCommitteeRow({
			id: 'committee-2',
			slug: 'ecofin',
			conferences: myConferenceRow({
				id: 'conference-2',
				slug: 'delftmun-2025',
				name: 'DelftMUN 2025',
				start_date: '2025-05-01',
				end_date: '2025-05-03'
			})
		});
		const answers = {
			rows: { seats: [mySeatRow(), mySeatRow({ committees: pastCommittee })] }
		};

		const withoutPast = await listMyCommittees(
			createStandInSupabase(answers).supabase,
			'user-1',
			NOW,
			false
		);
		const withPast = await listMyCommittees(
			createStandInSupabase(answers).supabase,
			'user-1',
			NOW,
			true
		);

		expect(withoutPast.map((row) => row.committee.id)).toEqual(['committee-1']);
		expect(withPast.map((row) => row.committee.id)).toContain('committee-2');
	});

	it('asks nothing about events or live rooms when there is nothing left to show', async () => {
		const { supabase, calls } = createStandInSupabase();

		expect(await listMyCommittees(supabase, 'user-1', NOW, false)).toEqual([]);
		// A committee nobody is in leaves the second pair of queries with no ids to
		// ask about, so neither of them is sent.
		expect(tablesRead(calls)).toEqual(['seats', 'committee_chairs']);
	});

	it('attaches the soonest event of each committee, and nothing to a committee with none', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				seats: [mySeatRow(), mySeatRow({ committees: mySecondCommitteeRow() })],
				// The database hands the rows back soonest first and only as many as
				// `.limit(...)` asks for, which the test above is what checks; this one
				// is about each card getting the one row its own query found.
				schedule_events: [
					myEventRow(),
					myEventRow({ title: 'Session II', starts_at: '2026-05-02T08:30:00Z' })
				]
			}
		});

		const rows = await listMyCommittees(supabase, 'user-1', NOW, false);

		expect(cardFor(rows, 'committee-1').nextEvent).toEqual({
			title: 'Session I',
			startsAt: '2026-05-01T08:30:00Z',
			endsAt: '2026-05-01T10:00:00Z'
		});
		// A committee with nothing left on its programme says nothing rather than
		// borrowing another committee's event.
		expect(cardFor(rows, 'committee-2').nextEvent).toBeNull();
	});

	it('marks a committee live only while its room is running', async () => {
		const { supabase, calls } = createStandInSupabase({
			rows: {
				seats: [mySeatRow(), mySeatRow({ committees: mySecondCommitteeRow() })],
				committee_state: [{ committee_id: 'committee-1' }]
			}
		});

		const rows = await listMyCommittees(supabase, 'user-1', NOW, false);

		// The query asks for the rooms doing anything at all, so whatever comes
		// back is live and a committee that is missing from the answer is not.
		expect(queryOn(calls, 'committee_state').neq).toEqual([['mode', 'idle']]);
		expect(queryOn(calls, 'committee_state').in).toEqual([
			['committee_id', ['committee-1', 'committee-2']]
		]);
		expect(cardFor(rows, 'committee-1').isLive).toBe(true);
		expect(cardFor(rows, 'committee-2').isLive).toBe(false);
	});

	it('raises with the message the database gave when a lookup fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { seats: 'permission denied for table seats' }
		});

		await expect(listMyCommittees(supabase, 'user-1', NOW, false)).rejects.toThrow(
			'permission denied for table seats'
		);

		const second = createStandInSupabase({
			rows: { seats: [mySeatRow()] },
			errors: { schedule_events: 'column schedule_events.starts_at does not exist' }
		});

		await expect(listMyCommittees(second.supabase, 'user-1', NOW, false)).rejects.toThrow(
			'column schedule_events.starts_at does not exist'
		);
	});
});
