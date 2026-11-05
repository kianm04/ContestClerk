import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rejectApplications, waitlistApplications } from './application-bulk-decisions';

// These tests are about the two bulk decisions of the organiser's table: which
// statuses each may move an application out of, what the update writes, and
// how "moved" is told apart from "skipped". Nothing here talks to a database;
// the stand-in client below writes down what it was asked for and answers with
// fixed rows. Whether the database lets an organiser make the change at all is
// tested in `tests/db/applications.test.ts`.

/** An error in the shape the real client reports one. */
type QueryError = { code?: string; message: string };

/** What one query this module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns `.select(...)` was given, or `''` for a query that read nothing back. */
	columns: string;
	/**
	 * The options beside those columns, or `{}` when there were none.
	 * `{ count: 'exact', head: true }` is the pair that asks for a count on its own.
	 */
	selectOptions: Record<string, unknown>;
	/** The row `.upsert(...)` was given, or `null` when the query wrote none. */
	upserted: Record<string, unknown> | null;
	/** The second argument of `.upsert(...)`, which says which index settles a conflict. */
	upsertOptions: Record<string, unknown> | null;
	/** The columns `.update(...)` was given, or `null` when the query changed nothing. */
	updated: Record<string, unknown> | null;
	/** `true` when the query removed rows rather than reading or changing them. */
	isDelete: boolean;
	eq: [string, unknown][];
	/** `[column, values]` for every `.in(...)`, which asks for a column to be one of several. */
	in: [string, unknown[]][];
	/** `[column, value]` for every `.neq(...)`, which asks for a column to be anything else. */
	neq: [string, unknown][];
	/**
	 * `[column, values]` for every `.contains(...)`, which asks an array column to
	 * hold all of these.
	 */
	contains: [string, unknown[]][];
	/** The text of every `.or(...)`, which is one condition or another in Supabase's filter language. */
	or: string[];
	/** `[column, ascending]` for every `.order(...)`. */
	order: [string, boolean][];
	/** The whole second argument of every `.order(...)`, which also says where the nulls go. */
	orderOptions: { ascending: boolean; nullsFirst?: boolean }[];
	/** `[firstIndex, lastIndex]` for every `.range(...)`, which asks for one window of rows. */
	range: [number, number][];
	/** The number each `.limit(...)` was given. */
	limit: number[];
};

/** What the stand-in should answer with. Everything here has a harmless default. */
type StandInAnswers = {
	/**
	 * The rows each relation answers with, as a list of answers rather than as
	 * one, the way `fees.test.ts` does it: a relation asked twice may have to
	 * answer differently each time. Every query takes the next answer along, and
	 * the last one is repeated once the list runs out, so a relation that always
	 * answers the same thing is a list of one.
	 */
	rows?: Record<string, unknown[][]>;
	/**
	 * The message each query to a relation fails with, as a list for the same
	 * reason, where `null` is a query that works.
	 */
	errors?: Record<string, (string | null)[]>;
	/**
	 * The code beside that message, as a list for the same reason. `PGRST103` is
	 * the one this module reads: it means "that window of rows starts past the
	 * last row", which is an answer rather than a fault.
	 */
	errorCodes?: Record<string, (string | null)[]>;
	/**
	 * The number `count: 'exact'` reports for each query to a relation, as a list
	 * for the same reason. A test that says nothing about it gets the number of
	 * rows the stand-in answered with, which is what the real client would report
	 * when everything fits on one page.
	 */
	counts?: Record<string, (number | null)[]>;
};

/** The rows the nth query to a relation answers with. */
function rowsForQuery(answers: unknown[][], index: number): unknown[] {
	if (answers.length === 0) {
		return [];
	}

	return answers[Math.min(index, answers.length - 1)];
}

/** The message the nth query to a relation fails with, or `null` when it works. */
function messageForQuery(answers: (string | null)[], index: number): string | null {
	if (answers.length === 0) {
		return null;
	}

	return answers[Math.min(index, answers.length - 1)];
}

/** The number the nth query to a relation counts, when the test did not say. */
function countForQuery(counts: (number | null)[], index: number, rowCount: number): number | null {
	if (counts.length === 0) {
		return rowCount;
	}

	return counts[Math.min(index, counts.length - 1)];
}

