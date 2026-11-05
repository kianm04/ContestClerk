import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeStateView } from '$lib/chair-room';
import type { CaucusStartInput } from '$lib/caucus-start';
import {
	checkStart,
	hasOpenVote,
	refuseStart,
	startCaucusDirectly,
	startSingleSpeaker
} from './mode-starts';

// Nothing here talks to a database. The stand-in client writes down what each
// request asked for and answers with fixed results. The SQL functions run
// against a real database in `tests/db/room-press-functions.test.ts`, and the
// starts end to end in the three views' browser tests.

/** An answer to one request, in the shape the real client gives one. */
type Answer = { data: unknown; error: { code?: string; message: string } | null };

/** What the stand-in was asked to do. */
type Call = { kind: string; table?: string; values?: unknown; args?: unknown };

/** A stand-in client: `insert` and `select` answer `rows`, `rpc` answers `rpcAnswer`. */
function createStandIn(rows: Answer, rpcAnswer: Answer) {
	const calls: Call[] = [];

	function builderFor(table: string) {
		const builder = {
			then: (resolve: (answer: Answer) => void) => resolve(rows),
			insert: (values: unknown) => {
				calls.push({ kind: 'insert', table, values });
				return builder;
			},
			delete: () => {
				calls.push({ kind: 'delete', table });
				return builder;
			},
			select: () => builder,
			eq: () => builder,
			limit: () => builder,
			single: () => builder
		};

		return builder;
	}

	const supabase = {
		from: builderFor,
		rpc: async (name: string, args: unknown) => {
			calls.push({ kind: 'rpc', table: name, args });
			return rpcAnswer;
		}
	} as unknown as SupabaseClient;

	return { supabase, calls };
}

const PLACE = {
	committeeId: 'committee-1',
	sessionId: 'session-1',
	pressedAt: new Date('2026-10-01T12:00:00.000Z')
};

const MOD: CaucusStartInput = {
	kind: 'moderated_caucus',
	proposedBySeatId: 'seat-br',
	topic: 'Corridors',
	totalSeconds: 600,
	speakingSeconds: 60
};

const MOTION_ID = '0d1e2f3a-4b5c-4d6e-8f90-a1b2c3d4e5f6';

describe('startCaucusDirectly', () => {
	it('records the caucus started without a vote, under the browser’s id, then passes it', async () => {
		const { supabase, calls } = createStandIn(
			{ data: { id: MOTION_ID }, error: null },
			{ data: [], error: null }
		);

		expect(await startCaucusDirectly(supabase, PLACE, MOD, MOTION_ID)).toBeNull();
		expect(calls[0]).toEqual({
			kind: 'insert',
			table: 'motions',
			values: {
				id: MOTION_ID,
				committee_id: 'committee-1',
				session_id: 'session-1',
				proposed_by_seat_id: 'seat-br',
				kind: 'moderated_caucus',
				topic: 'Corridors',
				total_time_seconds: 600,
				speaking_time_seconds: 60,
				started_without_vote: true
			}
		});
		expect(calls[1]).toEqual({
			kind: 'rpc',
			table: 'apply_passed_motion',
			args: {
				motion_id: MOTION_ID,
				votes_for: null,
				votes_against: null,
				pressed_at: '2026-10-01T12:00:00.000Z'
			}
		});
	});

	it('takes back the motion and answers the database’s refusal', async () => {
		const { supabase, calls } = createStandIn(
			{ data: { id: MOTION_ID }, error: null },
			{ data: null, error: { code: 'P0001', message: 'Close the open vote first.' } }
		);

		expect(await startCaucusDirectly(supabase, PLACE, MOD, null)).toBe(
			'Close the open vote first.'
		);
		expect(calls.map((call) => call.kind)).toEqual(['insert', 'rpc', 'delete']);
		// Without a browser's id the database chooses one.
		expect((calls[0].values as { id?: string }).id).toBeUndefined();
	});

	it('throws for any other failure', async () => {
		const { supabase } = createStandIn(
			{ data: { id: MOTION_ID }, error: null },
			{ data: null, error: { code: '42501', message: 'Only a chair…' } }
		);

		await expect(startCaucusDirectly(supabase, PLACE, MOD, null)).rejects.toThrow(
			'Could not start the caucus'
		);
	});
});

