import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeStateView } from '$lib/chair-room';
import type { SessionMotion } from '$lib/motions';
import { applyPassedMotion } from './motion-effects';

// Passing a motion is one call to the SQL function `apply_passed_motion`,
// which marks it passed, drops the rest and changes the room in one
// transaction. What it writes for each kind of motion is tested against the
// real database in `tests/db/room-press-functions.test.ts`; these tests are
// about what this module asks it and what it makes of the answer. Nothing here
// talks to a database.

const NOW = new Date('2026-01-01T10:00:00.000Z');

/** A room in formal debate on the General Speakers' List, France speaking. */
const FORMAL_DEBATE: CommitteeStateView = {
	currentSessionId: 'session-1',
	mode: 'formal_debate',
	currentMotionId: null,
	activeSpeakersListId: 'list-gsl',
	currentSpeakerEntryId: 'entry-fr',
	currentVoteId: null,
	agendaTopic: null,
	timer: { totalSeconds: 60, endsAt: '2026-01-01T10:00:30.000Z', pausedRemainingSeconds: null }
};

/** A motion still on the floor. */
const MODERATED_CAUCUS: SessionMotion = {
	id: 'motion-1',
	kind: 'moderated_caucus',
	status: 'proposed',
	topic: 'Climate finance',
	totalTimeSeconds: 600,
	speakingTimeSeconds: 45,
	proposedBy: null,
	votesFor: null,
	votesAgainst: null,
	decidedAt: null,
	createdAt: '2026-01-01T09:00:00.000Z',
	startedWithoutVote: false
};

/** What the database answered, in the shape the real client gives it. */
type Answer = { data: unknown; error: { code?: string; message: string } | null };

/** A stand-in client whose one database function answers `answer`, and which writes down the call. */
function createStandIn(answer: Answer) {
	const functionCalls: { name: string; args: Record<string, unknown> }[] = [];

	async function rpc(name: string, args: Record<string, unknown>): Promise<Answer> {
		functionCalls.push({ name, args });
		return answer;
	}

	const supabase = { rpc } as unknown as SupabaseClient;

	return { supabase, functionCalls };
}

describe('applyPassedMotion', () => {
	it('asks apply_passed_motion to pass the motion with its counts, at the moment pressed', async () => {
		const { supabase, functionCalls } = createStandIn({ data: [], error: null });
		const counts = { votesFor: 9, votesAgainst: 5 };

		await applyPassedMotion(
			supabase,
			'committee-1',
			FORMAL_DEBATE,
			'session-1',
			MODERATED_CAUCUS,
			NOW,
			counts
		);

		expect(functionCalls).toEqual([
			{
				name: 'apply_passed_motion',
				args: {
					motion_id: 'motion-1',
					votes_for: 9,
					votes_against: 5,
					pressed_at: NOW.toISOString()
				}
			}
		]);
	});

	it('passes a motion without counts when none are given, as the direct route does', async () => {
		const { supabase, functionCalls } = createStandIn({ data: [], error: null });

		await applyPassedMotion(
			supabase,
			'committee-1',
			FORMAL_DEBATE,
			'session-1',
			MODERATED_CAUCUS,
			NOW
		);

		expect(functionCalls[0].args).toMatchObject({ votes_for: null, votes_against: null });
	});

	it('answers the ids of the motions it dropped from the floor', async () => {
		const { supabase } = createStandIn({ data: ['motion-2', 'motion-3'], error: null });

		const outcome = await applyPassedMotion(
			supabase,
			'committee-1',
			FORMAL_DEBATE,
			'session-1',
			MODERATED_CAUCUS,
			NOW
		);

		expect(outcome).toEqual({ droppedMotionIds: ['motion-2', 'motion-3'] });
	});

	it('answers the sentence the database refused with, so the page can show it', async () => {
		const { supabase } = createStandIn({
			data: null,
			error: { code: 'P0001', message: 'That motion is no longer on the floor.' }
		});

		const outcome = await applyPassedMotion(
			supabase,
			'committee-1',
			FORMAL_DEBATE,
			'session-1',
			MODERATED_CAUCUS,
			NOW
		);

		expect(outcome).toEqual({ refusal: 'That motion is no longer on the floor.' });
	});

	it('answers the sentence introduce_paper refused with, for a paper no longer waiting', async () => {
		const message = 'That paper is no longer waiting to be introduced. Drop the motion.';
		const { supabase } = createStandIn({ data: null, error: { code: '22023', message } });

		const outcome = await applyPassedMotion(
			supabase,
			'committee-1',
			FORMAL_DEBATE,
			'session-1',
			MODERATED_CAUCUS,
			NOW
		);

		expect(outcome).toEqual({ refusal: message });
	});

	it('throws on any other failure, such as a caller who does not chair the committee', async () => {
		const { supabase } = createStandIn({
			data: null,
			error: { code: '42501', message: 'Only a chair of this committee can pass a motion.' }
		});

		await expect(
			applyPassedMotion(supabase, 'committee-1', FORMAL_DEBATE, 'session-1', MODERATED_CAUCUS, NOW)
		).rejects.toThrow(/Could not pass the motion: Only a chair/);
	});
});
