import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	EMPTY_APPLICATION_LIST_QUERY,
	EMPTY_APPLICATION_STATUS_COUNTS,
	type ApplicationListQuery
} from '$lib/applications';
import {
	applicantNameOf,
	countApplicationsByStatus,
	listApplications,
	listApplicationsForExport,
	matchingApplicationsRequest
} from './application-table';

// These tests are about the queries `/manage/[slug]/applications` sends.
// The point of nearly all of them is that the database answers the question:
// the search, the country, the committee, the order and the page are conditions
// on one query of the `applications_with_applicant` view, and the tab counts are
// counting queries that read no rows at all. It used to be done here in
// TypeScript instead, over every application of a status, which `max_rows` in
// `supabase/config.toml` silently cut off at a thousand rows. Nothing here
// talks to a database; the stand-in client below writes down what it was asked
// for and answers with fixed rows, the way `./applications.test.ts` does for
// the applicant's own side.

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

/** The relations this module reads. */
const APPLICATIONS = 'applications';
const COMMITTEES = 'committees';
const SEATS = 'seats';

/** The first query the module sent to one relation, so a test can read its conditions back. */
function queryOn(queries: RecordedQuery[], table: string): RecordedQuery {
	const query = queries.find((sent) => sent.table === table);

	if (!query) {
		throw new Error(`Nothing was ever sent to "${table}"`);
	}

	return query;
}

/** Every query the module sent to one relation, in the order it sent them. */
function queriesOn(queries: RecordedQuery[], table: string): RecordedQuery[] {
	return queries.filter((sent) => sent.table === table);
}

/** The relations the module read, in the order it read them. */
function tablesRead(queries: RecordedQuery[]): string[] {
	return queries.map((query) => query.table);
}

/** The view the organiser's queries read: `applications` with the applicant's profile joined on. */
const APPLICATIONS_VIEW = 'applications_with_applicant';

/** The relation the organiser's half used to read, and no longer does. */
const PROFILES = 'profiles';

/** The two views the private details are read through, one for each permission. */
const CONTACT_VIEW = 'staff_contact_details';
const WELFARE_VIEW = 'staff_welfare_details';

/** The code Supabase answers a window of rows that starts past the last row with. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

/** One row of the view as the organiser's table asks for it. */
function organiserApplicationRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'application-1',
		user_id: 'user-1',
		status: 'submitted',
		committee_preferences: ['committee-1', 'committee-2'],
		submitted_at: '2026-09-08T14:02:00Z',
		decided_at: null,
		applicant_name: 'Anna Kowalski',
		applicant_avatar_path: 'avatars/anna.jpg',
		applicant_institution_name: 'Lyceum 7',
		applicant_country_code: 'PL',
		applicant_experience_level: 'intermediate',
		...changes
	};
}

/** The same row with the other columns the CSV writes. */
function exportApplicationRow(changes: Record<string, unknown> = {}) {
	return {
		...organiserApplicationRow(),
		seat_preferences: 'Any P5 country',
		motivation: 'I have wanted to chair the Security Council since I was fourteen.',
		answers: { 'question-1': 'No' },
		decision_note: null,
		...changes
	};
}

/** The relation the organisers' own notes live in, one row per application written about. */
const INTERNAL_NOTES = 'application_internal_notes';

/** One person's private details, which only the CSV reads. Both views are handed the whole row. */
function applicantDetailsRow(changes: Record<string, unknown> = {}) {
	return {
		user_id: 'user-1',
		email: 'anna@example.org',
		date_of_birth: '2008-04-11',
		phone: '+48 22 111 2222',
		dietary_requirements: 'Vegetarian',
		emergency_contact_name: 'Maria Kowalska',
		emergency_contact_phone: '+48 22 000 0000',
		...changes
	};
}

/** One committee, as the lookup that names a preference brings it back. */
function preferredCommitteeRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'committee-1',
		name: 'United Nations Security Council',
		abbreviation: 'UNSC',
		...changes
	};
}

