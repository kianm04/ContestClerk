import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeStateView } from '$lib/chair-room';
import type { TimerSetting } from '$lib/committee-room';
import {
	addCommitteeTopic,
	entrySeat,
	finishSpeechInProgress,
	getActiveSpeakersList,
	getChairCommittee,
	getChairRoomFrame,
	getCommitteeRoom,
	getConsoleFacts,
	isNamedChair,
	readCommitteeState,
	readSuspensionReason,
	resumeRoom,
	roomRefusal,
	setAgendaTopic,
	setRoomMode,
	setSuspensionReturn,
	suspendRoom,
	timerColumns,
	updateCommitteeState
} from './committee-room';

// This module only fetches and writes `committee_state` and the rows around
// it, so these tests are about which query it sends for each rule and what it
// makes of the answer. Nothing here talks to a database; the stand-in client
// below writes down what it was asked for and answers with fixed rows. Row
// Level Security is tested in `tests/db/`, the way `seats.test.ts` and
// `access.test.ts` already do for their own modules.

/** An answer to one query, in the shape the real client gives one. */
type Answer = { data: unknown; error: { message: string } | null };

/** What one query this module sent was asking for. */
type RecordedQuery = {
	/** The relation `.from(...)` named. */
	table: string;
	/** The columns `.select(...)` was given. */
	columns: string;
	eq: [string, unknown][];
	/** `[column, value]` for every `.is(...)`, which `readGeneralSpeakersListId` uses. */
	is: [string, unknown][];
	in: [string, unknown[]][];
	order: [string, boolean][];
	limit: number[];
	/** The rows `.insert(...)` was given, or `null` when the query added none. */
	inserted: Record<string, unknown> | Record<string, unknown>[] | null;
	/** The columns `.update(...)` was given, or `null` when the query changed nothing. */
	updated: Record<string, unknown> | null;
	/** Whether the query was a `.delete()`. */
	isDelete: boolean;
};

/** One call of a database function, by name, with what it was handed. */
type RecordedCall = { name: string; args: Record<string, unknown> };

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
	is: (column: string, value: unknown) => QueryBuilder;
	in: (column: string, values: unknown[]) => QueryBuilder;
	order: (column: string, options: { ascending: boolean }) => QueryBuilder;
	limit: (count: number) => QueryBuilder;
	maybeSingle: () => QueryEndpoint;
	single: () => QueryEndpoint;
};

/**
 * A stand-in Supabase client that writes down what each query asked for and
 * answers from `answers`, keyed by table name.
 *
 * A table's answer may be one `Answer` reused for every query sent to it, or a
 * list for a table this module asks more than once with a different answer
 * expected each time, in the order the queries are sent. A database function's
 * answer is configured under `rpc:<name>`.
 */
