import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeFormValues } from '$lib/committee-details';
import {
	createCommittee,
	deleteCommittee,
	getCommitteeForManage,
	listCommitteeSlugs,
	listCommitteesForManage,
	moveCommittee,
	updateCommittee,
	updateCommitteeAgenda
} from './manage-committees';

// These tests are about the decisions the organiser's committees editor makes.
// The editor writes as well as reads, and a move asks the same relation twice
// over and needs a different answer each time, so the stand-in client below
// records every write and can answer one relation differently each time.
// Nothing here talks to a database: whether the policies really let an
// organiser write these rows is tested in `tests/db/committees-access.test.ts`.

/** An error in the shape the real client reports one. */
type QueryError = { message: string; code?: string };

/** What one query the editor sent was asking for. */
type EditorQuery = {
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
	/** `[column, value]` for every `.neq(...)`, which asks for a column to be anything else. */
	neq: [string, unknown][];
	in: [string, unknown[]][];
	/** `[column, value]` for every `.lt(...)` and `.gt(...)`, which look for a neighbour. */
	lt: [string, unknown][];
	gt: [string, unknown][];
	/** `[column, ascending]` for every `.order(...)`. */
	order: [string, boolean][];
	limit: number[];
};

/** What the editor stand-in should answer with. Everything here has a harmless default. */
type EditorAnswers = {
	/**
	 * The rows each relation answers with, as a list of answers rather than as
	 * one: a move asks the `committees` table twice, once for the committee it is
	 * moving and once for its neighbour, and those two have to differ. Every query
	 * takes the next answer along, and the last one is repeated once the list runs
	 * out, so a relation that always answers the same thing is a list of one.
	 */
	rows?: Record<string, unknown[][]>;
	/** The relations whose query fails, and the message each fails with. */
	errors?: Record<string, string>;
	/** The error code beside that message, for the relations that need one. */
	errorCodes?: Record<string, string>;
};

/** What an awaited query answers with: a list of rows, or nothing and a message. */
type EditorAnswer = {
	data: unknown[] | null;
	error: QueryError | null;
};

/** What a chain ending in `maybeSingle` or `single` answers with: one row rather than a list. */
type EditorSingleRowAnswer = {
	data: unknown;
	error: QueryError | null;
};

/** The end of a chain that asked for one row rather than a list. */
type EditorSingleRowBuilder = {
	overrideTypes: () => Promise<EditorSingleRowAnswer>;
	then: (resolve: (answer: EditorSingleRowAnswer) => void) => void;
};

/** One step of a query on the editor stand-in. Every step hands the builder back. */
type EditorBuilder = {
	select: (columns: string) => EditorBuilder;
	insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => EditorBuilder;
	update: (columns: Record<string, unknown>) => EditorBuilder;
	delete: () => EditorBuilder;
	eq: (column: string, value: unknown) => EditorBuilder;
	neq: (column: string, value: unknown) => EditorBuilder;
	in: (column: string, values: unknown[]) => EditorBuilder;
	lt: (column: string, value: unknown) => EditorBuilder;
	gt: (column: string, value: unknown) => EditorBuilder;
	order: (column: string, options: { ascending: boolean }) => EditorBuilder;
	limit: (count: number) => EditorBuilder;
	maybeSingle: () => EditorSingleRowBuilder;
	single: () => EditorSingleRowBuilder;
	overrideTypes: () => Promise<EditorAnswer>;
	/** What makes a chain that is awaited without `overrideTypes` on the end work. */
	then: (resolve: (answer: EditorAnswer) => void) => void;
};

