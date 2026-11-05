import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createApplicationQuestion,
	deleteApplicationQuestion,
	getApplicationQuestion,
	listApplicationQuestions,
	moveApplicationQuestion,
	updateApplicationQuestion,
	type ApplicationQuestionInput
} from './application-questions';

// These tests are about the decisions this module makes: which columns it asks
// for, which conference it asks inside, where a new question lands in the list,
// which columns a save is allowed to touch, and what the move arrows do at the
// ends of the list. Nothing here talks to a database; the stand-in client below
// writes down what it was asked for and answers with fixed rows. Whether the
// database really lets an organiser read and write those rows is Row Level
// Security's decision, and that is tested in `tests/db/applications.test.ts`.

/** An error in the shape the real client reports one. */
type QueryError = { message: string };

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
	/** `[column, value]` for every `.lt(...)` and `.gt(...)`, which look for a neighbour. */
	lt: [string, unknown][];
	gt: [string, unknown][];
	/** `[column, ascending]` for every `.order(...)`. */
	order: [string, boolean][];
	limit: number[];
};

/** What the stand-in should answer with. Everything here has a harmless default. */
type StandInAnswers = {
	/**
	 * The rows each relation answers with, as a list of answers rather than as
	 * one: adding a question asks the table twice, once for the position the new
	 * question goes after and once to insert it, and those two differ. Every query
	 * takes the next answer along, and the last one is repeated once the list runs
	 * out, so a relation that always answers the same thing is a list of one.
	 */
	rows?: Record<string, unknown[][]>;
	/**
	 * The message each query to a relation fails with, as a list for the same
	 * reason, where `null` is a query that works. A relation whose first query is
	 * fine and whose second is turned away is `[null, 'refused']`.
	 */
	errors?: Record<string, (string | null)[]>;
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

/** What an awaited query answers with: a list of rows, or nothing and a message. */
type ListAnswer = {
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
};

/** One step of a query. Every step hands the builder back, which is what chains them. */
type QueryBuilder = {
	select: (columns: string) => QueryBuilder;
	insert: (rows: Record<string, unknown>) => QueryBuilder;
	update: (columns: Record<string, unknown>) => QueryBuilder;
	delete: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	lt: (column: string, value: unknown) => QueryBuilder;
	gt: (column: string, value: unknown) => QueryBuilder;
	order: (column: string, options: { ascending: boolean }) => QueryBuilder;
	limit: (count: number) => QueryBuilder;
	maybeSingle: () => SingleRowBuilder;
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
			inserted: null,
			updated: null,
			isDelete: false,
			eq: [],
			lt: [],
			gt: [],
			order: [],
			limit: []
		};
		queries.push(query);

		const used = answersUsed.get(table) ?? 0;
		answersUsed.set(table, used + 1);

		const rows = rowsForQuery(answers.rows?.[table] ?? [], used);
		const message = messageForQuery(answers.errors?.[table] ?? [], used);
		const error = message ? { message } : null;
		const listAnswer: ListAnswer = { data: message ? null : rows, error };
		const singleRowAnswer: SingleRowAnswer = { data: message ? null : (rows[0] ?? null), error };

		const builder: QueryBuilder = {
			select: (columns) => {
				query.columns = columns;
				return builder;
			},
			insert: (rows) => {
				query.inserted = [rows];
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
			maybeSingle: () => ({ overrideTypes: async () => singleRowAnswer }),
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

/** The relation every query in this module is sent to. */
const QUESTIONS = 'application_questions';

/** The first query the module sent to one relation, so a test can read its conditions back. */
function queryOn(queries: RecordedQuery[], table: string): RecordedQuery {
	const query = queries.find((sent) => sent.table === table);

	if (!query) {
		throw new Error(`Nothing was ever sent to "${table}"`);
	}

	return query;
}

/** One `application_questions` row with every column this module reads. */
function questionRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'question-1',
		label: 'Any dietary requirements?',
		help_text: 'We pass this on to the caterer.',
		type: 'short_text',
		options: [],
		is_required: false,
		position: 0,
		...changes
	};
}

/** What the question form hands over, already checked. */
function questionInput(changes: Partial<ApplicationQuestionInput> = {}): ApplicationQuestionInput {
	return {
		label: 'T-shirt size',
		helpText: null,
		type: 'single_choice',
		options: ['S', 'M', 'L'],
		isRequired: true,
		...changes
	};
}

describe('listApplicationQuestions', () => {
	it("asks for one conference's questions in the organiser's own order", async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[QUESTIONS]: [
					[
						questionRow(),
						questionRow({
							id: 'question-2',
							label: 'T-shirt size',
							help_text: null,
							type: 'single_choice',
							options: ['S', 'M', 'L'],
							is_required: true,
							position: 1
						})
					]
				]
			}
		});

		const questions = await listApplicationQuestions(supabase, 'conference-1');

		expect(queryOn(queries, QUESTIONS).eq).toEqual([['conference_id', 'conference-1']]);
		// `id` is the tie-break, because two questions may share a position.
		expect(queryOn(queries, QUESTIONS).order).toEqual([
			['position', true],
			['id', true]
		]);
		expect(questions).toHaveLength(2);
		expect(questions[1].label).toBe('T-shirt size');
	});

	it('gives the database column names the ones the pages use', async () => {
		const { supabase } = createStandInSupabase({ rows: { [QUESTIONS]: [[questionRow()]] } });

		const [question] = await listApplicationQuestions(supabase, 'conference-1');

		expect(question).toEqual({
			id: 'question-1',
			label: 'Any dietary requirements?',
			helpText: 'We pass this on to the caterer.',
			type: 'short_text',
			options: [],
			isRequired: false,
			position: 0
		});
	});

	it('answers with an empty list when the conference has no questions yet', async () => {
		const { supabase } = createStandInSupabase();

		expect(await listApplicationQuestions(supabase, 'conference-1')).toEqual([]);
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { [QUESTIONS]: ['no such column'] } });

		await expect(listApplicationQuestions(supabase, 'conference-1')).rejects.toThrow(
			'Could not list the questions'
		);
	});
});

