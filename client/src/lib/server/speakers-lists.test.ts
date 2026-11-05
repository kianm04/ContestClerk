import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeStateView, RoomSpeaker, SpeakersListSummary } from '$lib/chair-room';
import {
	moveToNextSpeaker,
	yieldToChair,
	yieldToSeat,
	type SpeakersListInRoom
} from './speakers-lists';

// "Next speaker" is one call to the SQL function `call_next_speaker`, which
// moves the floor on in one transaction; what it writes is tested against the
// real database in `tests/db/room-press-functions.test.ts`, and here only what
// this module asks it and makes of its answer. The yields still write two
// things: the speech that just ended, in `speakers_list_entries`, and where
// `committee_state` points next, through the real `updateCommitteeState` in
// `./committee-room`. These tests answer both
// tables the way `committee-room.test.ts` and `committee-sessions.test.ts`
// answer them, rather than standing those modules in for. Nothing here talks
// to a database; the stand-in client below writes down what it was asked for
// and answers with fixed rows, the way `seats.test.ts` and `access.test.ts` do
// for their own modules. Row Level Security is tested in `tests/db/`.

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { message: string } | null };

/** One call of a database function, by name, with what it was handed. */
type RecordedCall = { name: string; args: Record<string, unknown> };

/** What one query this module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	eq: [string, unknown][];
	/** The row `.insert(...)` was given, or `null` when the query added none. */
	inserted: Record<string, unknown> | null;
	/** The columns `.update(...)` was given, or `null` when the query changed nothing. */
	updated: Record<string, unknown> | null;
};

/** The end of a chain, however it was reached: `.single()` or neither. */
type QueryEndpoint = {
	then: (resolve: (answer: Answer) => void) => void;
};

/** One step of a query. Every step hands the builder back, so the next step can be called on it. */
type QueryBuilder = QueryEndpoint & {
	select: (columns: string) => QueryBuilder;
	insert: (row: Record<string, unknown>) => QueryBuilder;
	update: (columns: Record<string, unknown>) => QueryBuilder;
	eq: (column: string, value: unknown) => QueryBuilder;
	single: () => QueryEndpoint;
};

/**
 * A stand-in Supabase client that writes down what each query asked for and
 * answers from `answers`, keyed by table name.
 *
 * A table's answer may be one `Answer` reused for every query sent to it, or a
 * list for a table this module asks more than once in a row with a different
 * answer expected each time: `yieldToSeat` first updates
 * `speakers_list_entries` to finish the old speech and then inserts a new row
 * into it, and the two calls need different answers.
 */
