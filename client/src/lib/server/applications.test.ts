import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	deleteDraftApplication,
	findInvoiceForSeat,
	findSeatForApplication,
	getMyApplication,
	getMyApplicationFor,
	hasApplications,
	listMyApplications,
	listPreferredCommitteeNames,
	upsertApplication,
	withdrawApplication,
	type ApplicationInput
} from './applications';

// These tests are about the decisions this module makes: which columns it asks
// for, who it asks about as well as which row, which columns a save is allowed
// to send, and what a refused seat or a stale button answers. Nothing here
// talks to a database; the stand-in client below writes down what it was asked
// for and answers with fixed rows. Whether the database really lets an
// applicant read and write those rows is Row Level Security's decision, and
// that is tested in `tests/db/applications.test.ts`.

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

/** The relations this module reads and writes. */
const APPLICATIONS = 'applications';
const COMMITTEES = 'committees';
const SEATS = 'seats';
const INVOICES = 'invoices';
const QUESTIONS = 'application_questions';

/** The code Supabase answers a window of rows that starts past the last row with. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

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

/** One `applications` row with every column this module reads. */
function applicationRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'application-1',
		conference_id: 'conference-1',
		user_id: 'user-1',
		status: 'submitted',
		committee_preferences: ['committee-1', 'committee-2'],
		seat_preferences: 'Any P5 country',
		motivation: 'I have wanted to chair the Security Council since I was fourteen.',
		answers: { 'question-1': 'No' },
		submitted_at: '2026-09-08T14:02:00Z',
		decision_note: null,
		updated_at: '2026-09-08T14:02:00Z',
		...changes
	};
}

/** The conference the application page reads, as the `conferences!inner(...)` embed brings it. */
function conferenceRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'conference-1',
		slug: 'delftmun-2026',
		name: 'DelftMUN 2026',
		logo_path: null,
		start_date: '2026-02-12',
		end_date: '2026-02-15',
		timezone: 'Europe/Amsterdam',
		status: 'published',
		applications_open_at: null,
		applications_close_at: '2026-12-15T22:59:00Z',
		committee_preference_count: 2,
		ask_motivation: true,
		...changes
	};
}

/** One `applications` row with its conference brought along, as `getMyApplication` asks for it. */
function applicationWithConferenceRow(changes: Record<string, unknown> = {}) {
	return { ...applicationRow(changes), conferences: conferenceRow() };
}

/** What the apply form hands over, already read out of the form data. */
function applicationInput(changes: Partial<ApplicationInput> = {}): ApplicationInput {
	return {
		committeePreferences: ['committee-1', 'committee-2'],
		seatPreferences: 'Any P5 country',
		motivation: 'I have wanted to chair the Security Council since I was fourteen.',
		answers: { 'question-1': 'No' },
		...changes
	};
}

describe('getMyApplicationFor', () => {
	it('asks about this person as well as this conference', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[applicationRow()]] }
		});

		await getMyApplicationFor(supabase, 'conference-1', 'user-1');

		// The select policy is "self; org.", so an organiser reads this row too.
		// The filter on the person is what makes the answer the reader's own.
		expect(queryOn(queries, APPLICATIONS).eq).toEqual([
			['conference_id', 'conference-1'],
			['user_id', 'user-1']
		]);
		// What the organisers wrote to each other is never asked for.
		expect(queryOn(queries, APPLICATIONS).columns).not.toContain('internal_note');
	});

	it('gives the database column names the ones the pages use', async () => {
		const { supabase } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[applicationRow()]] }
		});

		const application = await getMyApplicationFor(supabase, 'conference-1', 'user-1');

		expect(application).toEqual({
			id: 'application-1',
			conferenceId: 'conference-1',
			status: 'submitted',
			committeePreferences: ['committee-1', 'committee-2'],
			seatPreferences: 'Any P5 country',
			motivation: 'I have wanted to chair the Security Council since I was fourteen.',
			answers: { 'question-1': 'No' },
			submittedAt: '2026-09-08T14:02:00Z',
			decisionNote: null,
			updatedAt: '2026-09-08T14:02:00Z'
		});
	});

	it('reads an unanswered text column as empty text, which is what the form shows', async () => {
		const { supabase } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[applicationRow({ seat_preferences: null, motivation: null })]] }
		});

		const application = await getMyApplicationFor(supabase, 'conference-1', 'user-1');

		// Both fill a text box, and a text box's value is text.
		expect(application?.seatPreferences).toBe('');
		expect(application?.motivation).toBe('');
	});

	it('answers with nothing when this person has not applied here', async () => {
		const { supabase } = createStandInSupabase();

		expect(await getMyApplicationFor(supabase, 'conference-1', 'user-1')).toBeNull();
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS]: ['no such column'] }
		});

		await expect(getMyApplicationFor(supabase, 'conference-1', 'user-1')).rejects.toThrow(
			'Could not read your application'
		);
	});
});