/** The whole list state, with only the parts a test cares about changed. */
function listQuery(changes: Partial<ApplicationListQuery> = {}): ApplicationListQuery {
	return { ...EMPTY_APPLICATION_LIST_QUERY, ...changes };
}

/** As many rows of the view as a test asks for, each about a different applicant. */
function manyApplicationRows(count: number, changes: Record<string, unknown> = {}) {
	const rows: Record<string, unknown>[] = [];

	for (let index = 0; index < count; index += 1) {
		rows.push(
			organiserApplicationRow({
				id: `application-${index}`,
				user_id: `user-${index}`,
				applicant_name: `Applicant ${index}`,
				...changes
			})
		);
	}

	return rows;
}

/** The same, with the columns the CSV writes on each of them. */
function manyExportRows(count: number, changes: Record<string, unknown> = {}) {
	return manyApplicationRows(count, changes).map((row) => ({ ...exportApplicationRow(), ...row }));
}

/**
 * What the view answers the export with: these rows, and then nothing.
 *
 * The export asks for a window of rows at a time and only stops when one comes
 * back empty, so every test of it has to end the view's answers with an empty
 * one. Without that the stand-in would repeat its last answer for ever, because
 * a relation whose list of answers has run out keeps giving the last of them.
 */
function exportAnswers(rows: Record<string, unknown>[]): unknown[][] {
	return [rows, []];
}

