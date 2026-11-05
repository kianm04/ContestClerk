import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EMPTY_APPLICATION_LIST_QUERY, type ApplicationListQuery } from '$lib/applications';
import {
	findQueueNeighbours,
	getApplicationForReview,
	revokeAcceptance,
	updateApplicationInternalNote
} from './application-review';

// `revokeSeat`, which `revokeAcceptance` calls, ends by removing the position
// paper's file with the service role key. That is tested beside
// `./allocation-grid.ts`, so here it is a stand-in that does nothing.
vi.mock('./orphaned-document-files', () => ({ removeOrphanedDocumentFiles: vi.fn() }));

// These tests are about the queries the organiser's review page at
// `/manage/[slug]/applications/[applicationId]` sends: which application it
// asks for and in which conference, what it gathers beside it, how it walks
// the table's queue to find the neighbours, and the two writes the page makes.
// Nothing here talks to a database; the stand-in client below writes down what
// it was asked for and answers with fixed rows.

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

/** The view the organiser's queries read: `applications` with the applicant's profile joined on. */
const APPLICATIONS_VIEW = 'applications_with_applicant';

/** The two views the review page reads the private details through, one per permission. */
const CONTACT_VIEW = 'staff_contact_details';
const WELFARE_VIEW = 'staff_welfare_details';

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

/** One person's private details. Both views are handed the whole row. */
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

/** One row of the view as the review page asks for it: every column of the application. */
function reviewApplicationRow(changes: Record<string, unknown> = {}) {
	return {
		...exportApplicationRow(),
		conference_id: 'conference-1',
		...changes
	};
}

describe('getApplicationForReview', () => {
	it('asks for the application inside this conference only', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[reviewApplicationRow()]] }
		});

		await getApplicationForReview(supabase, 'conference-1', 'application-1');

		expect(queryOn(queries, APPLICATIONS_VIEW).eq).toEqual([
			['id', 'application-1'],
			['conference_id', 'conference-1']
		]);
		// The organisers' note is a row of its own table, never a column of the
		// view, so the applicant's own row can be read without it.
		expect(queryOn(queries, APPLICATIONS_VIEW).columns).not.toContain('internal_note');
		expect(queryOn(queries, INTERNAL_NOTES).eq).toEqual([['application_id', 'application-1']]);
	});

	it('answers null for an application that is not there, reading nothing more', async () => {
		const { supabase, queries } = createStandInSupabase();

		expect(await getApplicationForReview(supabase, 'conference-1', 'application-1')).toBeNull();
		expect(tablesRead(queries)).toEqual([APPLICATIONS_VIEW]);
	});

	it('treats an id that is not a uuid as not found', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS_VIEW]: ['invalid input syntax for type uuid'] },
			errorCodes: { [APPLICATIONS_VIEW]: ['22P02'] }
		});

		expect(await getApplicationForReview(supabase, 'conference-1', 'nonsense')).toBeNull();
	});

	it('answers null for a draft, which Row Level Security would let an organiser read', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[reviewApplicationRow({ status: 'draft' })]] }
		});

		expect(await getApplicationForReview(supabase, 'conference-1', 'application-1')).toBeNull();
		expect(tablesRead(queries)).toEqual([APPLICATIONS_VIEW]);
	});

	it('gathers the private details, the committees, the seat and its invoice', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				[APPLICATIONS_VIEW]: [[reviewApplicationRow({ status: 'accepted' })]],
				[INTERNAL_NOTES]: [[{ note: 'Strong on procedure.' }]],
				[CONTACT_VIEW]: [[applicantDetailsRow()]],
				[WELFARE_VIEW]: [[applicantDetailsRow()]],
				[COMMITTEES]: [[preferredCommitteeRow()]],
				[SEATS]: [
					[
						{
							id: 'seat-1',
							name: 'France',
							committees: { slug: 'unsc', name: 'Security Council', abbreviation: 'UNSC' }
						}
					]
				],
				[INVOICES]: [
					[
						{
							id: 'invoice-1',
							number: 'THIMUN-0007',
							status: 'paid',
							amount_cents: 4500,
							currency: 'EUR'
						}
					]
				]
			}
		});

		const review = await getApplicationForReview(supabase, 'conference-1', 'application-1');

		expect(review?.profile.fullName).toBe('Anna Kowalski');
		expect(review?.application.internalNote).toBe('Strong on procedure.');
		expect(review?.details).toMatchObject({
			email: 'anna@example.org',
			dateOfBirth: '2008-04-11',
			emergencyContactName: 'Maria Kowalska'
		});
		expect(review?.preferredCommittees).toEqual(['UNSC']);
		expect(review?.seat).toEqual({ id: 'seat-1', name: 'France', committeeLabel: 'UNSC' });
		expect(review?.invoice).toMatchObject({ number: 'THIMUN-0007', status: 'paid' });
	});

	it('answers null details, and no seat or invoice, when there are none to read', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[reviewApplicationRow()]] }
		});

		const review = await getApplicationForReview(supabase, 'conference-1', 'application-1');

		expect(review?.details).toBeNull();
		expect(review?.seat).toBeNull();
		expect(review?.invoice).toBeNull();
		// Without a seat there is no invoice to look for.
		expect(tablesRead(queries)).not.toContain(INVOICES);
	});

	it('raises when the application cannot be read', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [APPLICATIONS_VIEW]: ['connection closed'] }
		});

		await expect(
			getApplicationForReview(supabase, 'conference-1', 'application-1')
		).rejects.toThrow('Could not load the application');
	});
});