/** What an awaited query answers with: a list of rows, or nothing and a message. */
type ListAnswer = {
	data: unknown[] | null;
	error: QueryError | null;
	/** How many rows matched altogether, which `count: 'exact'` asks for. */
	count: number | null;
};

/** What a chain ending in `maybeSingle` or `single` answers with: one row rather than a list. */
type SingleRowAnswer = {
	data: unknown;
	error: QueryError | null;
};

/** The end of a chain that asked for one row rather than a list. */
type SingleRowBuilder = {
	overrideTypes: () => Promise<SingleRowAnswer>;
	/** What makes `await ...single()` work without `overrideTypes` after it. */
	then: (resolve: (answer: SingleRowAnswer) => void) => void;
};

/** One step of a query. Every step hands the builder back, which is what chains them. */
type QueryBuilder = {
	select: (columns: string, options?: Record<string, unknown>) => QueryBuilder;
	upsert: (row: Record<string, unknown>, options: Record<string, unknown>) => QueryBuilder;
	update: (columns: Record<string, unknown>) => QueryBuilder;
	delete: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	neq: (column: string, value: unknown) => QueryBuilder;
	contains: (column: string, values: unknown[]) => QueryBuilder;
	or: (filter: string) => QueryBuilder;
	order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => QueryBuilder;
	range: (firstIndex: number, lastIndex: number) => QueryBuilder;
	limit: (count: number) => QueryBuilder;
	maybeSingle: () => SingleRowBuilder;
	single: () => SingleRowBuilder;
	overrideTypes: () => Promise<ListAnswer>;
	/** What makes a chain that is awaited without `overrideTypes` on the end work. */
	then: (resolve: (answer: ListAnswer) => void) => void;
};

/**
 * A stand-in Supabase client that writes down every query and can be written to.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` one with `.eq(...)` on it, and so on.
 * Each step adds one condition to a query that is only sent once the chain is
 * awaited. This copies that shape: every step records its arguments and hands
 * the same builder back, and the awaited answer is whatever `answers` asked for
 * for that relation. A chain ending in `maybeSingle` or `single` is answered
 * with the first of those rows, the way the real one answers with the first
 * match.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
} {
	const queries: RecordedQuery[] = [];
	// How many queries each relation has been sent, so the next answer along can
	// be found for it.
	const answersUsed = new Map<string, number>();

	function builderFor(table: string): QueryBuilder {
		const query: RecordedQuery = {
			table,
			columns: '',
			selectOptions: {},
			upserted: null,
			upsertOptions: null,
			updated: null,
			isDelete: false,
			eq: [],
			in: [],
			neq: [],
			contains: [],
			or: [],
			order: [],
			orderOptions: [],
			range: [],
			limit: []
		};
		queries.push(query);

		const used = answersUsed.get(table) ?? 0;
		answersUsed.set(table, used + 1);

		const rows = rowsForQuery(answers.rows?.[table] ?? [], used);
		const message = messageForQuery(answers.errors?.[table] ?? [], used);
		const code = messageForQuery(answers.errorCodes?.[table] ?? [], used);
		const error = message ? { message, code: code ?? undefined } : null;
		const total = countForQuery(answers.counts?.[table] ?? [], used, rows.length);
		const listAnswer: ListAnswer = {
			data: message ? null : rows,
			error,
			count: message ? null : total
		};
		const singleRowAnswer: SingleRowAnswer = { data: message ? null : (rows[0] ?? null), error };
		const singleRowBuilder: SingleRowBuilder = {
			overrideTypes: async () => singleRowAnswer,
			then: (resolve) => resolve(singleRowAnswer)
		};

		const builder: QueryBuilder = {
			select: (columns, options) => {
				query.columns = columns;
				query.selectOptions = options ?? {};
				return builder;
			},
			upsert: (row, options) => {
				query.upserted = row;
				query.upsertOptions = options;
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
			neq: (column, value) => {
				query.neq.push([column, value]);
				return builder;
			},
			contains: (column, values) => {
				query.contains.push([column, values]);
				return builder;
			},
			or: (filter) => {
				query.or.push(filter);
				return builder;
			},
			order: (column, options) => {
				query.order.push([column, options.ascending]);
				query.orderOptions.push(options);
				return builder;
			},
			range: (firstIndex, lastIndex) => {
				query.range.push([firstIndex, lastIndex]);
				return builder;
			},
			limit: (count) => {
				query.limit.push(count);
				return builder;
			},
			maybeSingle: () => singleRowBuilder,
			single: () => singleRowBuilder,
			// In the real client `overrideTypes` changes the type of the answer and
			// not the answer itself, so here it is simply where the chain ends.
			overrideTypes: async () => listAnswer,
			then: (resolve) => resolve(listAnswer)
		};

		return builder;
	}

	const supabase = { from: builderFor };

	return { supabase: supabase as unknown as SupabaseClient, queries };
}

/** The one relation this module writes. */
const APPLICATIONS = 'applications';

