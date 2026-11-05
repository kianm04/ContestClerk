import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createCommitteeSessionEvents,
	createScheduleEvent,
	deleteScheduleEvent,
	duplicateScheduleEvent,
	getScheduleEvent,
	listPublicProgramme,
	listScheduleCommittees,
	listScheduleEvents,
	readMyMembership,
	readMyMemberships,
	readSchedulePublicity,
	updateScheduleEvent,
	updateSchedulePublicity,
	type CommitteeSessionsInput
} from './schedule';
import type { ScheduleEventInput } from '$lib/schedule-form';
import type { ScheduleCommittee } from '$lib/schedule';

// These tests are about the decisions this module makes: which columns each
// query asks for, which conference or event it scopes a query to, and how a
// row that comes back is turned into the shapes the pages hold. Nothing here
// talks to a database; the stand-in client below writes down what it was asked
// for and answers with fixed rows, the same way `fees.test.ts` does. Whether
// the database really lets each kind of reader see those rows is Row Level
// Security's decision, and that belongs in `tests/db/schedule.test.ts`.

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
	/** `[column, values]` for every `.in(...)`, which looks for several ids at once. */
	in: [string, unknown[]][];
	/** `[column, value]` for every `.gte(...)` and `.lte(...)`, the ends of a date range. */
	gte: [string, unknown][];
	lte: [string, unknown][];
	/** `[column, ascending]` for every `.order(...)`. */
	order: [string, boolean][];
};

/** One call this module made to `supabase.rpc(...)`. */
type RecordedRpcCall = { name: string; params: Record<string, unknown> };

/** What the stand-in should answer with. Everything here has a harmless default. */
type StandInAnswers = {
	/**
	 * The rows each relation answers with, as a list of answers rather than as
	 * one: a function that queries the same table twice, such as
	 * `createCommitteeSessionEvents` reading the programme before it inserts
	 * into it, gets a different answer for each. Every query takes the next
	 * answer along, and the last one is repeated once the list runs out, so a
	 * relation that always answers the same thing is a list of one.
	 */
	rows?: Record<string, unknown[][]>;
	/**
	 * The message each query to a relation fails with, as a list for the same
	 * reason, where `null` is a query that works.
	 */
	errors?: Record<string, (string | null)[]>;
	/** What `supabase.rpc(name, ...)` answers with, keyed by the function's name. */
	rpc?: Record<string, { data: unknown; error: QueryError | null }>;
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

/** What a chain ending in `maybeSingle` or `single` answers with: one row rather than a list. */
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
	insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => QueryBuilder;
	update: (columns: Record<string, unknown>) => QueryBuilder;
	delete: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	gte: (column: string, value: unknown) => QueryBuilder;
	lte: (column: string, value: unknown) => QueryBuilder;
	order: (column: string, options: { ascending: boolean }) => QueryBuilder;
	maybeSingle: () => SingleRowBuilder;
	single: () => SingleRowBuilder;
	overrideTypes: () => Promise<ListAnswer>;
	/** What makes a chain that is awaited without `overrideTypes` on the end work. */
	then: (resolve: (answer: ListAnswer) => void) => void;
};

/**
 * A stand-in Supabase client that writes down every query and every `rpc` call.
 *
 * The real client is a builder: `.from(...)` gives back an object with
 * `.select(...)` on it, `.select(...)` one with `.eq(...)` on it, and so on.
 * Each step adds one condition to a query that is only sent once the chain is
 * awaited. This copies that shape: every step records its arguments and hands
 * the same builder back, and the awaited answer is whatever `answers` asked for
 * for that relation. A chain ending in `maybeSingle` or `single` is answered
 * with the first of those rows, the way the real ones answer with the first
 * (and, for `single`, only) match.
 */