/** A stand-in Supabase client that writes down every query and can be written to. */
function createEditorStandIn(answers: EditorAnswers = {}): {
	supabase: SupabaseClient;
	queries: EditorQuery[];
} {
	const queries: EditorQuery[] = [];
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

	function builderFor(table: string): EditorBuilder {
		const query: EditorQuery = {
			table,
			columns: '',
			inserted: null,
			updated: null,
			isDelete: false,
			eq: [],
			neq: [],
			in: [],
			lt: [],
			gt: [],
			order: [],
			limit: []
		};
		queries.push(query);

		const message = answers.errors?.[table];
		const rows = nextRows(table);
		const error = message ? { message, code: answers.errorCodes?.[table] } : null;
		const listAnswer: EditorAnswer = { data: message ? null : rows, error };
		const singleRowAnswer: EditorSingleRowAnswer = {
			data: message ? null : (rows[0] ?? null),
			error
		};
		const singleRowBuilder: EditorSingleRowBuilder = {
			overrideTypes: async () => singleRowAnswer,
			then: (resolve) => resolve(singleRowAnswer)
		};

		const builder: EditorBuilder = {
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
			neq: (column, value) => {
				query.neq.push([column, value]);
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
			maybeSingle: () => singleRowBuilder,
			single: () => singleRowBuilder,
			overrideTypes: async () => listAnswer,
			then: (resolve) => resolve(listAnswer)
		};

		return builder;
	}

	const supabase = { from: builderFor };

	return { supabase: supabase as unknown as SupabaseClient, queries };
}

/** The relations the editor asked for, in the order it asked for them. */
function editorTablesRead(queries: EditorQuery[]): string[] {
	return queries.map((query) => query.table);
}

/** The first query the editor sent to one relation, so a test can read its conditions back. */
function editorQueryOn(queries: EditorQuery[], table: string): EditorQuery {
	const query = queries.find((sent) => sent.table === table);

	if (!query) {
		throw new Error(`Nothing was ever sent to "${table}"`);
	}

	return query;
}

/** One `committees` row with every column the organiser's pages read. */
function managedCommitteeRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'committee-1',
		slug: 'unsc',
		name: 'United Nations Security Council',
		abbreviation: 'UNSC',
		description: null,
		topics: ['Sanctions'],
		level: 'advanced',
		room: null,
		position: 0,
		default_speaking_time_seconds: 90,
		...changes
	};
}

/** One `seats` row with every column the organiser's pages read. */
function managedSeatRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'seat-1',
		committee_id: 'committee-1',
		name: 'France',
		kind: 'country',
		country_code: 'FR',
		position: 0,
		is_available: true,
		user_id: null,
		delegation_id: null,
		...changes
	};
}

/** One `documents` row, with the columns the committees list counts by. */
function documentRow(changes: Record<string, unknown> = {}) {
	return {
		committee_id: 'committee-1',
		kind: 'background_guide',
		seat_id: null,
		...changes
	};
}

/** What the committee form hands over. Every field is text, as a form always is. */
function committeeFormValues(changes: Partial<CommitteeFormValues> = {}): CommitteeFormValues {
	return {
		name: 'World Health Organization',
		abbreviation: 'WHO',
		slug: 'who',
		description: '',
		level: 'beginner',
		room: '',
		defaultSpeakingTimeSeconds: '120',
		topics: ['Pandemic preparedness'],
		...changes
	};
}