/** The conference whose page the organiser is on. */
const CONFERENCE_ID = 'conference-1';

/** The first query the module sent to one relation, so a test can read its conditions back. */
function queryOn(queries: RecordedQuery[], table: string): RecordedQuery {
	const query = queries.find((sent) => sent.table === table);

	if (!query) {
		throw new Error(`Nothing was ever sent to "${table}"`);
	}

	return query;
}

describe('waitlistApplications', () => {
	it('moves only the applications still under review, and stamps the decision', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[{ id: 'application-1' }]] }
		});

		const outcome = await waitlistApplications(
			supabase,
			CONFERENCE_ID,
			['application-1', 'application-2'],
			'organiser-1',
			null
		);

		expect(queryOn(queries, APPLICATIONS).in).toEqual([
			['id', ['application-1', 'application-2']],
			['status', ['submitted']]
		]);
		// The ids were ticked on this conference's page, so only this conference's
		// rows may move, whatever the ticked ids turn out to name.
		expect(queryOn(queries, APPLICATIONS).eq).toEqual([['conference_id', CONFERENCE_ID]]);

		const written = queryOn(queries, APPLICATIONS).updated ?? {};

		expect(written.status).toBe('waitlisted');
		// No trigger fills these in for a plain update, so the query writes them.
		expect(written.decided_by).toBe('organiser-1');
		expect(Number.isNaN(Date.parse(String(written.decided_at)))).toBe(false);
		// Only one row came back, so the other was decided by somebody else first.
		expect(outcome).toEqual({ changedCount: 1, skippedCount: 1 });
	});

	it('leaves a note somebody already wrote alone when no new one was given', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[{ id: 'application-1' }]] }
		});

		await waitlistApplications(supabase, CONFERENCE_ID, ['application-1'], 'organiser-1', null);

		// A blank box means "I have nothing to add", not "delete what was written
		// to this applicant", so the column is not in the update at all.
		expect(Object.keys(queryOn(queries, APPLICATIONS).updated ?? {})).not.toContain(
			'decision_note'
		);
	});

	it('writes the note when one was given', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[{ id: 'application-1' }]] }
		});

		await waitlistApplications(
			supabase,
			CONFERENCE_ID,
			['application-1'],
			'organiser-1',
			'We will be in touch.'
		);

		expect((queryOn(queries, APPLICATIONS).updated ?? {}).decision_note).toBe(
			'We will be in touch.'
		);
	});

	it('sends no request at all when nothing was ticked', async () => {
		const { supabase, queries } = createStandInSupabase();

		expect(await waitlistApplications(supabase, CONFERENCE_ID, [], 'organiser-1', null)).toEqual({
			changedCount: 0,
			skippedCount: 0
		});
		expect(queries).toEqual([]);
	});

	it('raises when the update fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS]: ['connection closed'] }
		});

		await expect(
			waitlistApplications(supabase, CONFERENCE_ID, ['application-1'], 'organiser-1', null)
		).rejects.toThrow('Could not save the decisions');
	});
});

describe('rejectApplications', () => {
	it('lets a waitlisted application be rejected as well as a submitted one', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[{ id: 'application-1' }, { id: 'application-2' }]] }
		});

		const outcome = await rejectApplications(
			supabase,
			CONFERENCE_ID,
			['application-1', 'application-2'],
			'organiser-1',
			'Thank you for applying.'
		);

		expect(queryOn(queries, APPLICATIONS).in).toEqual([
			['id', ['application-1', 'application-2']],
			['status', ['submitted', 'waitlisted']]
		]);
		expect(queryOn(queries, APPLICATIONS).eq).toEqual([['conference_id', CONFERENCE_ID]]);
		expect((queryOn(queries, APPLICATIONS).updated ?? {}).status).toBe('rejected');
		expect(outcome).toEqual({ changedCount: 2, skippedCount: 0 });
	});
});