describe('startSingleSpeaker', () => {
	const INPUT = {
		seatId: null,
		speakerName: 'Secretary-General',
		purpose: 'Right of reply',
		speakingSeconds: 60
	};

	it('gives the floor through `start_single_speaker`', async () => {
		const { supabase, calls } = createStandIn(
			{ data: null, error: null },
			{ data: null, error: null }
		);

		expect(await startSingleSpeaker(supabase, PLACE, INPUT)).toBeNull();
		expect(calls[0]).toEqual({
			kind: 'rpc',
			table: 'start_single_speaker',
			args: {
				committee_id: 'committee-1',
				seat_id: null,
				speaker_name: 'Secretary-General',
				purpose: 'Right of reply',
				speaking_time_seconds: 60,
				pressed_at: '2026-10-01T12:00:00.000Z'
			}
		});
	});

	it('answers the database’s refusal', async () => {
		const { supabase } = createStandIn(
			{ data: null, error: null },
			{ data: null, error: { code: 'P0001', message: 'Resume the session first.' } }
		);

		expect(await startSingleSpeaker(supabase, PLACE, INPUT)).toBe('Resume the session first.');
	});
});

describe('hasOpenVote and checkStart', () => {
	const ROOM: CommitteeStateView = {
		currentSessionId: 'session-1',
		mode: 'formal_debate',
		currentMotionId: null,
		activeSpeakersListId: 'gsl-1',
		currentSpeakerEntryId: null,
		currentVoteId: null,
		agendaTopic: null,
		timer: { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null }
	};
	const SESSION = {
		id: 'session-1',
		name: 'Session 1',
		status: 'in_progress' as const,
		startedAt: null,
		endedAt: null
	};

	it('reads whether a vote is open', async () => {
		const open = createStandIn(
			{ data: [{ id: 'vote-1' }], error: null },
			{ data: null, error: null }
		);
		const none = createStandIn({ data: [], error: null }, { data: null, error: null });

		expect(await hasOpenVote(open.supabase, 'session-1')).toBe(true);
		expect(await hasOpenVote(none.supabase, 'session-1')).toBe(false);
	});

	it('lets a start go ahead in a running session, and refuses with the button’s words', async () => {
		const none = createStandIn({ data: [], error: null }, { data: null, error: null });
		const open = createStandIn(
			{ data: [{ id: 'vote-1' }], error: null },
			{ data: null, error: null }
		);
		const suspended = { ...ROOM, mode: 'suspended' as const };

		expect(
			await checkStart(none.supabase, { committeeState: ROOM, currentSession: SESSION })
		).toEqual({
			sessionId: 'session-1'
		});
		expect(await checkStart(none.supabase, { committeeState: ROOM, currentSession: null })).toEqual(
			{
				refusal: 'Start a session first.'
			}
		);
		expect(
			await checkStart(open.supabase, { committeeState: ROOM, currentSession: SESSION })
		).toEqual({
			refusal: 'Close the open vote first.'
		});
		expect(
			await checkStart(none.supabase, { committeeState: suspended, currentSession: SESSION })
		).toEqual({ refusal: 'Resume the session first.' });
	});

	it('refuses keeping what was typed', () => {
		const refused = refuseStart('Close the open vote first.', { topic: 'Corridors' });

		expect(refused.status).toBe(400);
		expect(refused.data).toEqual({
			flash: { tone: 'error', message: 'Close the open vote first.' },
			values: { topic: 'Corridors' }
		});
	});
});