describe('getMyApplication', () => {
	it('asks for the application of this reader, with its conference brought along', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[applicationWithConferenceRow()]] }
		});

		const page = await getMyApplication(supabase, 'application-1', 'user-1');

		// An organiser reading this row is exactly what the page must not allow, so
		// the reader is part of the question and not only the application's id.
		expect(queryOn(queries, APPLICATIONS).eq).toEqual([
			['id', 'application-1'],
			['user_id', 'user-1']
		]);
		expect(queryOn(queries, APPLICATIONS).columns).toContain('conferences!inner(');
		expect(page?.conference.name).toBe('DelftMUN 2026');
		expect(page?.conference.committeePreferenceCount).toBe(2);
		expect(page?.conference.askMotivation).toBe(true);
	});

	it("answers with nothing when the application is not this reader's", async () => {
		const { supabase, queries } = createStandInSupabase();

		expect(await getMyApplication(supabase, 'application-9', 'user-1')).toBeNull();
		// It stops at the application rather than looking up questions and
		// committees for one it cannot show. The page turns the nothing into a 404.
		expect(tablesRead(queries)).toEqual([APPLICATIONS]);
	});

	it('treats an id that is not a uuid as not found, so the page says 404', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS]: ['invalid input syntax for type uuid'] },
			errorCodes: { [APPLICATIONS]: ['22P02'] }
		});

		expect(await getMyApplication(supabase, 'nonsense', 'user-1')).toBeNull();
	});

	it('names the committees in the order the applicant put them', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[APPLICATIONS]: [
					[
						applicationWithConferenceRow({
							committee_preferences: ['committee-2', 'committee-1', 'committee-9']
						})
					]
				],
				[COMMITTEES]: [
					[
						{ id: 'committee-1', name: 'Economic and Social Council', abbreviation: 'ECOFIN' },
						{ id: 'committee-2', name: 'United Nations Security Council', abbreviation: 'UNSC' }
					]
				]
			}
		});

		const page = await getMyApplication(supabase, 'application-1', 'user-1');

		expect(queryOn(queries, COMMITTEES).in).toEqual([
			['id', ['committee-2', 'committee-1', 'committee-9']]
		]);
		// The database answers in its own order, so the names are put back into the
		// applicant's, and a committee deleted since is left out rather than shown
		// as a gap.
		expect(page?.committeeNames).toEqual(['UNSC', 'ECOFIN']);
	});

	it('calls a committee by its full name when it has no short one', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[APPLICATIONS]: [
					[applicationWithConferenceRow({ committee_preferences: ['committee-1'] })]
				],
				[COMMITTEES]: [
					[{ id: 'committee-1', name: 'Economic and Social Council', abbreviation: null }]
				]
			}
		});

		const page = await getMyApplication(supabase, 'application-1', 'user-1');

		// `committeeHeading` is the rule the committee's own page and the home
		// dashboard use, which is why the query asks for `abbreviation` as well.
		expect(queryOn(queries, COMMITTEES).columns).toBe('id, name, abbreviation');
		expect(page?.committeeNames).toEqual(['Economic and Social Council']);
	});

	it('asks nothing about committees when the applicant chose none', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[applicationWithConferenceRow({ committee_preferences: [] })]] }
		});

		const page = await getMyApplication(supabase, 'application-1', 'user-1');

		// `.in('id', [])` would be a pointless request.
		expect(tablesRead(queries)).not.toContain(COMMITTEES);
		expect(page?.committeeNames).toEqual([]);
	});

	it("reads the conference's questions so the answers can be shown with their labels", async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[APPLICATIONS]: [[applicationWithConferenceRow()]],
				[QUESTIONS]: [
					[
						{
							id: 'question-1',
							label: 'Have you chaired before?',
							help_text: null,
							type: 'single_choice',
							options: ['Yes', 'No'],
							is_required: true,
							position: 0
						}
					]
				]
			}
		});

		const page = await getMyApplication(supabase, 'application-1', 'user-1');

		expect(queryOn(queries, QUESTIONS).eq).toEqual([['conference_id', 'conference-1']]);
		expect(page?.questions.map((question) => question.label)).toEqual(['Have you chaired before?']);
	});

	it('finds the seat this application won and the invoice raised for it', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[APPLICATIONS]: [[applicationWithConferenceRow({ status: 'accepted' })]],
				[SEATS]: [
					[
						{
							id: 'seat-1',
							name: 'France',
							country_code: 'FR',
							// `committees!inner(...)` brings the committee back as one object,
							// because a seat belongs to exactly one.
							committees: { slug: 'unsc', name: 'United Nations Security Council' }
						}
					]
				],
				[INVOICES]: [
					[
						{
							id: 'invoice-1',
							number: 'delftmun-2026-0031',
							status: 'unpaid',
							amount_cents: 6500,
							currency: 'EUR'
						}
					]
				]
			}
		});

		const page = await getMyApplication(supabase, 'application-1', 'user-1');

		expect(queryOn(queries, SEATS).eq).toEqual([['application_id', 'application-1']]);
		expect(page?.seat).toEqual({
			seatName: 'France',
			committeeName: 'United Nations Security Council',
			committeeSlug: 'unsc',
			// The seat's country code travels with it, for the page to draw a flag from.
			countryCode: 'FR'
		});
		// The invoice is found by the seat's id, which is why the seat query asks
		// for an id nothing on the page shows.
		expect(queryOn(queries, INVOICES).eq).toEqual([['seat_id', 'seat-1']]);
		// Newest first, and only the first one: a seat that was revoked and given
		// again carries the voided invoice as well as the new one, and asking for
		// one row without an order would answer with an error instead.
		expect(queryOn(queries, INVOICES).order).toEqual([['created_at', false]]);
		expect(queryOn(queries, INVOICES).limit).toEqual([1]);
		expect(page?.invoice).toEqual({
			id: 'invoice-1',
			number: 'delftmun-2026-0031',
			status: 'unpaid',
			amountCents: 6500,
			currency: 'EUR'
		});
	});

	it('asks for no invoice at all when the application has won no seat', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[applicationWithConferenceRow()]] }
		});

		const page = await getMyApplication(supabase, 'application-1', 'user-1');

		// There is nothing to look an invoice up by, and waiting for a decision is
		// the ordinary state of an application.
		expect(tablesRead(queries)).not.toContain(INVOICES);
		expect(page?.seat).toBeNull();
		expect(page?.invoice).toBeNull();
	});

	it('treats a seat list the reader may not read as no seat rather than as a fault', async () => {
		const { supabase } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[applicationWithConferenceRow()]] },
			errors: { [SEATS]: ['permission denied for table seats'] }
		});

		const page = await getMyApplication(supabase, 'application-1', 'user-1');

		// An applicant still waiting for a decision reads no seat list, so being
		// turned away here is the ordinary case and not something to fail over.
		expect(page?.seat).toBeNull();
	});

	it('raises when the application query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS]: ['connection closed'] }
		});

		await expect(getMyApplication(supabase, 'application-1', 'user-1')).rejects.toThrow(
			'Could not load the application'
		);
	});
});

