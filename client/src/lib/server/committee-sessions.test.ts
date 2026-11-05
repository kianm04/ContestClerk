import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChairCommittee } from '$lib/chair-room';
import { endSession, readSessionRecord, startSession } from './committee-sessions';

// `startSession` is one call to the SQL function `start_committee_session`,
// which opens the session, its General Speakers' List and the room in one
// transaction; what it writes is tested against the real database in
// `tests/db/room-press-functions.test.ts`, and here only what this module asks
// it. `endSession` still writes the tables itself, through the real
// `updateCommitteeState` and `finishSpeechInProgress` in `./committee-room` and
// `cancelOpenVotes` in `./votes`, so these tests answer those tables the way
// `committee-room.test.ts` does, rather than standing the modules in for.
// Nothing here talks to a database; the stand-in client below writes down what
// it was asked for and answers with fixed rows, the way `seats.test.ts` and
// `access.test.ts` do for their own modules. Row Level Security is tested in
// `tests/db/`.

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { message: string } | null };

/** One call of a database function, by name, with what it was handed. */
type RecordedCall = { name: string; args: Record<string, unknown> };

/** What one query this module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	eq: [string, unknown][];
	/** The rows `.insert(...)` was given, or `null` when the query added none. */
	inserted: Record<string, unknown> | Record<string, unknown>[] | null;
	/** The columns `.update(...)` was given, or `null` when the query changed nothing. */
	updated: Record<string, unknown> | null;
	/** Whether the query was a `.delete()`. */
	isDelete: boolean;
};

/** The end of a chain, however it was reached: `.maybeSingle()`, `.single()` or neither. */
type QueryEndpoint = {
	overrideTypes: () => Promise<Answer>;
	then: (resolve: (answer: Answer) => void) => void;
};

/** One step of a query. Every step hands the builder back, so the next step can be called on it. */
type QueryBuilder = QueryEndpoint & {
	select: (columns: string) => QueryBuilder;
	insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => QueryBuilder;
	update: (columns: Record<string, unknown>) => QueryBuilder;
	delete: () => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	maybeSingle: () => QueryEndpoint;
	single: () => QueryEndpoint;
};

/**
 * A stand-in Supabase client that writes down what each query asked for and
 * answers from `answers`, keyed by table name, or by `rpc:<name>` for a
 * database function.
 *
 * A table's answer may be one `Answer` reused for every query sent to it, or a
 * list for a table this module asks more than once with a different answer
 * expected each time: `endSession` reads `committee_state` and then writes it.
 */
function createStandIn(answers: Partial<Record<string, Answer | Answer[]>>): {
	supabase: SupabaseClient;
	calls: RecordedQuery[];
	functionCalls: RecordedCall[];
} {
	const calls: RecordedQuery[] = [];
	const functionCalls: RecordedCall[] = [];
	const timesAsked = new Map<string, number>();

	function nextAnswer(key: string): Answer {
		const configured = answers[key];
		if (configured === undefined) return { data: null, error: null };

		const list = Array.isArray(configured) ? configured : [configured];
		const count = timesAsked.get(key) ?? 0;
		timesAsked.set(key, count + 1);

		return list[Math.min(count, list.length - 1)];
	}

	function builderFor(table: string): QueryBuilder {
		const record: RecordedQuery = {
			table,
			eq: [],
			inserted: null,
			updated: null,
			isDelete: false
		};
		calls.push(record);

		const answer = nextAnswer(table);
		const endpoint: QueryEndpoint = {
			overrideTypes: async () => answer,
			then: (resolve) => resolve(answer)
		};

		const builder: QueryBuilder = {
			...endpoint,
			select: () => builder,
			insert: (rows) => {
				record.inserted = rows;
				return builder;
			},
			update: (columns) => {
				record.updated = columns;
				return builder;
			},
			delete: () => {
				record.isDelete = true;
				return builder;
			},
			eq: (column, value) => {
				record.eq.push([column, value]);
				return builder;
			},
			maybeSingle: () => endpoint,
			single: () => endpoint
		};

		return builder;
	}

	async function rpc(name: string, args: Record<string, unknown>): Promise<Answer> {
		functionCalls.push({ name, args });
		return nextAnswer(`rpc:${name}`);
	}

	const supabase = { from: builderFor, rpc } as unknown as SupabaseClient;

	return { supabase, calls, functionCalls };
}

/** Every query sent to one relation, in the order they were sent. */
function queriesOn(calls: RecordedQuery[], table: string): RecordedQuery[] {
	return calls.filter((call) => call.table === table);
}