describe('listApplications', () => {
	it('reads the view, so the applicant comes back with the application', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow()]] }
		});

		const page = await listApplications(supabase, 'conference-1', listQuery());

		// Nothing in the schema joins `applications` to `profiles`: both point at
		// `auth.users`. The view is what puts the applicant's columns beside the
		// application's own, so their name is no longer a second query and no
		// longer something this file has to search and sort by itself.
		expect(tablesRead(queries)).not.toContain(PROFILES);
		expect(queryOn(queries, APPLICATIONS_VIEW).columns).toContain('applicant_name');
		expect(page.rows).toEqual([
			{
				id: 'application-1',
				applicantName: 'Anna Kowalski',
				avatarPath: 'avatars/anna.jpg',
				institutionName: 'Lyceum 7',
				countryCode: 'PL',
				experienceLevel: 'intermediate',
				firstPreference: null,
				// The ids as the applicant put them down. The table draws none of
				// them; the seat panel orders its dropdown by them.
				committeePreferences: ['committee-1', 'committee-2'],
				status: 'submitted',
				submittedAt: '2026-09-08T14:02:00Z',
				decidedAt: null,
				seatLabel: null
			}
		]);
	});

	it('names the status itself, so that a draft can never reach the table', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow()]] }
		});

		await listApplications(supabase, 'conference-1', listQuery());

		// The select policy is "self; org.", and a policy decides rows and not
		// columns, so an organiser really can read somebody's unsent draft. Naming
		// the status in the query is what keeps it off the page.
		expect(queryOn(queries, APPLICATIONS_VIEW).eq).toEqual([
			['conference_id', 'conference-1'],
			['status', 'submitted']
		]);
	});

	it('asks for a committee anywhere in the preferences when one was picked', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow()]] }
		});

		await listApplications(supabase, 'conference-1', listQuery({ committee: 'committee-2' }));

		// `committee_preferences` is an array of ids, so the question is "does this
		// list hold that one" rather than "does this column equal it".
		expect(queryOn(queries, APPLICATIONS_VIEW).contains).toEqual([
			['committee_preferences', ['committee-2']]
		]);
	});

	it('leaves the committee condition off the query when the filter is on "any"', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow()]] }
		});

		await listApplications(supabase, 'conference-1', listQuery());

		expect(queryOn(queries, APPLICATIONS_VIEW).contains).toEqual([]);
	});

	it('asks the database to search the name and the school, whatever the case', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow()]] }
		});

		await listApplications(supabase, 'conference-1', listQuery({ q: 'Lyceum' }));

		// `ilike` ignores upper and lower case and `%` stands for anything, so this
		// is "the applicant's name or their school contains what was typed".
		expect(queryOn(queries, APPLICATIONS_VIEW).or).toEqual([
			'applicant_name.ilike."%Lyceum%",applicant_institution_name.ilike."%Lyceum%"'
		]);
	});

	it('never lets what somebody typed become part of the filter itself', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow()]] }
		});

		await listApplications(supabase, 'conference-1', listQuery({ q: 'anna,status.eq.draft' }));

		// A comma separates one condition from the next in `.or(...)`, so this is
		// the search that would otherwise have asked for the drafts.
		expect(queryOn(queries, APPLICATIONS_VIEW).or).toEqual([
			'applicant_name.ilike."%anna status eq draft%",applicant_institution_name.ilike."%anna status eq draft%"'
		]);
	});

	it('leaves the search off the query when the box was empty', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow()]] }
		});

		await listApplications(supabase, 'conference-1', listQuery());

		expect(queryOn(queries, APPLICATIONS_VIEW).or).toEqual([]);
	});

	it('asks the database for the country the dropdown picked', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow({ applicant_country_code: 'IE' })]] }
		});

		const page = await listApplications(supabase, 'conference-1', listQuery({ country: 'IE' }));

		expect(queryOn(queries, APPLICATIONS_VIEW).eq).toContainEqual(['applicant_country_code', 'IE']);
		expect(page.rows[0].countryCode).toBe('IE');
	});

	it('puts the oldest first by default, so that the queue is fair', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow()]] }
		});

		await listApplications(supabase, 'conference-1', listQuery());

		// The second sort is the tie-break that makes paging safe: without it two
		// rows the dropdown cannot tell apart could come back in either order, and
		// page two could repeat a row page one had already shown.
		expect(queryOn(queries, APPLICATIONS_VIEW).order).toEqual([
			['submitted_at', true],
			['id', true]
		]);
	});

	it('sorts by the applicant’s name when the dropdown asks for it', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow()]] }
		});

		await listApplications(supabase, 'conference-1', listQuery({ sort: 'name' }));

		expect(queryOn(queries, APPLICATIONS_VIEW).order).toEqual([
			['applicant_name', true],
			['id', true]
		]);
	});

	it('puts the most recently decided first, with the undecided at the end', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow()]] }
		});

		await listApplications(supabase, 'conference-1', listQuery({ sort: 'decided' }));

		// "Recently decided" is about what just happened, so an application nobody
		// has decided has no date at all and goes to the end rather than the top.
		expect(queryOn(queries, APPLICATIONS_VIEW).order).toEqual([
			['decided_at', false],
			['id', true]
		]);
		expect(queryOn(queries, APPLICATIONS_VIEW).orderOptions[0]).toEqual({
			ascending: false,
			nullsFirst: false
		});
	});

	it('asks for one page of rows and for how many matched altogether', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [manyApplicationRows(25)] },
			counts: { [APPLICATIONS_VIEW]: [90] }
		});

		const page = await listApplications(supabase, 'conference-1', listQuery());

		// 25 rows are read and 25 rows are drawn. The 90 is the database's own
		// count of everything that matched, which is what the pager and the counts
		// sentence are about, and what `max_rows` used to cut short.
		expect(queryOn(queries, APPLICATIONS_VIEW).selectOptions).toEqual({ count: 'exact' });
		expect(queryOn(queries, APPLICATIONS_VIEW).range).toEqual([[0, 24]]);
		expect(page.rows).toHaveLength(25);
		expect(page.total).toBe(90);
	});

	it('asks for the second page by moving the window along', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [manyApplicationRows(5)] },
			counts: { [APPLICATIONS_VIEW]: [30] }
		});

		const page = await listApplications(supabase, 'conference-1', listQuery({ page: 2 }));

		// `range` counts from 0 and includes both ends, and `page` is 1-based, the
		// way the address bar writes it.
		expect(queryOn(queries, APPLICATIONS_VIEW).range).toEqual([[25, 49]]);
		expect(page.rows).toHaveLength(5);
	});

	it('answers with an empty page when the page number is past the end', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS_VIEW]: ['Requested range not satisfiable'] },
			errorCodes: { [APPLICATIONS_VIEW]: [PAGE_OUT_OF_RANGE_CODE] }
		});

		const page = await listApplications(supabase, 'conference-1', listQuery({ page: 99 }));

		// Somebody edited the address bar. That is an empty page and not a fault,
		// the same as on the conference directory.
		expect(page).toEqual({ rows: [], total: 0 });
	});

	it('still shows a row whose account has gone, rather than a blank name', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				[APPLICATIONS_VIEW]: [
					[
						organiserApplicationRow({
							applicant_name: null,
							applicant_avatar_path: null,
							applicant_institution_name: null,
							applicant_country_code: null,
							applicant_experience_level: null
						})
					]
				]
			}
		});

		const page = await listApplications(supabase, 'conference-1', listQuery());

		// The view joins the profile with a left join for exactly this: a blank
		// cell would look like a fault rather than a fact, and the organiser still
		// has to see that the application is there.
		expect(page.rows[0].applicantName).toBe('Deleted account');
		expect(page.rows[0].experienceLevel).toBe('none');
	});

	it('names the first preference from a lookup of its own', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[APPLICATIONS_VIEW]: [[organiserApplicationRow()]],
				[COMMITTEES]: [[preferredCommitteeRow()]]
			}
		});

		const page = await listApplications(supabase, 'conference-1', listQuery());

		// Only the first preference is ever shown, so only that one is looked up,
		// and only for the rows on this page.
		expect(queryOn(queries, COMMITTEES).in).toEqual([['id', ['committee-1']]]);
		expect(page.rows[0].firstPreference).toBe('UNSC');
	});

	it('leaves the first preference empty for somebody who asked for no committee', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow({ committee_preferences: [] })]] }
		});

		const page = await listApplications(supabase, 'conference-1', listQuery());

		// `.in('id', [])` would be a request that cannot match anything.
		expect(tablesRead(queries)).not.toContain(COMMITTEES);
		expect(page.rows[0].firstPreference).toBeNull();
	});

	it('labels the seat an accepted application won', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[APPLICATIONS_VIEW]: [[organiserApplicationRow({ status: 'accepted' })]],
				[COMMITTEES]: [[preferredCommitteeRow()]],
				[SEATS]: [
					[
						{
							application_id: 'application-1',
							name: 'France',
							committees: { name: 'United Nations Security Council', abbreviation: 'UNSC' }
						}
					]
				]
			}
		});

		const page = await listApplications(
			supabase,
			'conference-1',
			listQuery({ status: 'accepted' })
		);

		expect(queryOn(queries, SEATS).in).toEqual([['application_id', ['application-1']]]);
		// `seats.committee_id` really is a foreign key, so unlike the applicant's
		// profile the committee can be brought along by the same query.
		expect(queryOn(queries, SEATS).columns).toContain('committees(name, abbreviation)');
		expect(page.rows[0].seatLabel).toBe('UNSC · France');
	});

	it('asks for no seats at all on a tab where nothing has been accepted', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[organiserApplicationRow()]] }
		});

		await listApplications(supabase, 'conference-1', listQuery());

		// Only an accepted application has a seat, and a tab shows one status.
		expect(tablesRead(queries)).not.toContain(SEATS);
	});

	it('raises when the applications query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS_VIEW]: ['connection closed'] }
		});

		await expect(listApplications(supabase, 'conference-1', listQuery())).rejects.toThrow(
			'Could not read the applications'
		);
	});
});