describe('upsertApplication', () => {
	it('never sends submitted_at, which the database keeps for itself', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[{ id: 'application-1' }]] }
		});

		await upsertApplication(supabase, 'conference-1', 'user-1', 'submitted', applicationInput());

		// `guard_application_update` refuses a change to `submitted_at` from a
		// browser and stamps the column itself, so a page that sent one would be
		// turned away.
		expect(Object.keys(queryOn(queries, APPLICATIONS).upserted ?? {})).not.toContain(
			'submitted_at'
		);
	});

	it('writes every answer and names the unique pair as the conflict to settle', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[{ id: 'application-1' }]] }
		});

		const applicationId = await upsertApplication(
			supabase,
			'conference-1',
			'user-1',
			'submitted',
			applicationInput()
		);

		expect(queryOn(queries, APPLICATIONS).upserted).toEqual({
			conference_id: 'conference-1',
			user_id: 'user-1',
			status: 'submitted',
			committee_preferences: ['committee-1', 'committee-2'],
			seat_preferences: 'Any P5 country',
			motivation: 'I have wanted to chair the Security Council since I was fourteen.',
			answers: { 'question-1': 'No' }
		});
		// The `unique (conference_id, user_id)` index on the table, which is also
		// what turns a second tab's stray insert into a conflict this settles.
		expect(queryOn(queries, APPLICATIONS).upsertOptions).toEqual({
			onConflict: 'conference_id,user_id'
		});
		expect(applicationId).toBe('application-1');
	});

	it('saves a draft with the status it was given', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[{ id: 'application-1' }]] }
		});

		await upsertApplication(
			supabase,
			'conference-1',
			'user-1',
			'draft',
			applicationInput({ seatPreferences: null, motivation: null })
		);

		const written = queryOn(queries, APPLICATIONS).upserted ?? {};

		// The two buttons send the same answers and differ only in this one word.
		expect(written.status).toBe('draft');
		// An empty field arrives as "no value" and is written as it arrives.
		expect(written.seat_preferences).toBeNull();
		expect(written.motivation).toBeNull();
	});

	it('raises when the database refuses the save', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS]: ['new row violates row-level security policy'] }
		});

		// The insert policy checks that the conference is published, takes
		// individual applications and is inside its window, so a window that closed
		// while somebody was typing ends up here.
		await expect(
			upsertApplication(supabase, 'conference-1', 'user-1', 'submitted', applicationInput())
		).rejects.toThrow('row-level security');
	});
});

