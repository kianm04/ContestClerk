/**
 * Reading and writing a session's motions for the chair's Motions view.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the reader's own Supabase client, so Row Level Security decides what they may
 * read and write: a chair of the committee, or an organiser of its conference.
 * What a passed motion then does to the room is `./motion-effects.ts`'s job.
 *
 * The shapes and the form rules are in `$lib/motions.ts`, so this file only
 * fetches and writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MotionStatus } from '$lib/chair-room';
import type { MotionKind } from '$lib/committee-room';
import type { MotionInput, SessionMotion } from '$lib/motions';

/** The motion columns, with the proposing seat followed through `proposed_by_seat_id`. */
const MOTION_COLUMNS =
	'id, kind, status, topic, total_time_seconds, speaking_time_seconds, votes_for, votes_against, decided_at, created_at, started_without_vote, proposer:seats!motions_proposed_by_seat_id_fkey(id, name, country_code)';

/** One motion as the database returns it. */
type MotionRow = {
	id: string;
	kind: MotionKind;
	status: MotionStatus;
	topic: string | null;
	total_time_seconds: number | null;
	speaking_time_seconds: number | null;
	votes_for: number | null;
	votes_against: number | null;
	decided_at: string | null;
	created_at: string;
	started_without_vote: boolean;
	proposer: { id: string; name: string; country_code: string | null } | null;
};

/** A motion row, in the shape the page draws. */
function toSessionMotion(row: MotionRow): SessionMotion {
	return {
		id: row.id,
		kind: row.kind,
		status: row.status,
		topic: row.topic,
		totalTimeSeconds: row.total_time_seconds,
		speakingTimeSeconds: row.speaking_time_seconds,
		proposedBy: row.proposer
			? { id: row.proposer.id, name: row.proposer.name, countryCode: row.proposer.country_code }
			: null,
		votesFor: row.votes_for,
		votesAgainst: row.votes_against,
		decidedAt: row.decided_at,
		createdAt: row.created_at,
		startedWithoutVote: row.started_without_vote
	};
}

/** Every motion of a session, in the order they were raised. */
export async function listMotions(
	supabase: SupabaseClient,
	sessionId: string
): Promise<SessionMotion[]> {
	const { data, error } = await supabase
		.from('motions')
		.select(MOTION_COLUMNS)
		.eq('session_id', sessionId)
		.order('created_at', { ascending: true })
		.overrideTypes<MotionRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the session's motions: ${error.message}`);
	}

	return (data ?? []).map(toSessionMotion);
}

/**
 * Write down a motion a delegate, or the chair, has just raised. It starts on
 * the floor. `motionId` is the id the browser chose for it (T141), so the row
 * this saves is the same row the Motions page already shows; null lets the
 * database choose one, as when the request carries no JavaScript.
 */
export async function proposeMotion(
	supabase: SupabaseClient,
	committeeId: string,
	sessionId: string,
	input: MotionInput,
	motionId: string | null = null
): Promise<void> {
	const { error } = await supabase.from('motions').insert({
		...(motionId === null ? {} : { id: motionId }),
		committee_id: committeeId,
		session_id: sessionId,
		proposed_by_seat_id: input.proposedBySeatId,
		kind: input.kind,
		topic: input.topic,
		total_time_seconds: input.totalTimeSeconds,
		speaking_time_seconds: input.speakingTimeSeconds,
		// The approved paper a motion to introduce a document names; passing it introduces that paper.
		paper_id: input.paperId,
		status: 'proposed'
	});

	if (error) {
		throw new Error(`Could not add the motion: ${error.message}`);
	}
}

/**
 * Take a motion off the floor: passed or failed with its tally, or withdrawn
 * with none.
 *
 * Only a motion still `proposed` is changed, so two chairs deciding the same
 * motion at once cannot both succeed. Answers whether this call decided it.
 */
export async function decideMotion(
	supabase: SupabaseClient,
	motionId: string,
	decision: {
		status: Exclude<MotionStatus, 'proposed'>;
		votesFor: number | null;
		votesAgainst: number | null;
	},
	now: Date
): Promise<boolean> {
	const { data, error } = await supabase
		.from('motions')
		.update({
			status: decision.status,
			votes_for: decision.votesFor,
			votes_against: decision.votesAgainst,
			decided_at: now.toISOString()
		})
		.eq('id', motionId)
		.eq('status', 'proposed')
		.select('id');

	if (error) {
		throw new Error(`Could not decide the motion: ${error.message}`);
	}

	return (data ?? []).length > 0;
}

/**
 * "Clear the floor": every motion of the session still on the floor becomes
 * `dropped`, stamped with `now`, so the record says nobody voted on it. Answers
 * the ids it dropped, which the toast's "Undo" sends back to `restoreMotions`.
 */
export async function dropMotions(
	supabase: SupabaseClient,
	sessionId: string,
	now: Date
): Promise<string[]> {
	const { data, error } = await supabase
		.from('motions')
		.update({ status: 'dropped', decided_at: now.toISOString() })
		.eq('session_id', sessionId)
		.eq('status', 'proposed')
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not clear the floor: ${error.message}`);
	}

	return (data ?? []).map((row) => row.id);
}

/**
 * "Undo" and "Restore": each of `motionIds`, while it is a `dropped` motion of
 * the session, goes back on the floor with its decision time cleared, so it
 * takes its place by rank again. Answers how many it put back; the action has
 * already made sure every one of them was dropped.
 */
export async function restoreMotions(
	supabase: SupabaseClient,
	sessionId: string,
	motionIds: string[]
): Promise<number> {
	const { data, error } = await supabase
		.from('motions')
		.update({ status: 'proposed', decided_at: null })
		.eq('session_id', sessionId)
		.eq('status', 'dropped')
		.in('id', motionIds)
		.select('id');

	if (error) {
		throw new Error(`Could not put the motions back on the floor: ${error.message}`);
	}

	return (data ?? []).length;
}