describe('getApplicationQuestion', () => {
	it('asks for the question inside this conference, so an id from another cannot be reached', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [QUESTIONS]: [[questionRow()]] }
		});

		const question = await getApplicationQuestion(supabase, 'conference-1', 'question-1');

		expect(queryOn(queries, QUESTIONS).eq).toEqual([
			['conference_id', 'conference-1'],
			['id', 'question-1']
		]);
		expect(question?.label).toBe('Any dietary requirements?');
		expect(question?.helpText).toBe('We pass this on to the caterer.');
	});

	it('answers with nothing when this conference has no question with that id', async () => {
		const { supabase } = createStandInSupabase();

		expect(await getApplicationQuestion(supabase, 'conference-1', 'question-9')).toBeNull();
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { [QUESTIONS]: ['no such column'] } });

		await expect(getApplicationQuestion(supabase, 'conference-1', 'question-1')).rejects.toThrow(
			'Could not load the question'
		);
	});
});

describe('createApplicationQuestion', () => {
	it('puts a new question one place past the one furthest down the list', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [QUESTIONS]: [[{ position: 2 }], []] }
		});

		await createApplicationQuestion(supabase, 'conference-1', questionInput());

		// Where the question goes is read fresh, highest position first, because the
		// list the organiser was looking at may be an hour old by the time they save.
		expect(queries[0].order).toEqual([['position', false]]);
		expect(queries[0].limit).toEqual([1]);
		expect(queries[1].inserted).toEqual([
			{
				conference_id: 'conference-1',
				label: 'T-shirt size',
				help_text: null,
				type: 'single_choice',
				options: ['S', 'M', 'L'],
				is_required: true,
				position: 3
			}
		]);
	});

	it('puts the first question of a conference at the top of the list', async () => {
		const { supabase, queries } = createStandInSupabase();

		await createApplicationQuestion(supabase, 'conference-1', questionInput());

		expect(queries[1].inserted?.[0].position).toBe(0);
	});

	it('raises when the insert is refused', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [QUESTIONS]: [null, 'new row violates row-level security policy'] }
		});

		await expect(
			createApplicationQuestion(supabase, 'conference-1', questionInput())
		).rejects.toThrow('row-level security');
	});
});

describe('updateApplicationQuestion', () => {
	it('never sends the conference or the position', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateApplicationQuestion(
			supabase,
			'question-1',
			questionInput({ label: 'T-shirt size (unisex)' })
		);

		const changed = queryOn(queries, QUESTIONS).updated ?? {};

		// A question never moves between conferences, and `moveApplicationQuestion`
		// owns `position`, so neither column is ever sent from here.
		expect(Object.keys(changed)).not.toContain('conference_id');
		expect(Object.keys(changed)).not.toContain('position');
		expect(changed.label).toBe('T-shirt size (unisex)');
		expect(queryOn(queries, QUESTIONS).eq).toEqual([['id', 'question-1']]);
	});

	it('writes an empty help text and an empty options list as they arrive', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateApplicationQuestion(
			supabase,
			'question-1',
			questionInput({ type: 'long_text', helpText: null, options: [] })
		);

		// The page has already turned an empty help text into `null` and the options
		// of a question that is not a choice type into an empty list, so this writes
		// them down rather than deciding anything of its own.
		expect(queryOn(queries, QUESTIONS).updated).toEqual({
			label: 'T-shirt size',
			help_text: null,
			type: 'long_text',
			options: [],
			is_required: true
		});
	});

	it('raises when the update is refused', async () => {
		const { supabase } = createStandInSupabase({
			errors: { [QUESTIONS]: ['new row violates row-level security policy'] }
		});

		await expect(
			updateApplicationQuestion(supabase, 'question-1', questionInput())
		).rejects.toThrow('row-level security');
	});
});