function createStandInSupabase(answers: StandInAnswers = {}): {
	supabase: SupabaseClient;
	queries: RecordedQuery[];
	rpcCalls: RecordedRpcCall[];
} {
	const queries: RecordedQuery[] = [];
	const rpcCalls: RecordedRpcCall[] = [];
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
			in: [],
			gte: [],
			lte: [],
			order: []
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
			gte: (column, value) => {
				query.gte.push([column, value]);
				return builder;
			},
			lte: (column, value) => {
				query.lte.push([column, value]);
				return builder;
			},
			order: (column, options) => {
				query.order.push([column, options.ascending]);
				return builder;
			},
			maybeSingle: () => ({ overrideTypes: async () => singleRowAnswer }),
			single: () => ({ overrideTypes: async () => singleRowAnswer }),
			// In the real client `overrideTypes` changes the type of the answer and
			// not the answer itself, so here it is simply where the chain ends.
			overrideTypes: async () => listAnswer,
			then: (resolve) => resolve(listAnswer)
		};

		return builder;
	}

	function rpc(name: string, params: Record<string, unknown>) {
		rpcCalls.push({ name, params });

		return Promise.resolve(answers.rpc?.[name] ?? { data: null, error: null });
	}

	const supabase = { from: builderFor, rpc };

	return { supabase: supabase as unknown as SupabaseClient, queries, rpcCalls };
}

/** The queries the module sent to one relation, so a test can read their conditions back. */
function queriesOn(queries: RecordedQuery[], table: string): RecordedQuery[] {
	return queries.filter((query) => query.table === table);
}

/** The first query the module sent to one relation. */
function queryOn(queries: RecordedQuery[], table: string): RecordedQuery {
	const query = queriesOn(queries, table)[0];

	if (!query) {
		throw new Error(`Nothing was ever sent to "${table}"`);
	}

	return query;
}

/** One `schedule_events` row with every column `EVENT_COLUMNS` reads. */
function eventRow(changes: Record<string, unknown> = {}) {
	return {
		id: 'event-1',
		conference_id: 'conference-1',
		committee_id: null,
		title: 'Opening ceremony',
		description: null,
		location: 'Main hall',
		starts_at: '2026-02-12T08:00:00Z',
		ends_at: '2026-02-12T09:00:00Z',
		audience: 'everyone',
		committees: null,
		...changes
	};
}

/** What the schedule editor's forms hand over once they have been checked. */
function eventInput(changes: Partial<ScheduleEventInput> = {}): ScheduleEventInput {
	return {
		title: 'Opening ceremony',
		description: null,
		location: 'Main hall',
		startsAt: '2026-02-12T08:00:00Z',
		endsAt: '2026-02-12T09:00:00Z',
		audience: 'everyone',
		committeeId: null,
		...changes
	};
}

describe('listScheduleEvents', () => {
	it("reads one conference's events, earliest first, with each committee's abbreviation", async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				schedule_events: [
					[
						eventRow({
							id: 'event-1',
							audience: 'committee',
							committee_id: 'unsc',
							committees: { abbreviation: 'UNSC' }
						})
					]
				]
			}
		});

		const events = await listScheduleEvents(supabase, 'conference-1');

		expect(queryOn(queries, 'schedule_events').columns).toContain('committees(abbreviation)');
		expect(queryOn(queries, 'schedule_events').eq).toEqual([['conference_id', 'conference-1']]);
		expect(queryOn(queries, 'schedule_events').order).toEqual([['starts_at', true]]);
		expect(events).toEqual([
			{
				id: 'event-1',
				conferenceId: 'conference-1',
				title: 'Opening ceremony',
				description: null,
				location: 'Main hall',
				startsAt: '2026-02-12T08:00:00Z',
				endsAt: '2026-02-12T09:00:00Z',
				audience: 'committee',
				committeeId: 'unsc',
				committeeAbbreviation: 'UNSC'
			}
		]);
	});

	it('answers with an empty list when the conference has no events yet', async () => {
		const { supabase } = createStandInSupabase();

		expect(await listScheduleEvents(supabase, 'conference-1')).toEqual([]);
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { schedule_events: ['permission denied for table schedule_events'] }
		});

		await expect(listScheduleEvents(supabase, 'conference-1')).rejects.toThrow(
			'Could not read the programme'
		);
	});
});

