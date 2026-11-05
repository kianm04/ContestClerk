import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	countSubmittedApplications,
	readApplicationFormSettings,
	updateApplicationFormSettings,
	updateApplicationWindow
} from './application-form-settings';

// These tests are about the decisions this module makes: which columns it asks
// for, which columns each of the page's two Save buttons is allowed to write,
// and which applications count as somebody having applied. Nothing here talks
// to a database; the stand-in client below writes down what it was asked for
// and answers with fixed rows. Whether the database really lets an organiser
// read and write those rows is Row Level Security's decision, and that is
// tested in `tests/db/`.

/** An error in the shape the real client reports one. */
type QueryError = { message: string };

/**
 * The second argument of `.select(...)`: what a query wants besides the columns.
 * `count: 'exact'` asks for the number of matches as well, and `head: true` asks
 * for that number instead of the rows.
 */
type SelectOptions = { count?: string; head?: boolean };

/** What one query this module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns `.select(...)` was given, or `''` for a query that read nothing back. */
	columns: string;
	/** The options `.select(...)` was given, or `null` when it was given none. */
	selectOptions: SelectOptions | null;
	/** The columns `.update(...)` was given, or `null` when the query changed nothing. */
	updated: Record<string, unknown> | null;
	eq: [string, unknown][];
	/** `[column, value]` for every `.neq(...)`, which asks for a column to be anything else. */
	neq: [string, unknown][];
};

/** What the stand-in should answer with. Everything here has a harmless default. */
type StandInAnswers = {
	/**
	 * The rows each relation answers with, as a list of answers rather than as
	 * one, so a module that asks the same relation twice can be given two
	 * different answers. Every query takes the next answer along, and the last one
	 * is repeated once the list runs out, so a relation that always answers the
	 * same thing is a list of one.
	 */
	rows?: Record<string, unknown[][]>;
	/**
	 * The message each query to a relation fails with, as a list for the same
	 * reason, where `null` is a query that works.
	 */
	errors?: Record<string, (string | null)[]>;
	/**
	 * The number `count: 'exact'` reports. Only one query in this module asks for
	 * a count, so one number is enough. `null` is what the real client answers
	 * with when it has no count to report, which the counting lookup has to cope
	 * with.
	 */
	count?: number | null;
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

/** What an awaited query answers with: the three fields the real client gives back. */
type ListAnswer = {
	data: unknown[] | null;
	error: QueryError | null;
	count: number | null;
};

/** What a chain ending in `maybeSingle` answers with: one row rather than a list. */
type SingleRowAnswer = {
	data: unknown;
	error: QueryError | null;
};

/** The end of a chain that asked for one row rather than a list. */
type SingleRowBuilder = {
	overrideTypes: () => Promise<SingleRowAnswer>;
};

/** One step of a query. Every step hands the builder back, which is what chains them. */
type QueryBuilder = {
	select: (columns: string, options?: SelectOptions) => QueryBuilder;
	update: (columns: Record<string, unknown>) => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	neq: (column: string, value: unknown) => QueryBuilder;
	maybeSingle: () => SingleRowBuilder;
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
 * for that relation. A chain ending in `maybeSingle` is answered with the first
 * of those rows, the way the real one answers with the first match.
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
			selectOptions: null,
			updated: null,
			eq: [],
			neq: []
		};
		queries.push(query);

		const used = answersUsed.get(table) ?? 0;
		answersUsed.set(table, used + 1);

		const rows = rowsForQuery(answers.rows?.[table] ?? [], used);
		const message = messageForQuery(answers.errors?.[table] ?? [], used);
		const error = message ? { message } : null;
		const count = answers.count === undefined ? 0 : answers.count;
		const listAnswer: ListAnswer = {
			data: message ? null : rows,
			error,
			count: message ? null : count
		};
		const singleRowAnswer: SingleRowAnswer = { data: message ? null : (rows[0] ?? null), error };

		const builder: QueryBuilder = {
			select: (columns, options) => {
				query.columns = columns;
				query.selectOptions = options ?? null;
				return builder;
			},
			update: (columns) => {
				query.updated = columns;
				return builder;
			},
			eq: (column, value) => {
				query.eq.push([column, value]);
				return builder;
			},
			neq: (column, value) => {
				query.neq.push([column, value]);
				return builder;
			},
			maybeSingle: () => ({ overrideTypes: async () => singleRowAnswer }),
			then: (resolve) => resolve(listAnswer)
		};

		return builder;
	}

	const supabase = { from: builderFor };

	return { supabase: supabase as unknown as SupabaseClient, queries };
}

/** The first query the module sent to one relation, so a test can read its conditions back. */
function queryOn(queries: RecordedQuery[], table: string): RecordedQuery {
	const query = queries.find((sent) => sent.table === table);

	if (!query) {
		throw new Error(`Nothing was ever sent to "${table}"`);
	}

	return query;
}

/** What the "Window and who can apply" form hands over, already checked. */
function windowInput(changes: Record<string, unknown> = {}) {
	return {
		applicationsOpenAt: '2027-10-01T07:00:00Z',
		applicationsCloseAt: '2027-12-15T22:59:00Z',
		acceptsIndividualApplications: true,
		acceptsDelegations: true,
		...changes
	};
}

/** What the "What the form asks" form hands over, already checked. */
function formSettingsInput(changes: Record<string, unknown> = {}) {
	return {
		committeePreferenceCount: 2,
		askMotivation: true,
		positionPaperRequired: true,
		positionPaperDeadline: '2027-12-20T22:59:00Z',
		...changes
	};
}