describe('withdrawApplication', () => {
	it('moves the application to withdrawn from the two statuses that still can', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[{ id: 'application-1' }]] }
		});

		expect(await withdrawApplication(supabase, 'application-1')).toBe(true);
		expect(queryOn(queries, APPLICATIONS).updated).toEqual({ status: 'withdrawn' });
		expect(queryOn(queries, APPLICATIONS).eq).toEqual([['id', 'application-1']]);
		expect(queryOn(queries, APPLICATIONS).in).toEqual([['status', ['submitted', 'waitlisted']]]);
	});

	it('answers no when nothing came back, which means the status moved meanwhile', async () => {
		const { supabase } = createStandInSupabase();

		// An organiser decided it, or another tab withdrew it already. The page
		// words that rather than showing an error.
		expect(await withdrawApplication(supabase, 'application-1')).toBe(false);
	});

	it('raises when the update fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS]: ['connection closed'] }
		});

		await expect(withdrawApplication(supabase, 'application-1')).rejects.toThrow(
			'Could not withdraw the application'
		);
	});
});

describe('deleteDraftApplication', () => {
	it('deletes the row only while it is still a draft', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[{ id: 'application-1' }]] }
		});

		expect(await deleteDraftApplication(supabase, 'application-1')).toBe(true);
		expect(queryOn(queries, APPLICATIONS).isDelete).toBe(true);
		// The delete policy is "self while `draft`", and the condition says the same
		// thing out loud so that a submitted row answers rather than failing.
		expect(queryOn(queries, APPLICATIONS).eq).toEqual([
			['id', 'application-1'],
			['status', 'draft']
		]);
	});

	it('answers no when nothing came back, which means it is no longer a draft', async () => {
		const { supabase } = createStandInSupabase();

		expect(await deleteDraftApplication(supabase, 'application-1')).toBe(false);
	});

	it('raises when the delete fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS]: ['connection closed'] }
		});

		await expect(deleteDraftApplication(supabase, 'application-1')).rejects.toThrow(
			'Could not delete the draft'
		);
	});
});

/** The conference the list at `/applications` brings along with each application. */
function applicationListConferenceRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'conference-1',
		slug: 'delftmun-2026',
		name: 'DelftMUN 2026',
		logo_path: 'logos/delftmun.png',
		start_date: '2026-02-12',
		end_date: '2026-02-15',
		timezone: 'Europe/Amsterdam',
		status: 'published',
		applications_close_at: '2026-12-15T22:59:00Z',
		organizations: { name: 'Delft MUN Society' },
		...changes
	};
}

/** One row of the list: an application with its conference brought along. */
function applicationListRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'application-1',
		status: 'accepted',
		submitted_at: '2026-09-08T14:02:00Z',
		updated_at: '2026-09-09T08:00:00Z',
		conferences: applicationListConferenceRow(),
		...changes
	};
}