/** The first query sent to one relation, so a test can read its conditions back. */
function queryOn(calls: RecordedQuery[], table: string): RecordedQuery {
	const query = calls.find((call) => call.table === table);

	if (!query) throw new Error(`Nothing was ever sent to "${table}"`);

	return query;
}

/** A `committee_state` row the mock's update answers with once it "succeeded". */
const STATE_UPDATED_OK: Answer = { data: [{ committee_id: 'committee-1' }], error: null };

/** The room's state row as `readCommitteeState` reads it, with `overrides` on top. */
function stateRow(overrides: Record<string, unknown> = {}): Answer {
	return {
		data: {
			current_session_id: 'session-1',
			mode: 'formal_debate',
			current_motion_id: null,
			active_speakers_list_id: 'list-1',
			current_speaker_entry_id: null,
			current_vote_id: null,
			agenda_topic: null,
			timer_total_seconds: null,
			timer_ends_at: null,
			timer_paused_remaining_seconds: null,
			...overrides
		},
		error: null
	};
}

/** The committee `startSession` opens a session for. */
const COMMITTEE: ChairCommittee = {
	id: 'committee-1',
	slug: 'unsc',
	name: 'Security Council',
	abbreviation: 'UNSC',
	room: 'Room 1',
	defaultSpeakingTimeSeconds: 90,
	topics: ['Climate finance']
};

describe('startSession', () => {
	it('asks start_committee_session for the session, with its name and the moment pressed', async () => {
		const now = new Date('2026-01-01T09:00:00.000Z');
		const { supabase, calls, functionCalls } = createStandIn({
			'rpc:start_committee_session': { data: 'session-2', error: null }
		});

		await startSession(supabase, COMMITTEE, 'Session 2', now);

		expect(functionCalls).toEqual([
			{
				name: 'start_committee_session',
				args: { committee_id: 'committee-1', name: 'Session 2', pressed_at: now.toISOString() }
			}
		]);
		// The session, its list and the room are the function's to write, in one transaction.
		expect(calls).toEqual([]);
	});

	it('throws with the database’s words when the function refuses', async () => {
		const { supabase } = createStandIn({
			'rpc:start_committee_session': {
				data: null,
				error: { message: 'End the current session before starting a new one.' }
			}
		});

		await expect(startSession(supabase, COMMITTEE, 'Session 2', new Date())).rejects.toThrow(
			/Could not start the session: End the current session before starting a new one\./
		);
	});
});