describe('countApplicationsByStatus', () => {
	it('has the database count each tab, and reads no rows at all', async () => {
		const { supabase, queries } = createStandInSupabase({
			// One number per tab, in the order of `APPLICATION_STATUS_TABS`: the five
			// queries go out in that order, so the stand-in answers them in it too.
			counts: { [APPLICATIONS]: [2, 0, 1, 0, 1] }
		});

		const counts = await countApplicationsByStatus(supabase, 'conference-1');

		const counting = queriesOn(queries, APPLICATIONS);

		// `head: true` asks for the number instead of the rows, so `max_rows` in
		// `supabase/config.toml` has nothing to shorten. Reading every status and
		// counting them here is what used to make a large conference's tabs
		// disagree with its own table.
		expect(counting).toHaveLength(5);
		expect(counting[0].selectOptions).toEqual({ count: 'exact', head: true });
		expect(counting.map((query) => query.eq)).toEqual([
			[
				['conference_id', 'conference-1'],
				['status', 'submitted']
			],
			[
				['conference_id', 'conference-1'],
				['status', 'waitlisted']
			],
			[
				['conference_id', 'conference-1'],
				['status', 'accepted']
			],
			[
				['conference_id', 'conference-1'],
				['status', 'rejected']
			],
			[
				['conference_id', 'conference-1'],
				['status', 'withdrawn']
			]
		]);
		expect(counts).toEqual({
			submitted: 2,
			waitlisted: 0,
			accepted: 1,
			rejected: 0,
			withdrawn: 1
		});
	});

	it('reads a status the database counted nothing for as none', async () => {
		const { supabase } = createStandInSupabase({ counts: { [APPLICATIONS]: [null] } });

		const counts = await countApplicationsByStatus(supabase, 'conference-1');

		// The real client answers with `null` rather than 0 when it has no count to
		// report, and a tab cannot show "null".
		expect(counts).toEqual(EMPTY_APPLICATION_STATUS_COUNTS);
	});

	it('never writes on the shared empty counts', async () => {
		const { supabase } = createStandInSupabase({ counts: { [APPLICATIONS]: [3] } });

		await countApplicationsByStatus(supabase, 'conference-1');

		// Counting starts from a copy, so the next conference does not start at three.
		expect(EMPTY_APPLICATION_STATUS_COUNTS.submitted).toBe(0);
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS]: ['connection closed'] }
		});

		await expect(countApplicationsByStatus(supabase, 'conference-1')).rejects.toThrow(
			'Could not count the applications'
		);
	});
});