describe('findQueueNeighbours', () => {
	it('finds the application either side, in the same queue as the table', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[{ id: 'a' }, { id: 'b' }, { id: 'c' }]] }
		});

		const neighbours = await findQueueNeighbours(
			supabase,
			'conference-1',
			listQuery({ status: 'waitlisted' }),
			'b'
		);

		expect(neighbours).toEqual({ previousId: 'a', nextId: 'c' });
		expect(queryOn(queries, APPLICATIONS_VIEW).columns).toBe('id');
		expect(queryOn(queries, APPLICATIONS_VIEW).eq).toContainEqual(['status', 'waitlisted']);
	});

	it('has no previous for the first and no next for the last', async () => {
		const { supabase } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[{ id: 'a' }, { id: 'b' }], []] }
		});

		expect(await findQueueNeighbours(supabase, 'conference-1', listQuery(), 'a')).toEqual({
			previousId: null,
			nextId: 'b'
		});
	});

	it('reads on into the next window when the application is the last of one', async () => {
		const firstWindow = Array.from({ length: 500 }, (_, index) => ({ id: `row-${index}` }));
		const { supabase, queries } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [firstWindow, [{ id: 'row-500' }]] }
		});

		const neighbours = await findQueueNeighbours(supabase, 'conference-1', listQuery(), 'row-499');

		expect(neighbours).toEqual({ previousId: 'row-498', nextId: 'row-500' });
		expect(queriesOn(queries, APPLICATIONS_VIEW).map((query) => query.range[0])).toEqual([
			[0, 499],
			[500, 999]
		]);
	});

	it('has no neighbours at all for an application no longer in the queue', async () => {
		const { supabase } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[{ id: 'a' }, { id: 'c' }], []] }
		});

		expect(await findQueueNeighbours(supabase, 'conference-1', listQuery(), 'b')).toEqual({
			previousId: null,
			nextId: null
		});
	});

	it('treats a window past the last row as the end of the queue', async () => {
		const { supabase } = createStandInSupabase({
			rows: { [APPLICATIONS_VIEW]: [[{ id: 'a' }, { id: 'b' }], []] },
			errors: { [APPLICATIONS_VIEW]: [null, 'Requested range not satisfiable'] },
			errorCodes: { [APPLICATIONS_VIEW]: [null, PAGE_OUT_OF_RANGE_CODE] }
		});

		expect(await findQueueNeighbours(supabase, 'conference-1', listQuery(), 'b')).toEqual({
			previousId: 'a',
			nextId: null
		});
	});
});

/**
 * The stand-in client with `rpc` added, which `revokeSeat` in `./allocation-grid.ts`
 * calls. It answers with this error message, or works when it is `null`.
 */
function standInWithRpc(rpcError: string | null) {
	const standIn = createStandInSupabase();
	const rpc = vi.fn(async () => ({ error: rpcError ? { message: rpcError } : null }));

	Object.assign(standIn.supabase, { rpc });

	return { ...standIn, rpc };
}

describe('revokeAcceptance', () => {
	it('revokes the seat and leaves the application as revoke_seat left it: not accepted', async () => {
		const { supabase, queries, rpc } = standInWithRpc(null);

		await revokeAcceptance(supabase, 'application-1', 'seat-1', 'rejected');

		expect(rpc).toHaveBeenCalledWith('revoke_seat', { seat_id: 'seat-1' });
		expect(queries).toEqual([]);
	});

	it('then marks it withdrawn, but only while it is still the rejection just written', async () => {
		const { supabase, queries } = standInWithRpc(null);

		await revokeAcceptance(supabase, 'application-1', 'seat-1', 'withdrawn');

		expect(queryOn(queries, APPLICATIONS).updated).toEqual({ status: 'withdrawn' });
		expect(queryOn(queries, APPLICATIONS).eq).toEqual([
			['id', 'application-1'],
			['status', 'rejected']
		]);
	});

	it('passes the database refusal on, writing nothing else', async () => {
		const { supabase, queries } = standInWithRpc('Nobody is sitting in that seat');

		await expect(
			revokeAcceptance(supabase, 'application-1', 'seat-1', 'withdrawn')
		).rejects.toThrow('Nobody is sitting in that seat');
		expect(queries).toEqual([]);
	});
});

describe('updateApplicationInternalNote', () => {
	it('saves the note on this application', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateApplicationInternalNote(supabase, 'application-1', 'Call her school.');

		// An upsert keyed on the application: the first note makes the row and
		// every later one changes it.
		expect(queryOn(queries, INTERNAL_NOTES).upserted).toEqual({
			application_id: 'application-1',
			note: 'Call her school.'
		});
	});

	it('stores null for an emptied box rather than an empty string', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateApplicationInternalNote(supabase, 'application-1', '');

		expect(queryOn(queries, INTERNAL_NOTES).upserted).toEqual({
			application_id: 'application-1',
			note: null
		});
	});

	it('raises when the save fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [INTERNAL_NOTES]: ['connection closed'] }
		});

		await expect(updateApplicationInternalNote(supabase, 'application-1', 'x')).rejects.toThrow(
			'Could not save the note'
		);
	});
});