describe('listCommitteesForManage', () => {
	it("asks for one conference's committees in the order the organiser put them in", async () => {
		const { supabase, queries } = createEditorStandIn({
			rows: { committees: [[managedCommitteeRow()]] }
		});

		const committees = await listCommitteesForManage(supabase, 'conference-1');

		expect(editorQueryOn(queries, 'committees').eq).toEqual([['conference_id', 'conference-1']]);
		// `id` is the tie-break, because two committees may share a position.
		expect(editorQueryOn(queries, 'committees').order).toEqual([
			['position', true],
			['id', true]
		]);
		// The database's `default_speaking_time_seconds` reaches the page under the
		// name the page uses.
		expect(committees[0].defaultSpeakingTimeSeconds).toBe(90);
	});

	it("counts every committee's seats at once, out of the table and not the public view", async () => {
		const { supabase, queries } = createEditorStandIn({
			rows: {
				committees: [
					[managedCommitteeRow(), managedCommitteeRow({ id: 'committee-2', slug: 'who' })]
				],
				seats: [
					[
						managedSeatRow({ id: 'seat-1' }),
						managedSeatRow({ id: 'seat-2', name: 'China', user_id: 'user-1' }),
						managedSeatRow({ id: 'seat-3', name: 'Chad', is_available: false })
					]
				]
			}
		});

		const committees = await listCommitteesForManage(supabase, 'conference-1');

		// One request for every committee's seats, not one request each.
		expect(editorQueryOn(queries, 'seats').in).toEqual([
			['committee_id', ['committee-1', 'committee-2']]
		]);
		// `public_seats` drops the seats the organiser has switched off, and this
		// is the one page that has to show them.
		expect(editorTablesRead(queries)).not.toContain('public_seats');
		expect(committees[0].seatCounts.total).toBe(3);
		// Nobody's name was looked up, and the seat somebody holds still counts as
		// filled: `user_id` says a seat is taken, and a delegate with no profile row
		// must not read as an empty seat the organiser may delete.
		expect(committees[0].seatCounts.filled).toBe(1);
		expect(editorTablesRead(queries)).not.toContain('profiles');
		expect(editorTablesRead(queries)).not.toContain('delegations');
		// A committee nobody has made seats for yet is empty rather than missing.
		expect(committees[1].seatCounts.total).toBe(0);
	});

	it('names the chairs of every committee, asking about them all at once', async () => {
		const { supabase, queries } = createEditorStandIn({
			rows: {
				committees: [
					[managedCommitteeRow(), managedCommitteeRow({ id: 'committee-2', slug: 'who' })]
				],
				committee_chairs: [
					[
						{ committee_id: 'committee-1', user_id: 'user-9' },
						{ committee_id: 'committee-2', user_id: 'user-8' }
					]
				],
				profiles: [
					[
						{ id: 'user-9', full_name: 'Ana Bauer', avatar_path: null },
						{ id: 'user-8', full_name: 'Bo Chen', avatar_path: null }
					]
				]
			}
		});

		const committees = await listCommitteesForManage(supabase, 'conference-1');

		expect(committees[0].chairNames).toEqual(['Ana Bauer']);
		expect(committees[1].chairNames).toEqual(['Bo Chen']);
		// One question about the chairs of the whole page, not one per committee.
		const chairQueries = queries.filter((query) => query.table === 'committee_chairs');

		expect(chairQueries).toHaveLength(1);
		expect(chairQueries[0].in).toEqual([['committee_id', ['committee-1', 'committee-2']]]);
		// Five queries however many committees there are: the committees, their
		// seats, their chairs, the chairs' names and the conference's documents.
		expect(queries).toHaveLength(5);
	});

	it("ticks the guide and counts each committee's papers, asking about them all at once", async () => {
		const { supabase, queries } = createEditorStandIn({
			rows: {
				committees: [
					[managedCommitteeRow(), managedCommitteeRow({ id: 'committee-2', slug: 'who' })]
				],
				documents: [
					[
						documentRow({ kind: 'background_guide' }),
						documentRow({ kind: 'position_paper', seat_id: 'seat-1' }),
						documentRow({ kind: 'position_paper', seat_id: 'seat-2' })
					]
				]
			}
		});

		const committees = await listCommitteesForManage(supabase, 'conference-1');

		expect(committees[0].hasBackgroundGuide).toBe(true);
		expect(committees[0].positionPaperCount).toBe(2);
		// One question about the files of the whole conference, not one per
		// committee, which is what `countCommitteeDocuments` is for.
		const documentQueries = queries.filter((query) => query.table === 'documents');

		expect(documentQueries).toHaveLength(1);
	});

	it('reads a committee with no files of its own as having no guide and no papers', async () => {
		const { supabase } = createEditorStandIn({
			rows: {
				committees: [
					[managedCommitteeRow(), managedCommitteeRow({ id: 'committee-2', slug: 'who' })]
				],
				documents: [[documentRow({ kind: 'background_guide' })]]
			}
		});

		const committees = await listCommitteesForManage(supabase, 'conference-1');

		// Nothing has been uploaded for `committee-2`, so it is missing from the
		// map altogether rather than carrying zeroes of its own.
		expect(committees[1].hasBackgroundGuide).toBe(false);
		expect(committees[1].positionPaperCount).toBe(0);
	});

	it('asks nothing about seats or chairs when the conference has no committees yet', async () => {
		const { supabase, queries } = createEditorStandIn();

		expect(await listCommitteesForManage(supabase, 'conference-1')).toEqual([]);
		expect(editorTablesRead(queries)).toEqual(['committees']);
	});
});