describe('moveApplicationQuestion', () => {
	it('swaps places with the question above', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[QUESTIONS]: [[{ id: 'question-2', position: 1 }], [{ id: 'question-1', position: 0 }]]
			}
		});

		await moveApplicationQuestion(supabase, 'conference-1', 'question-2', 'up');

		// Up the list is towards the lower positions, so the neighbour is the
		// highest position below this one.
		expect(queries[1].lt).toEqual([['position', 1]]);
		expect(queries[1].order).toEqual([
			['position', false],
			['id', false]
		]);
		expect(queries[1].limit).toEqual([1]);
		// The two trade positions, and no other question is touched.
		expect(queries[2].updated).toEqual({ position: 0 });
		expect(queries[2].eq).toEqual([['id', 'question-2']]);
		expect(queries[3].updated).toEqual({ position: 1 });
		expect(queries[3].eq).toEqual([['id', 'question-1']]);
	});

	it('swaps places with the question below', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				[QUESTIONS]: [[{ id: 'question-1', position: 0 }], [{ id: 'question-2', position: 1 }]]
			}
		});

		await moveApplicationQuestion(supabase, 'conference-1', 'question-1', 'down');

		// Down the list is towards the higher positions, and the tie-break runs the
		// other way round as well.
		expect(queries[1].gt).toEqual([['position', 0]]);
		expect(queries[1].order).toEqual([
			['position', true],
			['id', true]
		]);
		expect(queries[2].updated).toEqual({ position: 1 });
		expect(queries[3].updated).toEqual({ position: 0 });
	});

	it('does nothing at all at the top of the list', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [QUESTIONS]: [[{ id: 'question-1', position: 0 }], []] }
		});

		await moveApplicationQuestion(supabase, 'conference-1', 'question-1', 'up');

		// The question at the top has nothing above it, and the arrow there does
		// nothing rather than failing.
		const changes = queries.filter((query) => query.updated !== null);

		expect(changes).toEqual([]);
	});

	it('does nothing at all at the bottom of the list', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { [QUESTIONS]: [[{ id: 'question-3', position: 2 }], []] }
		});

		await moveApplicationQuestion(supabase, 'conference-1', 'question-3', 'down');

		expect(queries[1].gt).toEqual([['position', 2]]);

		const changes = queries.filter((query) => query.updated !== null);

		expect(changes).toEqual([]);
	});

	it('moves nothing when this conference has no question with that id', async () => {
		const { supabase, queries } = createStandInSupabase();

		await moveApplicationQuestion(supabase, 'conference-1', 'question-9', 'up');

		// The conference is part of the question, so an id from somebody else's
		// conference moves nothing, and no neighbour is even looked for.
		expect(queries).toHaveLength(1);
		expect(queries[0].eq).toEqual([
			['conference_id', 'conference-1'],
			['id', 'question-9']
		]);
	});

	it("raises when the question's place in the list could not be read", async () => {
		const { supabase } = createStandInSupabase({
			errors: { [QUESTIONS]: ['permission denied for table application_questions'] }
		});

		await expect(
			moveApplicationQuestion(supabase, 'conference-1', 'question-1', 'up')
		).rejects.toThrow('permission denied');
	});
});

describe('deleteApplicationQuestion', () => {
	it('deletes the question by its id', async () => {
		const { supabase, queries } = createStandInSupabase();

		await deleteApplicationQuestion(supabase, 'question-1');

		// Unlike a fee, nothing hides a question somebody has already answered, so
		// there is no "did it really go" to answer: the delete either works or
		// reports why it did not.
		expect(queryOn(queries, QUESTIONS).isDelete).toBe(true);
		expect(queryOn(queries, QUESTIONS).eq).toEqual([['id', 'question-1']]);
	});

	it('raises when the delete fails', async () => {
		const { supabase } = createStandInSupabase({ errors: { [QUESTIONS]: ['connection closed'] } });

		await expect(deleteApplicationQuestion(supabase, 'question-1')).rejects.toThrow(
			'Could not delete the question'
		);
	});
});