describe('readApplicationFormSettings', () => {
	it('reads the two columns the conference does not already carry, in one query', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				conferences: [[{ committee_preference_count: 3, ask_motivation: false }]]
			}
		});

		const settings = await readApplicationFormSettings(supabase, 'conference-1');

		// Everything else the page shows comes with `data.conference` from the
		// layout; only these two are missing from it, and they are asked for
		// together rather than one query each.
		expect(queryOn(queries, 'conferences').columns).toBe(
			'committee_preference_count, ask_motivation'
		);
		expect(queryOn(queries, 'conferences').eq).toEqual([['id', 'conference-1']]);
		expect(settings).toEqual({ committeePreferenceCount: 3, askMotivation: false });
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { conferences: ['permission denied for table conferences'] }
		});

		await expect(readApplicationFormSettings(supabase, 'conference-1')).rejects.toThrow(
			'permission denied'
		);
	});

	it('raises rather than filling in defaults when there is no such conference', async () => {
		const { supabase } = createStandInSupabase();

		// The layout above the page has already read this conference, so a missing
		// row is a fault rather than something to show the organiser a default for.
		await expect(readApplicationFormSettings(supabase, 'conference-1')).rejects.toThrow(
			'conference-1'
		);
	});
});

describe('updateApplicationWindow', () => {
	it('writes the four window columns and nothing else', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateApplicationWindow(
			supabase,
			'conference-1',
			windowInput({ acceptsDelegations: false })
		);

		expect(queryOn(queries, 'conferences').updated).toEqual({
			applications_open_at: '2027-10-01T07:00:00Z',
			applications_close_at: '2027-12-15T22:59:00Z',
			accepts_individual_applications: true,
			accepts_delegations: false
		});
		expect(queryOn(queries, 'conferences').eq).toEqual([['id', 'conference-1']]);
	});

	it('never touches what the section below it owns', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateApplicationWindow(supabase, 'conference-1', windowInput());

		const changed = Object.keys(queryOn(queries, 'conferences').updated ?? {});

		// Each section of the page has its own Save button. If this update carried
		// the other section's columns as well it would write back whatever that
		// section happened to be showing, quietly undoing a change saved there.
		expect(changed).not.toContain('committee_preference_count');
		expect(changed).not.toContain('ask_motivation');
		expect(changed).not.toContain('position_paper_required');
		expect(changed).not.toContain('position_paper_deadline');
		// Migration 0008's trigger refuses a change to `organization_id`, so it is
		// never sent from here either.
		expect(changed).not.toContain('organization_id');
	});

	it('raises when the update is refused', async () => {
		const { supabase } = createStandInSupabase({
			errors: { conferences: ['new row violates row-level security policy'] }
		});

		await expect(updateApplicationWindow(supabase, 'conference-1', windowInput())).rejects.toThrow(
			'row-level security'
		);
	});
});

describe('updateApplicationFormSettings', () => {
	it('writes the four columns the "What the form asks" section owns', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateApplicationFormSettings(
			supabase,
			'conference-1',
			formSettingsInput({ committeePreferenceCount: 0, positionPaperDeadline: null })
		);

		expect(queryOn(queries, 'conferences').updated).toEqual({
			committee_preference_count: 0,
			ask_motivation: true,
			position_paper_required: true,
			position_paper_deadline: null
		});
		expect(queryOn(queries, 'conferences').eq).toEqual([['id', 'conference-1']]);
	});

	it('never touches the window the section above it owns', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateApplicationFormSettings(supabase, 'conference-1', formSettingsInput());

		const changed = Object.keys(queryOn(queries, 'conferences').updated ?? {});

		// The other half of the two-Save-buttons rule: saving what the form asks
		// must not reopen or close the application window.
		expect(changed).not.toContain('applications_open_at');
		expect(changed).not.toContain('applications_close_at');
		expect(changed).not.toContain('accepts_individual_applications');
		expect(changed).not.toContain('accepts_delegations');
		expect(changed).not.toContain('organization_id');
	});

	it('raises when the update is refused', async () => {
		const { supabase } = createStandInSupabase({
			errors: { conferences: ['new row violates row-level security policy'] }
		});

		await expect(
			updateApplicationFormSettings(supabase, 'conference-1', formSettingsInput())
		).rejects.toThrow('row-level security');
	});
});

describe('countSubmittedApplications', () => {
	it('counts every application of this conference that is not a draft', async () => {
		const { supabase, queries } = createStandInSupabase({ count: 7 });

		const applied = await countSubmittedApplications(supabase, 'conference-1');

		expect(queryOn(queries, 'applications').eq).toEqual([['conference_id', 'conference-1']]);
		// A draft is somebody who started the form and never sent it, and the spec
		// says drafts are invisible to organisers. An organiser can read one, so
		// leaving it out has to be deliberate.
		expect(queryOn(queries, 'applications').neq).toEqual([['status', 'draft']]);
		expect(applied).toBe(7);
	});

	it('asks Supabase for the count instead of for the applications', async () => {
		const { supabase, queries } = createStandInSupabase();

		await countSubmittedApplications(supabase, 'conference-1');

		// `head: true` leaves the rows in the database. Without it the page would
		// fetch three hundred whole applications to decide whether a radio button is
		// locked.
		expect(queryOn(queries, 'applications').columns).toBe('id');
		expect(queryOn(queries, 'applications').selectOptions).toEqual({
			count: 'exact',
			head: true
		});
	});

	it('answers zero when Supabase reports no count at all', async () => {
		const { supabase } = createStandInSupabase({ count: null });

		expect(await countSubmittedApplications(supabase, 'conference-1')).toBe(0);
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { applications: ['permission denied for table applications'] }
		});

		await expect(countSubmittedApplications(supabase, 'conference-1')).rejects.toThrow(
			'Could not count the applications'
		);
	});
});