describe('listApplicationsForExport', () => {
	it('reads the private details as a query of its own', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[APPLICATIONS_VIEW]: exportAnswers([exportApplicationRow()]),
				[CONTACT_VIEW]: [[applicantDetailsRow()]],
				[WELFARE_VIEW]: [[applicantDetailsRow()]],
				[COMMITTEES]: [[preferredCommitteeRow()]]
			}
		});

		const rows = await listApplicationsForExport(supabase, 'conference-1', listQuery());

		// The private details come through two views of their own, one per
		// permission, so they cannot be brought along by the applications view.
		expect(queryOn(queries, CONTACT_VIEW).in).toEqual([['user_id', ['user-1']]]);
		expect(queryOn(queries, WELFARE_VIEW).in).toEqual([['user_id', ['user-1']]]);
		expect(rows[0].email).toBe('anna@example.org');
		expect(rows[0].dateOfBirth).toBe('2008-04-11');
		expect(rows[0].dietaryRequirements).toBe('Vegetarian');
	});

	it('writes the country by its English name and joins the emergency contact', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				[APPLICATIONS_VIEW]: exportAnswers([exportApplicationRow()]),
				[CONTACT_VIEW]: [[applicantDetailsRow()]],
				[WELFARE_VIEW]: [[applicantDetailsRow()]],
				[COMMITTEES]: [[preferredCommitteeRow()]]
			}
		});

		const rows = await listApplicationsForExport(supabase, 'conference-1', listQuery());

		// A spreadsheet is read by people who do not know the codes.
		expect(rows[0].countryName).toBe('Poland');
		expect(rows[0].emergencyContact).toBe('Maria Kowalska · +48 22 000 0000');
	});

	it('leaves the emergency contact empty when neither half was filled in', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				[APPLICATIONS_VIEW]: exportAnswers([exportApplicationRow()]),
				[WELFARE_VIEW]: [
					[applicantDetailsRow({ emergency_contact_name: null, emergency_contact_phone: null })]
				]
			}
		});

		const rows = await listApplicationsForExport(supabase, 'conference-1', listQuery());

		expect(rows[0].emergencyContact).toBeNull();
	});

	it('names every committee the applicant asked for, in their own order', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[APPLICATIONS_VIEW]: exportAnswers([
					exportApplicationRow({ committee_preferences: ['committee-2', 'committee-1'] })
				]),
				[COMMITTEES]: [
					[
						preferredCommitteeRow(),
						preferredCommitteeRow({
							id: 'committee-2',
							name: 'Economic and Social Council',
							abbreviation: null
						})
					]
				]
			}
		});

		const rows = await listApplicationsForExport(supabase, 'conference-1', listQuery());

		// The CSV has a column for every preference, not just the first one, so all
		// of them are looked up at once.
		expect(queryOn(queries, COMMITTEES).in).toEqual([['id', ['committee-2', 'committee-1']]]);
		// A committee with no short name is called by its full one, and the
		// database's own order is put back into the applicant's.
		expect(rows[0].committeeNames).toEqual(['Economic and Social Council', 'UNSC']);
	});

	it('carries the notes and the answers the CSV has columns for', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[APPLICATIONS_VIEW]: exportAnswers([
					exportApplicationRow({ decision_note: 'See you in February.' })
				]),
				[INTERNAL_NOTES]: [[{ application_id: 'application-1', note: 'Strong on procedure.' }]],
				[COMMITTEES]: [[preferredCommitteeRow()]]
			}
		});

		const rows = await listApplicationsForExport(supabase, 'conference-1', listQuery());

		// What the organisers wrote to each other is theirs to read, and the export
		// has a column for it, unlike the applicant's own page. It lives in a table
		// of its own, looked up by the ids of the exported applications.
		expect(queryOn(queries, APPLICATIONS_VIEW).columns).not.toContain('internal_note');
		expect(queryOn(queries, INTERNAL_NOTES).in).toEqual([['application_id', ['application-1']]]);
		expect(rows[0].internalNote).toBe('Strong on procedure.');
		expect(rows[0].decisionNote).toBe('See you in February.');
		expect(rows[0].answers).toEqual({ 'question-1': 'No' });
		expect(rows[0].seatPreferences).toBe('Any P5 country');
	});

	it('writes no note for an application nobody wrote about', async () => {
		const { supabase } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: exportAnswers([exportApplicationRow()]) }
		});

		const rows = await listApplicationsForExport(supabase, 'conference-1', listQuery());

		expect(rows[0].internalNote).toBeNull();
	});

	it('asks the database for the same filter and the same order as the table', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: exportAnswers([exportApplicationRow()]) }
		});

		await listApplicationsForExport(
			supabase,
			'conference-1',
			listQuery({ q: 'park', country: 'IE', committee: 'committee-2', sort: 'name' })
		);

		const firstBatch = queryOn(queries, APPLICATIONS_VIEW);

		// The file has to hold what the screen was showing, so every condition the
		// table sent is sent here too — and the order with them, because that is
		// also what keeps one window of rows from overlapping the next.
		expect(firstBatch.or).toEqual([
			'applicant_name.ilike."%park%",applicant_institution_name.ilike."%park%"'
		]);
		expect(firstBatch.eq).toContainEqual(['applicant_country_code', 'IE']);
		expect(firstBatch.contains).toEqual([['committee_preferences', ['committee-2']]]);
		expect(firstBatch.order).toEqual([
			['applicant_name', true],
			['id', true]
		]);
	});

	it('keeps asking for another window until one comes back empty', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[APPLICATIONS_VIEW]: [
					[exportApplicationRow(), exportApplicationRow({ id: 'application-2' })],
					[exportApplicationRow({ id: 'application-3' })],
					[]
				]
			}
		});

		const rows = await listApplicationsForExport(supabase, 'conference-1', listQuery());

		// The window moves along by however many rows really came back, and only an
		// empty answer ends it. A window shorter than the one asked for is not the
		// end: if `max_rows` were ever set below the batch size, every answer would
		// be short and the file would quietly hold the first batch alone, which is
		// the very fault this task was about.
		expect(queriesOn(queries, APPLICATIONS_VIEW).map((query) => query.range)).toEqual([
			[[0, 499]],
			[[2, 501]],
			[[3, 502]]
		]);
		expect(rows.map((row) => row.status)).toHaveLength(3);
	});

	it('stops when the window starts past the last row, rather than raising', async () => {
		const { supabase } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[exportApplicationRow()]] },
			errors: { [APPLICATIONS_VIEW]: [null, 'Requested range not satisfiable'] },
			errorCodes: { [APPLICATIONS_VIEW]: [null, PAGE_OUT_OF_RANGE_CODE] }
		});

		const rows = await listApplicationsForExport(supabase, 'conference-1', listQuery());

		// Supabase answers a window that starts past the last row with a code
		// rather than with an empty list, which is the other way this loop ends.
		expect(rows).toHaveLength(1);
	});

	it('asks the lookups about a hundred applicants at a time', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: exportAnswers(manyExportRows(150, { status: 'accepted' })) }
		});

		const rows = await listApplicationsForExport(supabase, 'conference-1', listQuery());

		// One `.in(...)` holding 150 uuids would be both a longer address than the
		// server accepts and more rows than `max_rows` will answer with, so the
		// lookups that grow with the number of applications ask in batches.
		expect(queriesOn(queries, CONTACT_VIEW).map((query) => query.in[0][1].length)).toEqual([
			100, 50
		]);
		expect(queriesOn(queries, SEATS).map((query) => query.in[0][1].length)).toEqual([100, 50]);
		expect(rows).toHaveLength(150);
	});

	it('raises when the applications query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS_VIEW]: ['connection closed'] }
		});

		await expect(listApplicationsForExport(supabase, 'conference-1', listQuery())).rejects.toThrow(
			'Could not read the applications'
		);
	});
});