describe('getCommitteeForManage', () => {
	it('answers with nothing when this conference has no committee with that id', async () => {
		const { supabase, queries } = createEditorStandIn();

		expect(await getCommitteeForManage(supabase, 'conference-1', 'committee-9')).toBeNull();
		// The conference is part of the question, so a committee id from somebody
		// else's conference is a 404 rather than a page.
		expect(editorQueryOn(queries, 'committees').eq).toEqual([
			['conference_id', 'conference-1'],
			['id', 'committee-9']
		]);
		// It stops there rather than going on to read the seats of a committee that
		// is not there.
		expect(editorTablesRead(queries)).toEqual(['committees']);
	});

	it('treats an id that is not a uuid as not found', async () => {
		const { supabase } = createEditorStandIn({
			errors: { committees: 'invalid input syntax for type uuid' },
			errorCodes: { committees: '22P02' }
		});

		expect(await getCommitteeForManage(supabase, 'conference-1', 'nonsense')).toBeNull();
	});

	it('brings back the committee with its seats, the delegate and the delegation named', async () => {
		const { supabase } = createEditorStandIn({
			rows: {
				committees: [[managedCommitteeRow()]],
				seats: [
					[
						managedSeatRow({ user_id: 'user-1', delegation_id: 'delegation-1' }),
						managedSeatRow({ id: 'seat-2', name: 'China', position: 1, is_available: false })
					]
				],
				profiles: [[{ id: 'user-1', full_name: 'Daniel Park', avatar_path: null }]],
				participant_delegations: [[{ id: 'delegation-1', name: "St Mary's College" }]]
			}
		});

		const editor = await getCommitteeForManage(supabase, 'conference-1', 'committee-1');

		expect(editor?.committee.defaultSpeakingTimeSeconds).toBe(90);
		// The editor is the page that shows the names, so this is where they are
		// looked up. `isFilled` comes off the seat row and not off the name.
		expect(editor?.seats[0].isFilled).toBe(true);
		expect(editor?.seats[0].holderName).toBe('Daniel Park');
		expect(editor?.seats[0].delegationName).toBe("St Mary's College");
		// A seat the organiser has switched off is still on this page, which is the
		// whole reason the table is read here and the view is not.
		expect(editor?.seats[1].isAvailable).toBe(false);
	});
});

describe('listCommitteeSlugs', () => {
	it('answers with every link already in use in the conference', async () => {
		const { supabase, queries } = createEditorStandIn({
			rows: { committees: [[{ slug: 'unsc' }, { slug: 'who' }]] }
		});

		expect(await listCommitteeSlugs(supabase, 'conference-1')).toEqual(['unsc', 'who']);
		expect(editorQueryOn(queries, 'committees').neq).toEqual([]);
	});

	it('leaves the committee being edited out of the list', async () => {
		const { supabase, queries } = createEditorStandIn({
			rows: { committees: [[{ slug: 'who' }]] }
		});

		await listCommitteeSlugs(supabase, 'conference-1', 'committee-1');

		// Saving a committee without changing its slug must not read as "already used".
		expect(editorQueryOn(queries, 'committees').neq).toEqual([['id', 'committee-1']]);
	});
});

describe('createCommittee', () => {
	it('writes what the form filled in and answers with the new id', async () => {
		const { supabase, queries } = createEditorStandIn({
			rows: { committees: [[{ id: 'committee-7' }]] }
		});

		const committeeId = await createCommittee(supabase, 'conference-1', committeeFormValues(), 3);

		expect(committeeId).toBe('committee-7');
		expect(editorQueryOn(queries, 'committees').inserted).toEqual([
			{
				conference_id: 'conference-1',
				slug: 'who',
				name: 'World Health Organization',
				abbreviation: 'WHO',
				// An optional field that was left empty is saved as "no value".
				description: null,
				topics: ['Pandemic preparedness'],
				level: 'beginner',
				room: null,
				position: 3,
				// The form hands every field over as text; the column is a number.
				default_speaking_time_seconds: 120
			}
		]);
	});

	it('raises when the insert is refused', async () => {
		const { supabase } = createEditorStandIn({
			errors: { committees: 'new row violates row-level security policy' }
		});

		await expect(
			createCommittee(supabase, 'conference-1', committeeFormValues(), 0)
		).rejects.toThrow('row-level security');
	});
});

describe('updateCommittee', () => {
	it('never sends the conference or the position', async () => {
		const { supabase, queries } = createEditorStandIn();

		await updateCommittee(supabase, 'committee-1', committeeFormValues({ room: 'Room 1' }));

		const changed = editorQueryOn(queries, 'committees').updated ?? {};

		// Migration 0009's trigger refuses a change to `conference_id`, and
		// `moveCommittee` owns `position`, so neither is ever sent from here.
		expect(Object.keys(changed)).not.toContain('conference_id');
		expect(Object.keys(changed)).not.toContain('position');
		expect(changed.name).toBe('World Health Organization');
		expect(changed.room).toBe('Room 1');
		expect(changed.description).toBeNull();
		expect(editorQueryOn(queries, 'committees').eq).toEqual([['id', 'committee-1']]);
	});
});