/** One row of the list's seat lookup, as the `committees!inner(...)` embed brings it. */
function applicationListSeatRow(changes: Record<string, unknown> = {}) {
	return {
		application_id: 'application-1',
		name: 'France',
		country_code: 'FR',
		committees: { name: 'United Nations Security Council', abbreviation: 'UNSC' },
		...changes
	};
}

/**
 * What `applications` answers the list with: these rows, and then nothing.
 *
 * The list asks for a window of rows at a time and only stops when one comes
 * back empty, for the same reason as `exportAnswers` in `./application-table.test.ts`,
 * so every test of it ends the answers with an empty one.
 */
function myApplicationAnswers(rows: Record<string, unknown>[]): unknown[][] {
	return [rows, []];
}

describe('listMyApplications', () => {
	it('asks about this person alone, newest change first, with the conference along', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: myApplicationAnswers([applicationListRow()]) }
		});

		await listMyApplications(supabase, 'user-1');

		// The select policy is "self; org.", so without this an organiser would
		// read their conference's applications on their own list.
		expect(queryOn(queries, APPLICATIONS).eq).toEqual([['user_id', 'user-1']]);
		expect(queryOn(queries, APPLICATIONS).order).toEqual([
			['updated_at', false],
			['id', false]
		]);
		expect(queryOn(queries, APPLICATIONS).columns).toContain('conferences!inner(');
		// What the organisers wrote to each other is never asked for.
		expect(queryOn(queries, APPLICATIONS).columns).not.toContain('internal_note');
	});

	it('gives the database column names the ones the list uses', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				[APPLICATIONS]: myApplicationAnswers([applicationListRow()]),
				[SEATS]: [[applicationListSeatRow()]]
			}
		});

		const applications = await listMyApplications(supabase, 'user-1');

		expect(applications).toEqual([
			{
				id: 'application-1',
				status: 'accepted',
				submittedAt: '2026-09-08T14:02:00Z',
				updatedAt: '2026-09-09T08:00:00Z',
				conference: {
					id: 'conference-1',
					slug: 'delftmun-2026',
					name: 'DelftMUN 2026',
					organizationName: 'Delft MUN Society',
					logoPath: 'logos/delftmun.png',
					startDate: '2026-02-12',
					endDate: '2026-02-15',
					timezone: 'Europe/Amsterdam',
					isArchived: false,
					applicationsCloseAt: '2026-12-15T22:59:00Z'
				},
				// The seat's country code travels with it, for the list to draw a flag from.
				seat: { seatName: 'France', committeeHeading: 'UNSC', countryCode: 'FR' }
			}
		]);
	});

	it('reads an archived conference as one that is over', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				[APPLICATIONS]: myApplicationAnswers([
					applicationListRow({
						conferences: applicationListConferenceRow({ status: 'archived' })
					})
				])
			}
		});

		const applications = await listMyApplications(supabase, 'user-1');

		// The list asks only whether the conference is over and done with, so the
		// status arrives as that one answer rather than as a word of its own.
		expect(applications[0].conference.isArchived).toBe(true);
	});

	it('leaves the organisation name null when Row Level Security withheld it', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				[APPLICATIONS]: myApplicationAnswers([
					applicationListRow({
						conferences: applicationListConferenceRow({ organizations: null })
					})
				])
			}
		});

		const applications = await listMyApplications(supabase, 'user-1');

		expect(applications[0].conference.organizationName).toBeNull();
	});

	it('puts each seat on the application that won it', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[APPLICATIONS]: myApplicationAnswers([
					applicationListRow(),
					applicationListRow({ id: 'application-2', status: 'submitted' })
				]),
				[SEATS]: [
					[
						applicationListSeatRow({
							application_id: 'application-2',
							name: 'Brazil',
							country_code: 'BR'
						})
					]
				]
			}
		});

		const applications = await listMyApplications(supabase, 'user-1');

		expect(queryOn(queries, SEATS).in).toEqual([
			['application_id', ['application-1', 'application-2']]
		]);
		expect(applications[0].seat).toBeNull();
		expect(applications[1].seat).toEqual({
			seatName: 'Brazil',
			committeeHeading: 'UNSC',
			countryCode: 'BR'
		});
	});

	it('calls a committee by its full name when it has no short one', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				[APPLICATIONS]: myApplicationAnswers([applicationListRow()]),
				[SEATS]: [
					[
						applicationListSeatRow({
							committees: { name: 'Economic and Social Council', abbreviation: null }
						})
					]
				]
			}
		});

		const applications = await listMyApplications(supabase, 'user-1');

		// `committeeHeading` is the rule every other page uses, which is why the
		// query asks for `abbreviation` beside `name`.
		expect(applications[0].seat?.committeeHeading).toBe('Economic and Social Council');
	});

	it('leaves an application that has won no seat without one', async () => {
		const { supabase } = createStandInSupabase({
			rows: { [APPLICATIONS]: myApplicationAnswers([applicationListRow({ status: 'submitted' })]) }
		});

		const applications = await listMyApplications(supabase, 'user-1');

		// Waiting for a decision is the ordinary case, not a fault.
		expect(applications[0].seat).toBeNull();
	});

	it('asks nothing about seats when this person has applied nowhere', async () => {
		const { supabase, queries } = createStandInSupabase();

		expect(await listMyApplications(supabase, 'user-1')).toEqual([]);
		// `.in('application_id', [])` would be a request that cannot match anything.
		expect(tablesRead(queries)).toEqual([APPLICATIONS]);
	});

	it('reads the list a window at a time until one comes back empty', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS]: myApplicationAnswers([applicationListRow()]) }
		});

		const applications = await listMyApplications(supabase, 'user-1');

		// `max_rows` in `supabase/config.toml` would cut one unbounded query off at a
		// thousand rows without saying so, so the list asks for a window and moves it
		// along by the rows that came back. Only an empty window is the end.
		expect(queriesOn(queries, APPLICATIONS).map((query) => query.range)).toEqual([
			[[0, 499]],
			[[1, 500]]
		]);
		expect(applications).toHaveLength(1);
	});

	it('keeps every application past the first window, and finds each one its seat', async () => {
		const manyRows = Array.from({ length: 1200 }, (_, index) =>
			applicationListRow({ id: `application-${index}` })
		);
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[APPLICATIONS]: [
					manyRows.slice(0, 500),
					manyRows.slice(500, 1000),
					manyRows.slice(1000),
					[]
				],
				[SEATS]: [
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[],
					[applicationListSeatRow({ application_id: 'application-1199', name: 'Brazil' })]
				]
			}
		});

		const applications = await listMyApplications(supabase, 'user-1');

		// More than `max_rows` allows in one answer, and every one of them arrives.
		expect(applications).toHaveLength(1200);
		expect(applications.at(-1)?.id).toBe('application-1199');
		// The seats are asked about a hundred applications at a time, so the address
		// of each request stays short enough for the server to take.
		const seatQueries = queriesOn(queries, SEATS);
		expect(seatQueries).toHaveLength(12);
		expect(seatQueries.every((query) => query.in[0][1].length <= 100)).toBe(true);
		expect(applications.at(-1)?.seat).toEqual({
			seatName: 'Brazil',
			committeeHeading: 'UNSC',
			countryCode: 'FR'
		});
	});

	it('stops when the window starts past the last row, rather than raising', async () => {
		const { supabase } = createStandInSupabase({
			rows: { [APPLICATIONS]: [[applicationListRow()]] },
			errors: { [APPLICATIONS]: [null, 'Requested range not satisfiable'] },
			errorCodes: { [APPLICATIONS]: [null, PAGE_OUT_OF_RANGE_CODE] }
		});

		// Supabase can answer a window past the last row with this code rather than
		// with an empty list, and it means the end, not a fault.
		expect(await listMyApplications(supabase, 'user-1')).toHaveLength(1);
	});

	it('raises when the applications query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS]: ['connection closed'] }
		});

		await expect(listMyApplications(supabase, 'user-1')).rejects.toThrow(
			'Could not list your applications'
		);
	});

	it('raises when the seat query fails rather than showing an accepted row with no seat', async () => {
		const { supabase } = createStandInSupabase({
			rows: { [APPLICATIONS]: myApplicationAnswers([applicationListRow()]) },
			errors: { [SEATS]: ['permission denied for table seats'] }
		});

		await expect(listMyApplications(supabase, 'user-1')).rejects.toThrow(
			'Could not read your seats'
		);
	});
});