describe('listPublicProgramme', () => {
	it('answers with an empty list, and never asks for events, while the programme is private', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { conferences: [[{ show_schedule_publicly: false }]] }
		});

		const events = await listPublicProgramme(supabase, 'conference-1');

		expect(events).toEqual([]);
		expect(queriesOn(queries, 'schedule_events')).toHaveLength(0);
	});

	it('reads only the everyone events once the organiser has ticked "Show programme publicly"', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				conferences: [[{ show_schedule_publicly: true }]],
				schedule_events: [[eventRow(), eventRow({ id: 'event-2', audience: 'staff' })]]
			}
		});

		const events = await listPublicProgramme(supabase, 'conference-1');

		expect(queryOn(queries, 'schedule_events').eq).toEqual([
			['conference_id', 'conference-1'],
			['audience', 'everyone']
		]);
		// The stand-in answers every query to a relation with the same rows unless
		// told otherwise, so this checks the filter this module itself sends rather
		// than what a real database would do with it.
		expect(events).toHaveLength(2);
	});

	it('raises when the events query fails', async () => {
		const { supabase } = createStandInSupabase({
			rows: { conferences: [[{ show_schedule_publicly: true }]] },
			errors: { schedule_events: ['no such column'] }
		});

		await expect(listPublicProgramme(supabase, 'conference-1')).rejects.toThrow(
			'Could not read the public programme'
		);
	});
});

describe('getScheduleEvent', () => {
	it('asks for the event inside this conference, so an id from another cannot be reached', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { schedule_events: [[eventRow()]] }
		});

		const event = await getScheduleEvent(supabase, 'conference-1', 'event-1');

		expect(queryOn(queries, 'schedule_events').eq).toEqual([
			['conference_id', 'conference-1'],
			['id', 'event-1']
		]);
		expect(event?.title).toBe('Opening ceremony');
	});

	it('answers with null when this conference has no event with that id', async () => {
		const { supabase } = createStandInSupabase();

		expect(await getScheduleEvent(supabase, 'conference-1', 'event-9')).toBeNull();
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { schedule_events: ['no such column'] }
		});

		await expect(getScheduleEvent(supabase, 'conference-1', 'event-1')).rejects.toThrow(
			'Could not read that event'
		);
	});
});

describe('createScheduleEvent', () => {
	it('inserts the conference id and the checked columns, and answers with the new id', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { schedule_events: [[{ id: 'event-9' }]] }
		});

		const id = await createScheduleEvent(supabase, 'conference-1', eventInput());

		expect(queryOn(queries, 'schedule_events').inserted).toEqual([
			{
				conference_id: 'conference-1',
				title: 'Opening ceremony',
				description: null,
				location: 'Main hall',
				starts_at: '2026-02-12T08:00:00Z',
				ends_at: '2026-02-12T09:00:00Z',
				audience: 'everyone',
				committee_id: null
			}
		]);
		expect(id).toBe('event-9');
	});

	it('raises when the insert is refused', async () => {
		const { supabase } = createStandInSupabase({
			errors: { schedule_events: ['new row violates row-level security policy'] }
		});

		await expect(createScheduleEvent(supabase, 'conference-1', eventInput())).rejects.toThrow(
			'row-level security'
		);
	});
});