// The three pieces below are exported because the review page in
// `./application-review.ts` reads the same view and walks the same queue as
// the table. The tests above cover them through the table and the export;
// these say what each one promises on its own.

describe('matchingApplicationsRequest', () => {
	it('puts every condition of the list on one request of the view, in a stable order', () => {
		const { supabase, queries } = createStandInSupabase();

		matchingApplicationsRequest(
			supabase,
			'conference-1',
			listQuery({ status: 'waitlisted', committee: 'committee-1', country: 'PL', q: 'Anna' }),
			'id'
		);

		const request = queryOn(queries, APPLICATIONS_VIEW);

		expect(request.columns).toBe('id');
		expect(request.eq).toEqual([
			['conference_id', 'conference-1'],
			['status', 'waitlisted'],
			['applicant_country_code', 'PL']
		]);
		expect(request.contains).toEqual([['committee_preferences', ['committee-1']]]);
		expect(request.or).toEqual([
			'applicant_name.ilike."%Anna%",applicant_institution_name.ilike."%Anna%"'
		]);
		// The id comes last, so two rows that tie on the chosen sort never swap.
		expect(request.order.at(-1)).toEqual(['id', true]);
	});
});

describe('applicantNameOf', () => {
	it("keeps the applicant's own name", () => {
		expect(applicantNameOf('Anna Kowalski')).toBe('Anna Kowalski');
	});

	it('says "Deleted account" for an applicant whose profile is gone', () => {
		expect(applicantNameOf(null)).toBe('Deleted account');
	});
});