// The three lookups below are exported because the organiser's review page in
// `./application-review.ts` gathers the same things about an application as
// the applicant's own page does. `getMyApplication` above already covers them
// as a whole; these say what each one promises on its own.

describe('listPreferredCommitteeNames', () => {
	it("names the committees in the applicant's order, leaving a deleted one out", async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				[COMMITTEES]: [
					[
						{ id: 'committee-2', name: 'Human Rights Council', abbreviation: null },
						{ id: 'committee-1', name: 'Security Council', abbreviation: 'UNSC' }
					]
				]
			}
		});

		const names = await listPreferredCommitteeNames(supabase, [
			'committee-1',
			'committee-gone',
			'committee-2'
		]);

		expect(names).toEqual(['UNSC', 'Human Rights Council']);
	});

	it('sends no request at all for an empty list', async () => {
		const { supabase, queries } = createStandInSupabase();

		expect(await listPreferredCommitteeNames(supabase, [])).toEqual([]);
		expect(queries).toEqual([]);
	});
});

describe('findSeatForApplication', () => {
	it('asks for the seat this application won, with its committee along', async () => {
		const seat = {
			id: 'seat-1',
			name: 'France',
			country_code: 'FR',
			committees: { slug: 'unsc', name: 'Security Council', abbreviation: 'UNSC' }
		};
		const { supabase, queries } = createStandInSupabase({ rows: { [SEATS]: [[seat]] } });

		expect(await findSeatForApplication(supabase, 'application-1')).toEqual(seat);
		expect(queryOn(queries, SEATS).eq).toEqual([['application_id', 'application-1']]);
	});

	it('answers null rather than raising when the seats cannot be read', async () => {
		const { supabase } = createStandInSupabase({ errors: { [SEATS]: ['permission denied'] } });

		expect(await findSeatForApplication(supabase, 'application-1')).toBeNull();
	});
});