function createStandIn(answers: Partial<Record<string, Answer | Answer[]>>): {
	supabase: SupabaseClient;
	calls: RecordedQuery[];
	functionCalls: RecordedCall[];
} {
	const calls: RecordedQuery[] = [];
	const functionCalls: RecordedCall[] = [];
	const timesAsked = new Map<string, number>();

	function nextAnswer(table: string): Answer {
		const configured = answers[table];
		if (configured === undefined) return { data: null, error: null };

		const list = Array.isArray(configured) ? configured : [configured];
		const count = timesAsked.get(table) ?? 0;
		timesAsked.set(table, count + 1);

		return list[Math.min(count, list.length - 1)];
	}

	function builderFor(table: string): QueryBuilder {
		const record: RecordedQuery = { table, eq: [], inserted: null, updated: null };
		calls.push(record);

		const answer = nextAnswer(table);
		const endpoint: QueryEndpoint = { then: (resolve) => resolve(answer) };

		const builder: QueryBuilder = {
			...endpoint,
			select: () => builder,
			insert: (row) => {
				record.inserted = row;
				return builder;
			},
			update: (columns) => {
				record.updated = columns;
				return builder;
			},
			eq: (column, value) => {
				record.eq.push([column, value]);
				return builder;
			},
			single: () => endpoint
		};

		return builder;
	}

	/** A database function's answer is configured under its name, as `rpc:<name>`. */
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

/** A `committee_state` row the mock's update answers with once it "succeeded". */
const STATE_UPDATED_OK: Answer = { data: [{ committee_id: 'committee-1' }], error: null };

/** The active speakers list every test starts from: sixty seconds each. */
const SPEAKERS_LIST: SpeakersListSummary = {
	id: 'list-1',
	name: "General Speakers' List",
	speakingTimeSeconds: 60,
	isOpen: true
};

/** One seat, with only what a `RoomSpeaker` needs of it. */
function seat(id: string, name: string) {
	return { id, name, countryCode: null };
}

/** One entry of the list, waiting or speaking, in a named seat. */
function speaker(
	id: string,
	position: number,
	status: RoomSpeaker['status'],
	seatId: string
): RoomSpeaker {
	return { id, position, status, seat: seat(seatId, seatId) };
}

/** The committee's state, with the floor at `entry-1` and twenty seconds left on the timer. */
function committeeState(overrides: Partial<CommitteeStateView> = {}): CommitteeStateView {
	return {
		currentSessionId: 'session-1',
		mode: 'formal_debate',
		currentMotionId: null,
		activeSpeakersListId: 'list-1',
		currentSpeakerEntryId: 'entry-1',
		currentVoteId: null,
		agendaTopic: null,
		timer: { totalSeconds: 60, endsAt: '2026-01-01T10:00:20.000Z', pausedRemainingSeconds: null },
		...overrides
	};
}

const NOW = new Date('2026-01-01T10:00:00.000Z');

describe('moveToNextSpeaker', () => {
	/** The list the room page loaded, which the database function no longer needs. */
	const LIST: SpeakersListInRoom = {
		speakersList: SPEAKERS_LIST,
		speakers: [
			speaker('entry-1', 0, 'speaking', 'seat-fr'),
			speaker('entry-2', 1, 'waiting', 'seat-de')
		]
	};

	it('asks call_next_speaker to move the floor on from the speech the chair’s screen showed, at the moment pressed', async () => {
		const { supabase, calls, functionCalls } = createStandIn({
			'rpc:call_next_speaker': { data: 'moved', error: null }
		});

		const outcome = await moveToNextSpeaker(supabase, 'committee-1', committeeState(), LIST, NOW);

		expect(outcome).toBe('moved');
		expect(functionCalls).toEqual([
			{
				name: 'call_next_speaker',
				args: {
					committee_id: 'committee-1',
					speaking_entry_id: 'entry-1',
					pressed_at: NOW.toISOString()
				}
			}
		]);
		// The function writes everything in one transaction, so no table is written here.
		expect(calls).toEqual([]);
	});

	it('names no speech when nobody had the floor, and passes "empty" on', async () => {
		const { supabase, functionCalls } = createStandIn({
			'rpc:call_next_speaker': { data: 'empty', error: null }
		});
		const nobodySpeaking = committeeState({ currentSpeakerEntryId: null });

		const outcome = await moveToNextSpeaker(supabase, 'committee-1', nobodySpeaking, LIST, NOW);

		expect(outcome).toBe('empty');
		expect(functionCalls[0].args.speaking_entry_id).toBeNull();
	});

	it('passes "unchanged" on when another press had already moved the floor', async () => {
		const { supabase } = createStandIn({
			'rpc:call_next_speaker': { data: 'unchanged', error: null }
		});

		const outcome = await moveToNextSpeaker(supabase, 'committee-1', committeeState(), LIST, NOW);

		expect(outcome).toBe('unchanged');
	});

	it('throws with the database’s words when the function refuses', async () => {
		const { supabase } = createStandIn({
			'rpc:call_next_speaker': {
				data: null,
				error: { message: 'There is no speakers list open.' }
			}
		});

		await expect(
			moveToNextSpeaker(supabase, 'committee-1', committeeState(), LIST, NOW)
		).rejects.toThrow(/There is no speakers list open\./);
	});
});

describe('yieldToChair', () => {
	it('finishes the speech as spoken and clears the floor and the timer, giving nobody the floor next', async () => {
		const list: SpeakersListInRoom = {
			speakersList: SPEAKERS_LIST,
			speakers: [speaker('entry-1', 0, 'speaking', 'seat-fr')]
		};
		const { supabase, calls } = createStandIn({
			speakers_list_entries: { data: null, error: null },
			committee_state: STATE_UPDATED_OK
		});

		await yieldToChair(supabase, 'committee-1', committeeState(), list, NOW);

		const entryQuery = queriesOn(calls, 'speakers_list_entries')[0];
		expect(entryQuery.updated).toEqual({
			status: 'spoken',
			finished_at: NOW.toISOString(),
			spoke_seconds: 40
		});
		expect(entryQuery.eq).toEqual([['id', 'entry-1']]);

		expect(queriesOn(calls, 'committee_state')[0].updated).toEqual({
			current_speaker_entry_id: null,
			timer_total_seconds: null,
			timer_ends_at: null,
			timer_paused_remaining_seconds: null
		});
	});
});

describe('yieldToSeat', () => {
	it('gives the seat a new entry at the top of the list, already speaking, with the remaining seconds running against the list’s speaking time', async () => {
		const list: SpeakersListInRoom = {
			speakersList: SPEAKERS_LIST,
			speakers: [speaker('entry-1', 0, 'speaking', 'seat-fr')]
		};
		const { supabase, calls } = createStandIn({
			speakers_list_entries: [
				// The old speech finishing.
				{ data: null, error: null },
				// The new entry being inserted.
				{ data: { id: 'entry-9' }, error: null }
			],
			committee_state: STATE_UPDATED_OK
		});

		await yieldToSeat(supabase, 'committee-1', committeeState(), list, 'seat-de', NOW);

		const entryQueries = queriesOn(calls, 'speakers_list_entries');
		expect(entryQueries[0].updated).toEqual({
			status: 'spoken',
			finished_at: NOW.toISOString(),
			spoke_seconds: 40
		});
		expect(entryQueries[1].inserted).toEqual({
			speakers_list_id: 'list-1',
			seat_id: 'seat-de',
			position: 0,
			status: 'speaking',
			started_at: NOW.toISOString()
		});

		// Twenty seconds were left on the clock, so the new speaker's timer runs
		// for twenty more, but is still measured against the list's sixty.
		expect(queriesOn(calls, 'committee_state')[0].updated).toEqual({
			current_speaker_entry_id: 'entry-9',
			timer_total_seconds: 60,
			timer_ends_at: new Date(NOW.getTime() + 20 * 1000).toISOString(),
			timer_paused_remaining_seconds: null
		});
	});
});