describe('endSession', () => {
	it('marks the session ended, with when it ended', async () => {
		const now = new Date('2026-01-01T12:00:00.000Z');
		const { supabase, calls } = createStandIn({
			committee_sessions: { data: [{ id: 'session-1' }], error: null },
			committee_state: [stateRow(), STATE_UPDATED_OK]
		});

		await endSession(supabase, 'committee-1', 'session-1', now);

		const sessionQuery = queryOn(calls, 'committee_sessions');
		expect(sessionQuery.updated).toEqual({ status: 'ended', ended_at: now.toISOString() });
		// Both the session and the committee it belongs to are in the condition, so
		// a session id from another committee's room is not found either.
		expect(sessionQuery.eq).toEqual([
			['id', 'session-1'],
			['committee_id', 'committee-1']
		]);
	});

	it('throws when Row Level Security changed nothing rather than pretending the session ended', async () => {
		const { supabase } = createStandIn({ committee_sessions: { data: [], error: null } });

		await expect(endSession(supabase, 'committee-1', 'session-1', new Date())).rejects.toThrow(
			'The session was not ended.'
		);
	});

	it('throws when the database refuses the write', async () => {
		const { supabase } = createStandIn({
			committee_sessions: { data: null, error: { message: 'connection lost' } }
		});

		await expect(endSession(supabase, 'committee-1', 'session-1', new Date())).rejects.toThrow(
			/Could not end the session: connection lost/
		);
	});

	it('ends the speech in progress, with how long it lasted', async () => {
		const now = new Date('2026-01-01T12:00:00.000Z');
		const { supabase, calls } = createStandIn({
			committee_sessions: { data: [{ id: 'session-1' }], error: null },
			// Twenty seconds were left of the speaker's sixty when the session ended.
			committee_state: [
				stateRow({
					current_speaker_entry_id: 'entry-1',
					timer_total_seconds: 60,
					timer_ends_at: '2026-01-01T12:00:20.000Z'
				}),
				STATE_UPDATED_OK
			],
			speakers_list_entries: [
				{ data: { status: 'speaking', list: { speaking_time_seconds: 60 } }, error: null },
				{ data: null, error: null }
			]
		});

		await endSession(supabase, 'committee-1', 'session-1', now);

		const [, finishing] = queriesOn(calls, 'speakers_list_entries');
		expect(finishing.updated).toEqual({
			status: 'spoken',
			finished_at: now.toISOString(),
			spoke_seconds: 40
		});
		expect(finishing.eq).toEqual([
			['id', 'entry-1'],
			['status', 'speaking']
		]);
	});

	it('cancels a vote still open in the session, deleting it as "Cancel vote" does', async () => {
		const { supabase, calls } = createStandIn({
			committee_sessions: { data: [{ id: 'session-1' }], error: null },
			committee_state: [stateRow({ mode: 'voting', current_vote_id: 'vote-1' }), STATE_UPDATED_OK],
			votes: { data: null, error: null }
		});

		await endSession(supabase, 'committee-1', 'session-1', new Date());

		const voteQuery = queryOn(calls, 'votes');
		expect(voteQuery.isDelete).toBe(true);
		expect(voteQuery.eq).toEqual([
			['session_id', 'session-1'],
			['status', 'open']
		]);
	});

	it('writes the room back to idle, with every pointer, both clocks and any suspension cleared, once the session has ended', async () => {
		const { supabase, calls } = createStandIn({
			committee_sessions: { data: [{ id: 'session-1' }], error: null },
			committee_state: [stateRow(), STATE_UPDATED_OK]
		});

		await endSession(supabase, 'committee-1', 'session-1', new Date());

		// `agenda_topic` is not written: ending a session leaves the agenda alone (T127).
		expect(queriesOn(calls, 'committee_state')[1].updated).toEqual({
			mode: 'idle',
			current_session_id: null,
			current_motion_id: null,
			active_speakers_list_id: null,
			current_speaker_entry_id: null,
			current_vote_id: null,
			timer_total_seconds: null,
			timer_ends_at: null,
			timer_paused_remaining_seconds: null,
			caucus_total_seconds: null,
			caucus_ends_at: null,
			caucus_paused_remaining_seconds: null,
			suspended_at: null,
			suspended_until: null,
			mode_before_suspension: null
		});
	});
});

describe('readSessionRecord', () => {
	it('counts the speeches, the motions decided and passed, and each closed vote', async () => {
		const { supabase, calls } = createStandIn({
			speakers_list_entries: { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], error: null },
			motions: {
				data: [
					{ status: 'passed' },
					{ status: 'failed' },
					{ status: 'passed' },
					{ status: 'withdrawn' },
					{ status: 'dropped' },
					{ status: 'proposed' }
				],
				error: null
			},
			votes: {
				data: [
					{ subject: 'Draft Resolution 1.1', status: 'closed', passed: true },
					{ subject: 'Amendment 2', status: 'open', passed: null }
				],
				error: null
			}
		});

		const record = await readSessionRecord(supabase, 'session-1');

		expect(record).toEqual({
			sessionId: 'session-1',
			speechCount: 3,
			decidedMotionCount: 3,
			passedMotionCount: 2,
			votes: [{ subject: 'Draft Resolution 1.1', passed: true }]
		});
		// Only the session's spoken entries count, found through their list's session.
		expect(queryOn(calls, 'speakers_list_entries').eq).toEqual([
			['list.session_id', 'session-1'],
			['status', 'spoken']
		]);
		expect(queryOn(calls, 'motions').eq).toEqual([['session_id', 'session-1']]);
		expect(queryOn(calls, 'votes').eq).toEqual([['session_id', 'session-1']]);
	});

	it('records a closed vote with no result on record as failed', async () => {
		const { supabase } = createStandIn({
			speakers_list_entries: { data: [], error: null },
			motions: { data: [], error: null },
			votes: { data: [{ subject: null, status: 'closed', passed: null }], error: null }
		});

		const record = await readSessionRecord(supabase, 'session-1');

		expect(record.votes).toEqual([{ subject: null, passed: false }]);
		expect(record.speechCount).toBe(0);
		expect(record.decidedMotionCount).toBe(0);
	});

	it('throws when any of the three cannot be read', async () => {
		const { supabase } = createStandIn({
			speakers_list_entries: { data: [], error: null },
			motions: { data: null, error: { message: 'boom' } },
			votes: { data: [], error: null }
		});

		await expect(readSessionRecord(supabase, 'session-1')).rejects.toThrow(
			/Could not read the session's record: boom/
		);
	});
});