describe('updateCommitteeAgenda', () => {
	it('sends the description and the topics and nothing else', async () => {
		const { supabase, queries } = createEditorStandIn();

		await updateCommitteeAgenda(supabase, 'committee-1', {
			description: '',
			topics: ['Cyber warfare']
		});

		const changed = editorQueryOn(queries, 'committees').updated ?? {};

		expect(changed).toEqual({ description: null, topics: ['Cyber warfare'] });
		expect(editorQueryOn(queries, 'committees').eq).toEqual([['id', 'committee-1']]);
	});
});

describe('planned seats', () => {
	it('writes the planned seats only when the caller says how many', async () => {
		const { supabase, queries } = createEditorStandIn({
			rows: { committees: [[{ id: 'committee-7' }]] }
		});

		await createCommittee(supabase, 'conference-1', committeeFormValues(), 0, 30);

		expect(editorQueryOn(queries, 'committees').inserted?.[0].planned_seat_count).toBe(30);
	});

	it('saves "Not decided" as no value, and leaves the column alone when it is not given', async () => {
		const decided = createEditorStandIn();
		await updateCommittee(decided.supabase, 'committee-1', committeeFormValues(), null);
		expect(editorQueryOn(decided.queries, 'committees').updated).toHaveProperty(
			'planned_seat_count',
			null
		);

		const untouched = createEditorStandIn();
		await updateCommittee(untouched.supabase, 'committee-1', committeeFormValues());
		expect(editorQueryOn(untouched.queries, 'committees').updated).not.toHaveProperty(
			'planned_seat_count'
		);
	});
});

describe('deleteCommittee', () => {
	it('answers yes when the committee was really deleted', async () => {
		const { supabase, queries } = createEditorStandIn({
			rows: { committees: [[{ id: 'committee-1' }]] }
		});

		expect(await deleteCommittee(supabase, 'committee-1')).toBe(true);
		expect(editorQueryOn(queries, 'committees').isDelete).toBe(true);
		expect(editorQueryOn(queries, 'committees').eq).toEqual([['id', 'committee-1']]);
	});

	it('answers no when Row Level Security refused, which is not an error', async () => {
		const { supabase } = createEditorStandIn({ rows: { committees: [[]] } });

		// The policy hides a committee with a seated delegate, so nothing matches,
		// nothing is deleted and no message comes back. Asking which ids were
		// deleted is what tells that apart from a delete that worked.
		expect(await deleteCommittee(supabase, 'committee-1')).toBe(false);
	});
});

describe('moveCommittee', () => {
	it('swaps places with the committee above', async () => {
		const { supabase, queries } = createEditorStandIn({
			rows: {
				committees: [[{ id: 'committee-2', position: 1 }], [{ id: 'committee-1', position: 0 }]]
			}
		});

		await moveCommittee(supabase, 'conference-1', 'committee-2', 'up');

		// Up the list is towards the lower positions, so the neighbour is the
		// highest position below this one.
		expect(queries[1].lt).toEqual([['position', 1]]);
		expect(queries[1].order).toEqual([
			['position', false],
			['id', false]
		]);
		expect(queries[1].limit).toEqual([1]);
		// The two trade positions, and no other committee is touched.
		expect(queries[2].updated).toEqual({ position: 0 });
		expect(queries[2].eq).toEqual([['id', 'committee-2']]);
		expect(queries[3].updated).toEqual({ position: 1 });
		expect(queries[3].eq).toEqual([['id', 'committee-1']]);
	});

	it('does nothing at all when there is no neighbour to swap with', async () => {
		const { supabase, queries } = createEditorStandIn({
			rows: { committees: [[{ id: 'committee-1', position: 0 }], []] }
		});

		await moveCommittee(supabase, 'conference-1', 'committee-1', 'up');

		// The committee at the top of the list has nothing above it, and the arrow
		// there does nothing rather than failing.
		const changes = queries.filter((query) => query.updated !== null);

		expect(changes).toEqual([]);
	});
});