function createStandIn(answers: Partial<Record<string, Answer | Answer[]>>): {
	supabase: SupabaseClient;
	calls: RecordedQuery[];
	functionCalls: RecordedCall[];
} {
	const calls: RecordedQuery[] = [];
	const functionCalls: RecordedCall[] = [];
	// How many times each table has already been asked, so the next answer
	// along the list can be found for it.
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
		const record: RecordedQuery = {
			table,
			columns: '',
			eq: [],
			is: [],
			in: [],
			order: [],
			limit: [],
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
			select: (columns) => {
				record.columns = columns;
				return builder;
			},
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
			is: (column, value) => {
				record.is.push([column, value]);
				return builder;
			},
			in: (column, values) => {
				record.in.push([column, values]);
				return builder;
			},
			order: (column, options) => {
				record.order.push([column, options.ascending]);
				return builder;
			},
			limit: (count) => {
				record.limit.push(count);
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

/** The query sent to one relation, so a test can read its conditions back. */
function queryOn(calls: RecordedQuery[], table: string): RecordedQuery {
	const query = calls.find((call) => call.table === table);

	if (!query) throw new Error(`Nothing was ever sent to "${table}"`);

	return query;
}

/** A `committee_state` row the mock's update answers with once it "succeeded". */
const STATE_UPDATED_OK: Answer = { data: [{ committee_id: 'committee-1' }], error: null };

describe('timerColumns', () => {
	it('names the three timer columns from a TimerSetting', () => {
		const setting: TimerSetting = {
			totalSeconds: 60,
			endsAt: '2026-01-01T10:01:00.000Z',
			pausedRemainingSeconds: null
		};

		expect(timerColumns(setting)).toEqual({
			timer_total_seconds: 60,
			timer_ends_at: '2026-01-01T10:01:00.000Z',
			timer_paused_remaining_seconds: null
		});
	});
});

describe('updateCommitteeState', () => {
	it('sends the changes to the committee’s row', async () => {
		const { supabase, calls } = createStandIn({ committee_state: STATE_UPDATED_OK });

		await updateCommitteeState(supabase, 'committee-1', { mode: 'idle' });

		const query = queryOn(calls, 'committee_state');
		expect(query.updated).toEqual({ mode: 'idle' });
		expect(query.eq).toEqual([['committee_id', 'committee-1']]);
	});

	it('throws when the database refuses the write', async () => {
		const { supabase } = createStandIn({
			committee_state: { data: null, error: { message: 'connection lost' } }
		});

		await expect(updateCommitteeState(supabase, 'committee-1', { mode: 'idle' })).rejects.toThrow(
			/Could not change the committee's state: connection lost/
		);
	});

	it('throws when Row Level Security changed nothing rather than pretending it worked', async () => {
		const { supabase } = createStandIn({ committee_state: { data: [], error: null } });

		await expect(updateCommitteeState(supabase, 'committee-1', { mode: 'idle' })).rejects.toThrow(
			'The committee state was not changed.'
		);
	});
});

describe('setAgendaTopic', () => {
	it('writes only the topic under debate, leaving the session, mode and timer alone', async () => {
		const { supabase, calls } = createStandIn({ committee_state: STATE_UPDATED_OK });

		await setAgendaTopic(supabase, 'committee-1', 'Climate finance');

		const query = queryOn(calls, 'committee_state');
		expect(query.updated).toEqual({ agenda_topic: 'Climate finance' });
		expect(query.eq).toEqual([['committee_id', 'committee-1']]);
	});

	it('throws when the database refuses a topic that is not one of the committee’s', async () => {
		const { supabase } = createStandIn({
			committee_state: {
				data: null,
				error: { message: "The agenda must be one of the committee's topics." }
			}
		});

		await expect(setAgendaTopic(supabase, 'committee-1', 'Sanctions')).rejects.toThrow(
			/Could not change the committee's state: The agenda must be one of the committee's topics./
		);
	});
});

describe('addCommitteeTopic', () => {
	it("adds the topic after the committee's own", async () => {
		const { supabase, calls } = createStandIn({ committees: { data: null, error: null } });

		await addCommitteeTopic(supabase, 'committee-1', ['Climate finance'], 'Sanctions');

		const query = queryOn(calls, 'committees');
		expect(query.updated).toEqual({ topics: ['Climate finance', 'Sanctions'] });
		expect(query.eq).toEqual([['id', 'committee-1']]);
	});

	it('writes nothing for a topic the committee already has', async () => {
		const { supabase, calls } = createStandIn({});

		await addCommitteeTopic(supabase, 'committee-1', ['Climate finance'], 'Climate finance');

		expect(calls).toEqual([]);
	});

	it('throws when the database refuses', async () => {
		const { supabase } = createStandIn({
			committees: { data: null, error: { message: 'permission denied' } }
		});

		await expect(addCommitteeTopic(supabase, 'committee-1', [], 'Sanctions')).rejects.toThrow(
			/Could not add the topic: permission denied/
		);
	});
});

/** A `committee_state` row as `setRoomMode`'s tests start from. */
function committeeState(overrides: Partial<CommitteeStateView> = {}): CommitteeStateView {
	return {
		currentSessionId: 'session-1',
		mode: 'moderated_caucus',
		currentMotionId: 'motion-1',
		activeSpeakersListId: 'list-caucus',
		currentSpeakerEntryId: 'entry-1',
		currentVoteId: null,
		agendaTopic: null,
		timer: { totalSeconds: 60, endsAt: '2026-01-01T10:01:00.000Z', pausedRemainingSeconds: null },
		...overrides
	};
}

/** The entry that has the floor, as `finishSpeechInProgress` reads it: speaking on a sixty-second list. */
const SPEAKING_ENTRY: Answer = {
	data: { status: 'speaking', list: { speaking_time_seconds: 60 } },
	error: null
};

describe('finishSpeechInProgress', () => {
	// The speaker's clock ends at 10:01:00, so pressed at 10:00:20 forty seconds are left.
	const PRESSED = new Date('2026-01-01T10:00:20.000Z');

	it('marks the speech spoken, with when it ended and how long it lasted', async () => {
		const { supabase, calls } = createStandIn({
			speakers_list_entries: [SPEAKING_ENTRY, { data: null, error: null }]
		});

		await finishSpeechInProgress(supabase, committeeState(), PRESSED);

		const [reading, finishing] = queriesOn(calls, 'speakers_list_entries');
		expect(reading.eq).toEqual([['id', 'entry-1']]);
		// Forty seconds were left of sixty, so twenty were spoken.
		expect(finishing.updated).toEqual({
			status: 'spoken',
			finished_at: PRESSED.toISOString(),
			spoke_seconds: 20
		});
		// Only a speech still in progress is finished, so a press racing another changes nothing twice.
		expect(finishing.eq).toEqual([
			['id', 'entry-1'],
			['status', 'speaking']
		]);
	});

	it('does nothing when nobody has the floor', async () => {
		const { supabase, calls } = createStandIn({});

		await finishSpeechInProgress(
			supabase,
			committeeState({ currentSpeakerEntryId: null }),
			PRESSED
		);

		expect(calls).toEqual([]);
	});

	it('leaves an entry alone that is no longer speaking', async () => {
		const { supabase, calls } = createStandIn({
			speakers_list_entries: {
				data: { status: 'spoken', list: { speaking_time_seconds: 60 } },
				error: null
			}
		});

		await finishSpeechInProgress(supabase, committeeState(), PRESSED);

		expect(queriesOn(calls, 'speakers_list_entries')).toHaveLength(1);
	});
});

describe('roomRefusal', () => {
	it('answers the sentence a room function refused with', () => {
		const refusal = { code: 'P0001', message: 'That motion is no longer on the floor.' };

		expect(roomRefusal(refusal)).toBe('That motion is no longer on the floor.');
	});

	it('is null without an error, and for any error that is not a refusal', () => {
		expect(roomRefusal(null)).toBeNull();
		expect(
			roomRefusal({ code: '42501', message: 'Only a chair of this committee can…' })
		).toBeNull();
		expect(roomRefusal({ message: 'connection lost' })).toBeNull();
	});
});

describe('entrySeat', () => {
	const france = { id: 'seat-fr', name: 'France', countryCode: 'FR', delegateName: 'Amélie' };
	const seatsById = new Map([[france.id, france]]);

	it('is the layout’s seat, with the delegate’s name, when the layout has it', () => {
		const embedded = { id: 'seat-fr', name: 'France', country_code: 'FR' };

		expect(entrySeat('entry-1', embedded, null, seatsById)).toBe(france);
	});

	it('falls back to what the entry embeds for a seat taken off offer since', () => {
		const embedded = { id: 'seat-br', name: 'Brazil', country_code: 'BR' };

		expect(entrySeat('entry-2', embedded, null, seatsById)).toEqual({
			id: 'seat-br',
			name: 'Brazil',
			countryCode: 'BR'
		});
	});

	it('stands a typed name in a seat of its own, whose id matches no real seat (S9)', () => {
		expect(entrySeat('entry-3', null, 'Secretary-General', seatsById)).toEqual({
			id: 'entry-3',
			name: 'Secretary-General',
			countryCode: null
		});
	});
});

describe('setRoomMode', () => {
	it('ends the speech and returns to the session’s General Speakers’ List, clearing the caucus and both clocks, when going back to formal debate with a motion running', async () => {
		const { supabase, calls } = createStandIn({
			speakers_list_entries: [SPEAKING_ENTRY, { data: null, error: null }],
			speakers_lists: { data: { id: 'list-gsl' }, error: null },
			committee_state: STATE_UPDATED_OK
		});

		await setRoomMode(supabase, 'committee-1', committeeState(), 'formal_debate');

		// The speech in progress ends with its time, as "End speech" records it.
		const finishing = queriesOn(calls, 'speakers_list_entries')[1];
		expect(finishing.updated).toMatchObject({ status: 'spoken' });

		// The General Speakers' List is the session's one list of kind `general` (S9).
		const listQuery = queryOn(calls, 'speakers_lists');
		expect(listQuery.eq).toEqual([
			['session_id', 'session-1'],
			['kind', 'general']
		]);
		expect(listQuery.is).toEqual([]);
		expect(listQuery.order).toEqual([['created_at', true]]);
		expect(listQuery.limit).toEqual([1]);

		const stateQuery = queryOn(calls, 'committee_state');
		expect(stateQuery.updated).toEqual({
			mode: 'formal_debate',
			current_motion_id: null,
			active_speakers_list_id: 'list-gsl',
			current_speaker_entry_id: null,
			timer_total_seconds: null,
			timer_ends_at: null,
			timer_paused_remaining_seconds: null,
			caucus_total_seconds: null,
			caucus_ends_at: null,
			caucus_paused_remaining_seconds: null
		});
	});

	it('returns from a single speaker to the General Speakers’ List the same way, though it has no motion', async () => {
		const { supabase, calls } = createStandIn({
			speakers_list_entries: [SPEAKING_ENTRY, { data: null, error: null }],
			speakers_lists: { data: { id: 'list-gsl' }, error: null },
			committee_state: STATE_UPDATED_OK
		});
		const singleSpeaker = committeeState({ mode: 'single_speaker', currentMotionId: null });

		await setRoomMode(supabase, 'committee-1', singleSpeaker, 'formal_debate');

		expect(queryOn(calls, 'committee_state').updated).toMatchObject({
			mode: 'formal_debate',
			active_speakers_list_id: 'list-gsl',
			current_speaker_entry_id: null
		});
	});

	it('only sets the mode when formal debate is chosen but there is no caucus to return from', async () => {
		const { supabase, calls } = createStandIn({ committee_state: STATE_UPDATED_OK });

		await setRoomMode(
			supabase,
			'committee-1',
			committeeState({ mode: 'voting', currentMotionId: null }),
			'formal_debate'
		);

		expect(calls.some((call) => call.table === 'speakers_lists')).toBe(false);
		expect(calls.some((call) => call.table === 'speakers_list_entries')).toBe(false);
		expect(queryOn(calls, 'committee_state').updated).toEqual({ mode: 'formal_debate' });
	});

	it('suspends in one update: the mode remembered, both running clocks paused, everything else kept', async () => {
		vi.useFakeTimers({ now: new Date('2026-01-01T10:00:20.000Z') });

		const { supabase, calls } = createStandIn({
			committee_state: [
				{
					data: {
						mode_before_suspension: null,
						caucus_ends_at: '2026-01-01T10:05:00.000Z',
						caucus_paused_remaining_seconds: null
					},
					error: null
				},
				STATE_UPDATED_OK
			]
		});

		await setRoomMode(supabase, 'committee-1', committeeState(), 'suspended');
		vi.useRealTimers();

		expect(calls.some((call) => call.table === 'speakers_list_entries')).toBe(false);
		// The speaker's clock had 40 seconds left and the caucus's 280: both are paused there.
		expect(queriesOn(calls, 'committee_state')[1].updated).toEqual({
			mode: 'suspended',
			mode_before_suspension: 'moderated_caucus',
			suspended_at: '2026-01-01T10:00:20.000Z',
			suspended_until: null,
			timer_total_seconds: 60,
			timer_ends_at: null,
			timer_paused_remaining_seconds: 40,
			caucus_ends_at: null,
			caucus_paused_remaining_seconds: 280
		});
	});

	it('leaves a room that is already suspended as it is', async () => {
		const { supabase, calls } = createStandIn({});

		await setRoomMode(supabase, 'committee-1', committeeState({ mode: 'suspended' }), 'suspended');

		expect(calls).toEqual([]);
	});

	it('resumes by putting back the mode that was suspended, with the suspension cleared and the clocks left paused', async () => {
		const { supabase, calls } = createStandIn({
			committee_state: [
				{
					data: {
						mode_before_suspension: 'moderated_caucus',
						caucus_ends_at: null,
						caucus_paused_remaining_seconds: 280
					},
					error: null
				},
				STATE_UPDATED_OK
			]
		});

		await setRoomMode(
			supabase,
			'committee-1',
			committeeState({ mode: 'suspended' }),
			'formal_debate'
		);

		expect(queriesOn(calls, 'committee_state')[1].updated).toEqual({
			mode: 'moderated_caucus',
			suspended_at: null,
			suspended_until: null,
			mode_before_suspension: null
		});
	});
});

describe('suspendRoom', () => {
	it('pauses both clocks at the moment pressed, not the moment the request arrived (T139)', async () => {
		const pressed = new Date('2026-01-01T10:00:30.000Z');
		const { supabase, calls } = createStandIn({
			committee_state: [
				{
					data: {
						mode_before_suspension: null,
						caucus_ends_at: '2026-01-01T10:05:00.000Z',
						caucus_paused_remaining_seconds: null
					},
					error: null
				},
				STATE_UPDATED_OK
			]
		});

		await suspendRoom(supabase, 'committee-1', committeeState(), pressed);

		// The speaker's clock had 30 seconds left at the press and the caucus's 270.
		expect(queriesOn(calls, 'committee_state')[1].updated).toEqual({
			mode: 'suspended',
			mode_before_suspension: 'moderated_caucus',
			suspended_at: '2026-01-01T10:00:30.000Z',
			suspended_until: null,
			timer_total_seconds: 60,
			timer_ends_at: null,
			timer_paused_remaining_seconds: 30,
			caucus_ends_at: null,
			caucus_paused_remaining_seconds: 270
		});
	});

	it('keeps a paused clock as it is, and writes no caucus clock outside a caucus', async () => {
		const pausedTimer = { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 12 };
		const { supabase, calls } = createStandIn({
			committee_state: [
				{
					data: {
						mode_before_suspension: null,
						caucus_ends_at: null,
						caucus_paused_remaining_seconds: null
					},
					error: null
				},
				STATE_UPDATED_OK
			]
		});
		const formalDebate = committeeState({ mode: 'formal_debate', timer: pausedTimer });

		await suspendRoom(supabase, 'committee-1', formalDebate, new Date('2026-01-01T10:00:00Z'));

		expect(queriesOn(calls, 'committee_state')[1].updated).toMatchObject({
			mode: 'suspended',
			mode_before_suspension: 'formal_debate',
			timer_paused_remaining_seconds: 12,
			caucus_paused_remaining_seconds: null
		});
	});
});

describe('resumeRoom', () => {
	it('puts back the mode that was suspended and clears the suspension, leaving the clocks', async () => {
		const { supabase, calls } = createStandIn({
			committee_state: [
				{
					data: {
						mode_before_suspension: 'single_speaker',
						caucus_ends_at: null,
						caucus_paused_remaining_seconds: null
					},
					error: null
				},
				STATE_UPDATED_OK
			]
		});

		await resumeRoom(supabase, 'committee-1');

		expect(queriesOn(calls, 'committee_state')[1].updated).toEqual({
			mode: 'single_speaker',
			suspended_at: null,
			suspended_until: null,
			mode_before_suspension: null
		});
	});

	it('resumes into formal debate when no mode was remembered', async () => {
		const { supabase, calls } = createStandIn({
			committee_state: [
				{
					data: {
						mode_before_suspension: null,
						caucus_ends_at: null,
						caucus_paused_remaining_seconds: null
					},
					error: null
				},
				STATE_UPDATED_OK
			]
		});

		await resumeRoom(supabase, 'committee-1');

		expect(queriesOn(calls, 'committee_state')[1].updated).toMatchObject({
			mode: 'formal_debate'
		});
	});
});

describe('setSuspensionReturn', () => {
	it('writes only when the room is due back', async () => {
		const { supabase, calls } = createStandIn({ committee_state: STATE_UPDATED_OK });

		await setSuspensionReturn(supabase, 'committee-1', '2026-01-01T13:30:00.000Z');

		const update = queryOn(calls, 'committee_state');
		expect(update.updated).toEqual({ suspended_until: '2026-01-01T13:30:00.000Z' });
		expect(update.eq).toEqual([['committee_id', 'committee-1']]);
	});
});

describe('readSuspensionReason', () => {
	const SUSPENDED_AT = '2026-01-01T12:00:00.000Z';

	it('reads the topic of the passed suspend motion decided the moment the room was suspended', async () => {
		const { supabase, calls } = createStandIn({
			motions: { data: { topic: 'for lunch' }, error: null }
		});

		const reason = await readSuspensionReason(supabase, 'session-1', SUSPENDED_AT);

		expect(reason).toBe('for lunch');
		expect(queryOn(calls, 'motions').eq).toEqual([
			['session_id', 'session-1'],
			['kind', 'suspend_meeting'],
			['status', 'passed'],
			['decided_at', SUSPENDED_AT]
		]);
	});

	it('has no reason for a suspension from the mode bar, or a motion that gave none', async () => {
		const none = createStandIn({ motions: { data: null, error: null } });
		const blank = createStandIn({ motions: { data: { topic: '  ' }, error: null } });

		expect(await readSuspensionReason(none.supabase, 'session-1', SUSPENDED_AT)).toBeNull();
		expect(await readSuspensionReason(blank.supabase, 'session-1', SUSPENDED_AT)).toBeNull();
	});

	it('throws when the motions cannot be read', async () => {
		const { supabase } = createStandIn({ motions: { data: null, error: { message: 'boom' } } });

		await expect(readSuspensionReason(supabase, 'session-1', SUSPENDED_AT)).rejects.toThrow(
			/Could not read why the room is suspended: boom/
		);
	});
});

describe('getChairCommittee', () => {
	it('returns null when there is no such committee', async () => {
		const { supabase } = createStandIn({ committees: { data: null, error: null } });

		const committee = await getChairCommittee(supabase, 'conference-1', 'no-such-committee');

		expect(committee).toBeNull();
	});

	it('maps a found committee, keyed by conference and slug', async () => {
		const { supabase, calls } = createStandIn({
			committees: {
				data: {
					id: 'committee-1',
					slug: 'unsc',
					name: 'Security Council',
					abbreviation: 'UNSC',
					room: 'Room 1',
					default_speaking_time_seconds: 60,
					topics: ['Climate finance']
				},
				error: null
			}
		});

		const committee = await getChairCommittee(supabase, 'conference-1', 'unsc');

		expect(committee).toEqual({
			id: 'committee-1',
			slug: 'unsc',
			name: 'Security Council',
			abbreviation: 'UNSC',
			room: 'Room 1',
			defaultSpeakingTimeSeconds: 60,
			topics: ['Climate finance']
		});
		expect(queryOn(calls, 'committees').eq).toEqual([
			['conference_id', 'conference-1'],
			['slug', 'unsc']
		]);
	});

	it('throws when the query fails', async () => {
		const { supabase } = createStandIn({
			committees: { data: null, error: { message: 'connection lost' } }
		});

		await expect(getChairCommittee(supabase, 'conference-1', 'unsc')).rejects.toThrow(
			/Could not read the committee: connection lost/
		);
	});
});

describe('readCommitteeState', () => {
	it('reads the committee’s one state row into the view the pages draw', async () => {
		const { supabase, calls } = createStandIn({
			committee_state: {
				data: {
					current_session_id: 'session-1',
					mode: 'single_speaker',
					current_motion_id: null,
					active_speakers_list_id: 'list-single',
					current_speaker_entry_id: 'entry-9',
					current_vote_id: null,
					agenda_topic: null,
					timer_total_seconds: 60,
					timer_ends_at: null,
					timer_paused_remaining_seconds: 60,
					caucus_total_seconds: null,
					caucus_ends_at: null,
					caucus_paused_remaining_seconds: null,
					suspended_at: null,
					suspended_until: null,
					mode_before_suspension: null
				},
				error: null
			}
		});

		const state = await readCommitteeState(supabase, 'committee-1');

		expect(queryOn(calls, 'committee_state').eq).toEqual([['committee_id', 'committee-1']]);
		expect(state).toEqual({
			currentSessionId: 'session-1',
			mode: 'single_speaker',
			currentMotionId: null,
			activeSpeakersListId: 'list-single',
			currentSpeakerEntryId: 'entry-9',
			currentVoteId: null,
			agendaTopic: null,
			timer: { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 60 },
			caucusClock: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null },
			suspendedAt: null,
			suspendedUntil: null,
			modeBeforeSuspension: null
		});
	});

	it('reads a moderated caucus’s own clock and a suspension (D4, D6)', async () => {
		const { supabase, calls } = createStandIn({
			committee_state: {
				data: {
					current_session_id: 'session-1',
					mode: 'suspended',
					current_motion_id: 'motion-1',
					active_speakers_list_id: 'list-mod',
					current_speaker_entry_id: 'entry-3',
					current_vote_id: null,
					agenda_topic: 'Water',
					timer_total_seconds: 60,
					timer_ends_at: null,
					timer_paused_remaining_seconds: 31,
					caucus_total_seconds: 600,
					caucus_ends_at: null,
					caucus_paused_remaining_seconds: 372,
					suspended_at: '2026-01-01T12:00:00.000Z',
					suspended_until: '2026-01-01T13:30:00.000Z',
					mode_before_suspension: 'moderated_caucus'
				},
				error: null
			}
		});

		const state = await readCommitteeState(supabase, 'committee-1');

		expect(queryOn(calls, 'committee_state').columns).toContain('caucus_total_seconds');
		expect(queryOn(calls, 'committee_state').columns).toContain('mode_before_suspension');
		expect(state.caucusClock).toEqual({
			totalSeconds: 600,
			endsAt: null,
			pausedRemainingSeconds: 372
		});
		expect(state.suspendedAt).toBe('2026-01-01T12:00:00.000Z');
		expect(state.suspendedUntil).toBe('2026-01-01T13:30:00.000Z');
		expect(state.modeBeforeSuspension).toBe('moderated_caucus');
	});

	it('throws when the row cannot be read', async () => {
		const { supabase } = createStandIn({
			committee_state: { data: null, error: { message: 'down' } }
		});

		await expect(readCommitteeState(supabase, 'committee-1')).rejects.toThrow('down');
	});
});

describe('getChairRoomFrame', () => {
	it('reads the state, the sessions, the seats and the latest attendance, and matches them up', async () => {
		const { supabase } = createStandIn({
			committee_state: {
				data: {
					current_session_id: 'session-1',
					mode: 'formal_debate',
					current_motion_id: 'motion-1',
					active_speakers_list_id: 'list-1',
					current_speaker_entry_id: 'entry-1',
					current_vote_id: 'vote-1',
					agenda_topic: 'Climate finance',
					timer_total_seconds: 60,
					timer_ends_at: '2026-01-01T10:01:00.000Z',
					timer_paused_remaining_seconds: null
				},
				error: null
			},
			committee_sessions: {
				data: [
					{
						id: 'session-1',
						name: 'Session 1',
						status: 'in_progress',
						started_at: '2026-01-01T09:00:00.000Z',
						ended_at: null
					},
					{
						id: 'session-0',
						name: 'Session 0',
						status: 'ended',
						started_at: '2025-12-31T09:00:00.000Z',
						ended_at: '2025-12-31T12:00:00.000Z'
					}
				],
				error: null
			},
			seats: {
				data: [{ id: 'seat-fr', name: 'France', country_code: 'FR', user_id: 'user-1' }],
				error: null
			},
			profiles: { data: [{ id: 'user-1', full_name: 'Daniel Park' }], error: null },
			roll_calls: { data: { id: 'rollcall-1' }, error: null },
			roll_call_entries: { data: [{ seat_id: 'seat-fr', status: 'present' }], error: null },
			motions: {
				data: {
					id: 'motion-1',
					kind: 'moderated_caucus',
					status: 'passed',
					topic: 'Climate finance',
					total_time_seconds: 600,
					speaking_time_seconds: 60,
					votes_for: 5,
					votes_against: 2,
					created_at: '2026-01-01T08:30:00.000Z',
					proposer: { name: 'France' }
				},
				error: null
			}
		});

		const frame = await getChairRoomFrame(supabase, 'committee-1');

		expect(frame.committeeState).toEqual({
			currentSessionId: 'session-1',
			mode: 'formal_debate',
			currentMotionId: 'motion-1',
			activeSpeakersListId: 'list-1',
			currentSpeakerEntryId: 'entry-1',
			currentVoteId: 'vote-1',
			agendaTopic: 'Climate finance',
			timer: { totalSeconds: 60, endsAt: '2026-01-01T10:01:00.000Z', pausedRemainingSeconds: null },
			caucusClock: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null },
			suspendedAt: null,
			suspendedUntil: null,
			modeBeforeSuspension: null
		});
		expect(frame.sessions).toHaveLength(2);
		// The current session is the one `committee_state` points at, found among the
		// sessions read separately, not read again on its own.
		expect(frame.currentSession).toEqual({
			id: 'session-1',
			name: 'Session 1',
			status: 'in_progress',
			startedAt: '2026-01-01T09:00:00.000Z',
			endedAt: null
		});
		expect(frame.currentMotion).toEqual({
			id: 'motion-1',
			kind: 'moderated_caucus',
			status: 'passed',
			topic: 'Climate finance',
			totalTimeSeconds: 600,
			speakingTimeSeconds: 60,
			proposedBySeatName: 'France',
			votesFor: 5,
			votesAgainst: 2,
			createdAt: '2026-01-01T08:30:00.000Z'
		});
		expect(frame.seats).toEqual([
			{ id: 'seat-fr', name: 'France', countryCode: 'FR', delegateName: 'Daniel Park' }
		]);
		expect(frame.attendance).toEqual({ 'seat-fr': 'present' });
		expect(frame.latestRollCallId).toBe('rollcall-1');
	});
});

/** A room in formal debate on list-1, with nothing else on the floor. */
const ROOM_ON_LIST: CommitteeStateView = {
	currentSessionId: 'session-1',
	mode: 'formal_debate',
	currentMotionId: null,
	activeSpeakersListId: 'list-1',
	currentSpeakerEntryId: null,
	currentVoteId: null,
	agendaTopic: null,
	timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
};

/** The layout's seats, which already carry the delegate's name. */
const FRAME_SEATS = [
	{ id: 'seat-fr', name: 'France', countryCode: 'FR', delegateName: 'Daniel Park' }
];

/** The speakers list and its two entries: France from the layout, Brazil from the join. */
const LIST_ANSWERS = {
	speakers_lists: {
		data: {
			id: 'list-1',
			name: "General Speakers' List",
			speaking_time_seconds: 60,
			is_open: true
		},
		error: null
	},
	speakers_list_entries: {
		data: [
			{
				id: 'entry-1',
				position: 1,
				status: 'speaking',
				speaker_name: null,
				seat: { id: 'seat-fr', name: 'France', country_code: 'FR' }
			},
			{
				id: 'entry-2',
				position: 2,
				status: 'waiting',
				speaker_name: null,
				seat: { id: 'seat-br', name: 'Brazil', country_code: 'BR' }
			}
		],
		error: null
	}
};

describe('isNamedChair', () => {
	it('asks committee_chairs for this reader on this committee', async () => {
		const { supabase, calls } = createStandIn({
			committee_chairs: { data: { user_id: 'user-1' }, error: null }
		});

		expect(await isNamedChair(supabase, 'committee-1', 'user-1')).toBe(true);
		expect(queryOn(calls, 'committee_chairs').eq).toEqual([
			['committee_id', 'committee-1'],
			['user_id', 'user-1']
		]);
	});

	it('says no for an organiser who is not named as a chair', async () => {
		const { supabase } = createStandIn({ committee_chairs: { data: null, error: null } });

		expect(await isNamedChair(supabase, 'committee-1', 'user-2')).toBe(false);
	});

	it('throws when the chairs cannot be read', async () => {
		const { supabase } = createStandIn({
			committee_chairs: { data: null, error: { message: 'boom' } }
		});

		await expect(isNamedChair(supabase, 'committee-1', 'user-1')).rejects.toThrow('boom');
	});
});

describe('getActiveSpeakersList', () => {
	it('has no list and no speakers when the room points at no list', async () => {
		const { supabase, calls } = createStandIn({});
		const noList = { ...ROOM_ON_LIST, activeSpeakersListId: null };

		expect(await getActiveSpeakersList(supabase, noList, FRAME_SEATS)).toEqual({
			speakersList: null,
			speakers: []
		});
		expect(calls).toHaveLength(0);
	});

	it('reads the list and its entries in position order, naming seats from the layout', async () => {
		const { supabase, calls } = createStandIn(LIST_ANSWERS);

		const result = await getActiveSpeakersList(supabase, ROOM_ON_LIST, FRAME_SEATS);

		expect(result.speakersList).toEqual({
			id: 'list-1',
			name: "General Speakers' List",
			speakingTimeSeconds: 60,
			isOpen: true
		});
		expect(queryOn(calls, 'speakers_list_entries').order).toEqual([['position', true]]);
		// France is the layout's seat, with the delegate's name; Brazil is not
		// among the layout's seats, so it is drawn from what the join returned.
		expect(result.speakers).toEqual([
			{ id: 'entry-1', position: 1, status: 'speaking', seat: FRAME_SEATS[0] },
			{
				id: 'entry-2',
				position: 2,
				status: 'waiting',
				seat: { id: 'seat-br', name: 'Brazil', countryCode: 'BR' }
			}
		]);
	});

	it('reads an entry with no seat as its typed name, in a seat of its own (S9)', async () => {
		const { supabase, calls } = createStandIn({
			...LIST_ANSWERS,
			speakers_list_entries: {
				data: [
					{
						id: 'entry-9',
						position: 1,
						status: 'speaking',
						speaker_name: 'Secretary-General',
						seat: null
					}
				],
				error: null
			}
		});

		const result = await getActiveSpeakersList(supabase, ROOM_ON_LIST, FRAME_SEATS);

		expect(queryOn(calls, 'speakers_list_entries').columns).toContain('speaker_name');
		expect(result.speakers).toEqual([
			{
				id: 'entry-9',
				position: 1,
				status: 'speaking',
				seat: { id: 'entry-9', name: 'Secretary-General', countryCode: null }
			}
		]);
	});

	it('has no list when the one the room points at cannot be seen', async () => {
		const { supabase } = createStandIn({
			speakers_lists: { data: null, error: null },
			speakers_list_entries: { data: [], error: null }
		});

		expect(await getActiveSpeakersList(supabase, ROOM_ON_LIST, FRAME_SEATS)).toEqual({
			speakersList: null,
			speakers: []
		});
	});

	it('throws when the entries cannot be read', async () => {
		const { supabase } = createStandIn({
			...LIST_ANSWERS,
			speakers_list_entries: { data: null, error: { message: 'boom' } }
		});

		await expect(getActiveSpeakersList(supabase, ROOM_ON_LIST, FRAME_SEATS)).rejects.toThrow(
			'boom'
		);
	});
});

describe('getCommitteeRoom', () => {
	it('adds the speakers list, the current vote and the last three motions of the session', async () => {
		const { supabase, calls } = createStandIn({
			...LIST_ANSWERS,
			votes: {
				data: { id: 'vote-1', subject: 'Draft resolution 1.1', status: 'open' },
				error: null
			},
			motions: { data: [], error: null }
		});
		const onVote = { ...ROOM_ON_LIST, currentVoteId: 'vote-1' };

		const room = await getCommitteeRoom(supabase, onVote, FRAME_SEATS);

		expect(room.speakersList?.id).toBe('list-1');
		expect(room.speakers).toHaveLength(2);
		expect(room.currentVote).toEqual({
			id: 'vote-1',
			subject: 'Draft resolution 1.1',
			status: 'open'
		});
		expect(room.recentMotions).toEqual([]);

		const motionsQuery = queryOn(calls, 'motions');
		expect(motionsQuery.eq).toEqual([['session_id', 'session-1']]);
		expect(motionsQuery.order).toEqual([['created_at', false]]);
		expect(motionsQuery.limit).toEqual([3]);
	});

	it('asks for no vote and no motions when the room has no vote and no session', async () => {
		const { supabase, calls } = createStandIn(LIST_ANSWERS);
		const noSession = { ...ROOM_ON_LIST, currentSessionId: null };

		const room = await getCommitteeRoom(supabase, noSession, FRAME_SEATS);

		expect(room.currentVote).toBeNull();
		expect(room.recentMotions).toEqual([]);
		expect(calls.map((call) => call.table)).not.toContain('votes');
		expect(calls.map((call) => call.table)).not.toContain('motions');
	});
});

describe('getConsoleFacts', () => {
	it('counts the motions on the floor, asks whether anyone has spoken, and reads the live list', async () => {
		const { supabase, calls } = createStandIn({
			...LIST_ANSWERS,
			motions: { data: [{ id: 'motion-1' }, { id: 'motion-2' }], error: null },
			speakers_list_entries: [
				{ data: [{ id: 'entry-1' }], error: null },
				LIST_ANSWERS.speakers_list_entries
			]
		});

		const facts = await getConsoleFacts(supabase, ROOM_ON_LIST, FRAME_SEATS);

		expect(facts.motionsOnFloorCount).toBe(2);
		expect(facts.hasAnyoneSpoken).toBe(true);
		expect(facts.generalSpeakersListId).toBe('list-1');
		expect(facts.liveList.speakersList?.id).toBe('list-1');
		expect(facts.liveList.speakers.map((speaker) => speaker.seat.name)).toEqual([
			'France',
			'Brazil'
		]);

		const motionsQuery = queryOn(calls, 'motions');
		expect(motionsQuery.eq).toEqual([
			['session_id', 'session-1'],
			['status', 'proposed']
		]);

		// The first question to the entries is whether any of the session's lists has had a speaker.
		const spokenQuery = queriesOn(calls, 'speakers_list_entries')[0];
		expect(spokenQuery.columns).toContain('speakers_lists!inner(session_id)');
		expect(spokenQuery.eq).toEqual([['list.session_id', 'session-1']]);
		expect(spokenQuery.in).toEqual([['status', ['speaking', 'spoken']]]);
		expect(spokenQuery.limit).toEqual([1]);
	});

	it('says nobody has spoken when no entry of the session has been called', async () => {
		const { supabase } = createStandIn({
			...LIST_ANSWERS,
			motions: { data: [], error: null },
			speakers_list_entries: [{ data: [], error: null }, LIST_ANSWERS.speakers_list_entries]
		});

		const facts = await getConsoleFacts(supabase, ROOM_ON_LIST, FRAME_SEATS);

		expect(facts.motionsOnFloorCount).toBe(0);
		expect(facts.hasAnyoneSpoken).toBe(false);
	});

	it('reads no live list while the live mode works through none, such as a vote', async () => {
		const { supabase, calls } = createStandIn({
			motions: { data: [], error: null },
			speakers_lists: { data: { id: 'list-gsl' }, error: null },
			speakers_list_entries: { data: [], error: null }
		});
		const onVote = { ...ROOM_ON_LIST, mode: 'voting' as const };

		const facts = await getConsoleFacts(supabase, onVote, FRAME_SEATS);

		expect(facts.liveList).toEqual({ speakersList: null, speakers: [] });
		// Only whether anyone has spoken is asked of the entries; the GSL is still read for realtime.
		expect(queriesOn(calls, 'speakers_list_entries')).toHaveLength(1);
		expect(facts.generalSpeakersListId).toBe('list-gsl');
		expect(queryOn(calls, 'speakers_lists').eq).toEqual([
			['session_id', 'session-1'],
			['kind', 'general']
		]);
	});

	it('asks nothing about motions or speakers while no session runs', async () => {
		const { supabase, calls } = createStandIn({});
		const lobby = { ...ROOM_ON_LIST, mode: 'idle' as const, currentSessionId: null };

		const facts = await getConsoleFacts(supabase, lobby, FRAME_SEATS);

		expect(facts).toEqual({
			motionsOnFloorCount: 0,
			hasAnyoneSpoken: false,
			liveList: { speakersList: null, speakers: [] },
			generalSpeakersListId: null
		});
		expect(calls).toEqual([]);
	});

	it('throws when the motions cannot be counted', async () => {
		const { supabase } = createStandIn({
			...LIST_ANSWERS,
			motions: { data: null, error: { message: 'down' } }
		});

		await expect(getConsoleFacts(supabase, ROOM_ON_LIST, FRAME_SEATS)).rejects.toThrow('down');
	});
});