describe('findInvoiceForSeat', () => {
	it("asks for the seat's newest invoice only, in the page's own names", async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[INVOICES]: [
					[
						{
							id: 'invoice-1',
							number: 'delftmun-2026-0031',
							status: 'unpaid',
							amount_cents: 4500,
							currency: 'EUR'
						}
					]
				]
			}
		});

		expect(await findInvoiceForSeat(supabase, 'seat-1')).toEqual({
			id: 'invoice-1',
			number: 'delftmun-2026-0031',
			status: 'unpaid',
			amountCents: 4500,
			currency: 'EUR'
		});
		expect(queryOn(queries, INVOICES).eq).toEqual([['seat_id', 'seat-1']]);
		expect(queryOn(queries, INVOICES).order).toEqual([['created_at', false]]);
		expect(queryOn(queries, INVOICES).limit).toEqual([1]);
	});

	it('answers null when the seat has no invoice', async () => {
		const { supabase } = createStandInSupabase();

		expect(await findInvoiceForSeat(supabase, 'seat-1')).toBeNull();
	});
});

describe('hasApplications', () => {
	it('answers true for somebody with an application', async () => {
		const { supabase } = createStandInSupabase({ rows: { [APPLICATIONS]: [[{ id: 'a-1' }]] } });

		expect(await hasApplications(supabase, 'user-1')).toBe(true);
	});

	it('answers true for a member of a delegation who has applied nowhere', async () => {
		const { supabase } = createStandInSupabase({
			rows: { delegation_members: [[{ user_id: 'user-1' }]] }
		});

		expect(await hasApplications(supabase, 'user-1')).toBe(true);
	});

	it('answers false for somebody with neither', async () => {
		const { supabase } = createStandInSupabase();

		expect(await hasApplications(supabase, 'user-1')).toBe(false);
	});

	it('asks about this person alone, one row at most', async () => {
		const { supabase, queries } = createStandInSupabase();

		await hasApplications(supabase, 'user-1');

		// An organiser may read their conference's applications and delegation
		// members, so without the filter every organiser would count as applied.
		expect(queryOn(queries, APPLICATIONS).eq).toEqual([['user_id', 'user-1']]);
		expect(queryOn(queries, APPLICATIONS).limit).toEqual([1]);
		expect(queryOn(queries, 'delegation_members').eq).toEqual([['user_id', 'user-1']]);
		expect(queryOn(queries, 'delegation_members').limit).toEqual([1]);
	});

	it('answers false rather than raising when a lookup fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS]: ['no connection'], delegation_members: ['no connection'] }
		});

		// It decides whether one link is in the top bar, so it must not replace
		// every page with an error.
		expect(await hasApplications(supabase, 'user-1')).toBe(false);
	});
});