describe('updateScheduleEvent', () => {
	it('sends only the checked columns, scoped to this event, and never the conference id', async () => {
		const { supabase, queries } = createStandInSupabase();

		await updateScheduleEvent(
			supabase,
			'event-1',
			eventInput({ audience: 'committee', committeeId: 'unsc' })
		);

		expect(queryOn(queries, 'schedule_events').updated).toEqual({
			title: 'Opening ceremony',
			description: null,
			location: 'Main hall',
			starts_at: '2026-02-12T08:00:00Z',
			ends_at: '2026-02-12T09:00:00Z',
			audience: 'committee',
			committee_id: 'unsc'
		});
		expect(queryOn(queries, 'schedule_events').eq).toEqual([['id', 'event-1']]);
	});

	it('raises when the update is refused', async () => {
		const { supabase } = createStandInSupabase({
			errors: { schedule_events: ['new row violates row-level security policy'] }
		});

		await expect(updateScheduleEvent(supabase, 'event-1', eventInput())).rejects.toThrow(
			'row-level security'
		);
	});
});

describe('duplicateScheduleEvent', () => {
	it("keeps the event's wall-clock time across a change to summer time, and answers with the new start", async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { schedule_events: [[{ id: 'event-2' }]] }
		});

		const event = {
			id: 'event-1',
			conferenceId: 'conference-1',
			title: 'Opening ceremony',
			description: null,
			location: 'Main hall',
			// Clocks in Zurich go forward on 29 March 2026, so 09:00 local time moves
			// from 08:00 to 07:00 UTC, the same example `schedule.test.ts` checks
			// `shiftByDays` itself with.
			startsAt: '2026-03-28T08:00:00Z',
			endsAt: '2026-03-28T09:00:00Z',
			audience: 'everyone' as const,
			committeeId: null,
			committeeAbbreviation: null
		};

		const newStartsAt = await duplicateScheduleEvent(supabase, event, 'Europe/Zurich', 1);

		expect(newStartsAt).toBe('2026-03-29T07:00:00.000Z');
		expect(queryOn(queries, 'schedule_events').inserted).toEqual([
			{
				conference_id: 'conference-1',
				title: 'Opening ceremony',
				description: null,
				location: 'Main hall',
				starts_at: '2026-03-29T07:00:00.000Z',
				ends_at: '2026-03-29T08:00:00.000Z',
				audience: 'everyone',
				committee_id: null
			}
		]);
	});
});

describe('deleteScheduleEvent', () => {
	it('scopes the delete to the event inside this conference', async () => {
		const { supabase, queries } = createStandInSupabase();

		await deleteScheduleEvent(supabase, 'conference-1', 'event-1');

		expect(queryOn(queries, 'schedule_events').isDelete).toBe(true);
		expect(queryOn(queries, 'schedule_events').eq).toEqual([
			['conference_id', 'conference-1'],
			['id', 'event-1']
		]);
	});

	it('raises when the delete fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { schedule_events: ['connection closed'] }
		});

		await expect(deleteScheduleEvent(supabase, 'conference-1', 'event-1')).rejects.toThrow(
			'Could not delete the event'
		);
	});
});

describe('createCommitteeSessionEvents', () => {
	it('inserts one numbered, roomed event per ticked committee and answers with the count', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: {
				// The programme is read first, and already has one session for UNSC,
				// so its next session is numbered 2 while DISEC's, which has none, starts at 1.
				schedule_events: [
					[
						eventRow({
							id: 'existing',
							audience: 'committee',
							committee_id: 'unsc',
							committees: { abbreviation: 'UNSC' }
						})
					]
				]
			}
		});

		const committees: ScheduleCommittee[] = [
			{ id: 'unsc', name: 'Security Council', abbreviation: 'UNSC', room: 'Room 204' },
			{ id: 'disec', name: 'Disarmament', abbreviation: 'DISEC', room: null }
		];
		const input: CommitteeSessionsInput = {
			titlePattern: 'Session {n}',
			locationPattern: '{room}',
			startsAt: '2026-02-12T08:00:00Z',
			endsAt: '2026-02-12T09:00:00Z',
			committees
		};

		const count = await createCommitteeSessionEvents(supabase, 'conference-1', input);

		expect(count).toBe(2);
		// The `schedule_events` table is read once (the existing programme) and then
		// written to once (the insert), and the insert is the second query sent.
		const insertedRows = queriesOn(queries, 'schedule_events')[1].inserted;
		expect(insertedRows).toEqual([
			{
				conference_id: 'conference-1',
				committee_id: 'unsc',
				audience: 'committee',
				title: 'Session 2',
				location: 'Room 204',
				starts_at: '2026-02-12T08:00:00Z',
				ends_at: '2026-02-12T09:00:00Z'
			},
			{
				conference_id: 'conference-1',
				committee_id: 'disec',
				audience: 'committee',
				title: 'Session 1',
				// DISEC has no room yet, so its location falls back to "TBA".
				location: 'TBA',
				starts_at: '2026-02-12T08:00:00Z',
				ends_at: '2026-02-12T09:00:00Z'
			}
		]);
	});

	it('raises when the insert is refused', async () => {
		const { supabase } = createStandInSupabase({
			errors: { schedule_events: [null, 'new row violates row-level security policy'] }
		});
		const input: CommitteeSessionsInput = {
			titlePattern: 'Session {n}',
			locationPattern: '{room}',
			startsAt: '2026-02-12T08:00:00Z',
			endsAt: '2026-02-12T09:00:00Z',
			committees: [{ id: 'unsc', name: 'Security Council', abbreviation: 'UNSC', room: null }]
		};

		await expect(createCommitteeSessionEvents(supabase, 'conference-1', input)).rejects.toThrow(
			'row-level security'
		);
	});
});

describe('listScheduleCommittees', () => {
	it('reads the committees of one conference in their own order', async () => {
		const committee = {
			id: 'committee-1',
			name: 'Security Council',
			abbreviation: 'UNSC',
			room: 'Committee Room 1'
		};
		const { supabase, queries } = createStandInSupabase({
			rows: { committees: [[committee]] }
		});

		expect(await listScheduleCommittees(supabase, 'conference-1')).toEqual([committee]);
		expect(queryOn(queries, 'committees').columns).toBe('id, name, abbreviation, room');
		expect(queryOn(queries, 'committees').eq).toEqual([['conference_id', 'conference-1']]);
		expect(queryOn(queries, 'committees').order).toEqual([['position', true]]);
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { committees: ['permission denied for table committees'] }
		});

		await expect(listScheduleCommittees(supabase, 'conference-1')).rejects.toThrow(
			'permission denied'
		);
	});
});

describe('readSchedulePublicity', () => {
	it('reads the one column this page owns', async () => {
		const { supabase, queries } = createStandInSupabase({
			rows: { conferences: [[{ show_schedule_publicly: true }]] }
		});

		expect(await readSchedulePublicity(supabase, 'conference-1')).toBe(true);
		expect(queryOn(queries, 'conferences').columns).toBe('show_schedule_publicly');
		expect(queryOn(queries, 'conferences').eq).toEqual([['id', 'conference-1']]);
	});

	it('reads a missing conference as not public rather than raising', async () => {
		const { supabase } = createStandInSupabase();

		expect(await readSchedulePublicity(supabase, 'conference-1')).toBe(false);
	});

	it('raises when the query fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { conferences: ['permission denied for table conferences'] }
		});

		await expect(readSchedulePublicity(supabase, 'conference-1')).rejects.toThrow(
			'permission denied'
		);
	});
});

describe('updateSchedulePublicity', () => {
	it('asks set_schedule_publicity, which writes only that one column', async () => {
		const { supabase, queries, rpcCalls } = createStandInSupabase({
			rpc: { set_schedule_publicity: { data: null, error: null } }
		});

		await updateSchedulePublicity(supabase, 'conference-1', true);

		expect(rpcCalls).toEqual([
			{
				name: 'set_schedule_publicity',
				params: { conference_id: 'conference-1', is_public: true }
			}
		]);
		expect(queries).toEqual([]);
	});

	it('raises when the update is refused', async () => {
		const { supabase } = createStandInSupabase({
			rpc: {
				set_schedule_publicity: {
					data: null,
					error: { message: 'Only the people who edit the whole programme can choose' }
				}
			}
		});

		await expect(updateSchedulePublicity(supabase, 'conference-1', true)).rejects.toThrow(
			'whole programme'
		);
	});
});

describe('readMyMemberships', () => {
	it('combines seats, delegations, staff rows and chairs into one membership per conference', async () => {
		const { supabase } = createStandInSupabase({
			rows: {
				seats: [[{ committee_id: 'unsc', committees: { conference_id: 'geneva' } }]],
				delegation_members: [[{ delegations: { conference_id: 'delft' } }]],
				conference_staff: [[{ conference_id: 'oslo' }, { conference_id: 'rome' }]],
				// A staff row no longer says what somebody may do; their roles do, and
				// only a conference-wide role that is everything makes an organiser.
				conference_role_members: [
					[
						{
							conference_id: 'rome',
							conference_roles: { permissions: ['administrator'], scope: 'conference' }
						}
					]
				],
				committee_chairs: [[{ committee_id: 'disec', committees: { conference_id: 'oslo' } }]]
			}
		});

		const memberships = await readMyMemberships(supabase, 'user-1');

		expect(memberships.get('geneva')).toEqual({
			isOrganiser: false,
			isParticipant: true,
			isStaff: false,
			committeeIds: ['unsc']
		});
		expect(memberships.get('delft')).toEqual({
			isOrganiser: false,
			isParticipant: true,
			isStaff: false,
			committeeIds: []
		});
		expect(memberships.get('oslo')).toEqual({
			isOrganiser: false,
			isParticipant: false,
			isStaff: true,
			committeeIds: ['disec']
		});
		expect(memberships.get('rome')).toEqual({
			isOrganiser: true,
			isParticipant: false,
			isStaff: true,
			committeeIds: []
		});
	});

	it('leaves out a seat or a chair whose committee could not be read', async () => {
		const { supabase } = createStandInSupabase({
			rows: { seats: [[{ committee_id: 'unsc', committees: null }]] }
		});

		const memberships = await readMyMemberships(supabase, 'user-1');

		expect(memberships.size).toBe(0);
	});

	it('raises when one of the five queries fails', async () => {
		const { supabase } = createStandInSupabase({
			errors: { seats: ['permission denied for table seats'] }
		});

		await expect(readMyMemberships(supabase, 'user-1')).rejects.toThrow('permission denied');
	});
});

describe('readMyMembership', () => {
	it('marks somebody with no rows of their own as an organiser and as staff when the rpc says so', async () => {
		const { supabase, rpcCalls } = createStandInSupabase({
			rpc: { has_permission: { data: true, error: null } }
		});

		const membership = await readMyMembership(supabase, 'conference-1', 'user-1');

		expect(membership).toEqual({
			isOrganiser: true,
			isParticipant: false,
			isStaff: true,
			committeeIds: []
		});
		expect(rpcCalls).toEqual([
			{
				name: 'has_permission',
				params: { conference_id: 'conference-1', permission: 'administrator' }
			}
		]);
	});

	it('reads the plain membership rows when the rpc says no', async () => {
		const { supabase } = createStandInSupabase({
			rows: { seats: [[{ committee_id: 'unsc', committees: { conference_id: 'conference-1' } }]] },
			rpc: { has_permission: { data: false, error: null } }
		});

		const membership = await readMyMembership(supabase, 'conference-1', 'user-1');

		expect(membership).toEqual({
			isOrganiser: false,
			isParticipant: true,
			isStaff: false,
			committeeIds: ['unsc']
		});
	});

	it('raises when asking whether this person runs the conference fails', async () => {
		const { supabase } = createStandInSupabase({
			rpc: { has_permission: { data: null, error: { message: 'function does not exist' } } }
		});

		await expect(readMyMembership(supabase, 'conference-1', 'user-1')).rejects.toThrow(
			'function does not exist'
		);
	});
});
