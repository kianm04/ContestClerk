/**
 * Starting, switching and ending a committee's sessions.
 *
 * Files under `$lib/server` only ever run on the server. A session is a block
 * of committee time: every roll call, motion, vote and speakers list belongs to
 * one, so a new day starts clean while the history stays
 * (`specs/06-features/chairing.md`). Starting and ending one also resets the
 * room's `committee_state` row, which `./committee-room.ts` writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChairCommittee, MotionStatus, VoteStatus } from '$lib/chair-room';
import { CLEARED_TIMER } from '$lib/committee-room';
import type { SessionRecord } from '$lib/room-record';
import {
	CLEARED_CAUCUS_CLOCK,
	CLEARED_SUSPENSION,
	finishSpeechInProgress,
	readCommitteeState,
	timerColumns,
	updateCommitteeState
} from '$lib/server/committee-room';
import { cancelOpenVotes } from '$lib/server/votes';

/**
 * Open a new session and put the room into formal debate on a fresh General
 * Speakers' List, which takes the committee's default speaking time.
 *
 * The SQL function `start_committee_session` does it in one transaction, so a
 * session is never left without its list, nor the room pointing at the last
 * session's (S2). It refuses while another session is running, with the
 * sentence the page shows; the page asks first, because it already has the
 * sessions loaded, and the function asks again for two chairs pressing at once.
 */
export async function startSession(
	supabase: SupabaseClient,
	committee: ChairCommittee,
	name: string,
	now: Date
): Promise<void> {
	const { error } = await supabase.rpc('start_committee_session', {
		committee_id: committee.id,
		name,
		pressed_at: now.toISOString()
	});

	if (error) {
		throw new Error(`Could not start the session: ${error.message}`);
	}
}

/**
 * Close a session. The speech in progress ends with its time recorded, and a
 * vote still open is cancelled (deleted with its answers, as "Cancel vote"
 * does), because a closed session can no longer finish it. The room goes back
 * to idle, pointing at no session, with nothing on the floor, no clock and no
 * suspension.
 */
export async function endSession(
	supabase: SupabaseClient,
	committeeId: string,
	sessionId: string,
	now: Date
): Promise<void> {
	const { data, error } = await supabase
		.from('committee_sessions')
		.update({ status: 'ended', ended_at: now.toISOString() })
		.eq('id', sessionId)
		.eq('committee_id', committeeId)
		.select('id');

	if (error) {
		throw new Error(`Could not end the session: ${error.message}`);
	}

	if (!data || data.length === 0) {
		throw new Error('The session was not ended.');
	}

	const committeeState = await readCommitteeState(supabase, committeeId);
	await finishSpeechInProgress(supabase, committeeState, now);
	await cancelOpenVotes(supabase, sessionId);

	await updateCommitteeState(supabase, committeeId, {
		mode: 'idle',
		current_session_id: null,
		current_motion_id: null,
		active_speakers_list_id: null,
		current_speaker_entry_id: null,
		current_vote_id: null,
		...timerColumns(CLEARED_TIMER),
		...CLEARED_CAUCUS_CLOCK,
		...CLEARED_SUSPENSION
	});
}

/** The motion outcomes a session's record counts: decided, by a vote or without one. */
const DECIDED_MOTION_STATUSES: MotionStatus[] = ['passed', 'failed'];

/**
 * What a session did, for the ended screen and the lobby's "Last session"
 * (`committee-room.md`, "Ended"): the speeches made on any of its lists, its
 * motions that passed or failed (those started without a vote are passed
 * ones), and each closed vote's subject and result. Three short reads, made
 * together.
 */
export async function readSessionRecord(
	supabase: SupabaseClient,
	sessionId: string
): Promise<SessionRecord> {
	const [speechesResult, motionsResult, votesResult] = await Promise.all([
		// `!inner` makes the list's session a condition on the entries, so one query answers it.
		supabase
			.from('speakers_list_entries')
			.select('id, list:speakers_lists!inner(session_id)')
			.eq('list.session_id', sessionId)
			.eq('status', 'spoken')
			.overrideTypes<{ id: string }[], { merge: false }>(),
		supabase
			.from('motions')
			.select('status')
			.eq('session_id', sessionId)
			.overrideTypes<{ status: MotionStatus }[], { merge: false }>(),
		supabase
			.from('votes')
			.select('subject, status, passed')
			.eq('session_id', sessionId)
			.overrideTypes<
				{ subject: string | null; status: VoteStatus; passed: boolean | null }[],
				{ merge: false }
			>()
	]);

	const failure = speechesResult.error ?? motionsResult.error ?? votesResult.error;

	if (failure) {
		throw new Error(`Could not read the session's record: ${failure.message}`);
	}

	const decidedMotions = (motionsResult.data ?? []).filter((motion) =>
		DECIDED_MOTION_STATUSES.includes(motion.status)
	);
	const closedVotes = (votesResult.data ?? []).filter((vote) => vote.status === 'closed');

	return {
		sessionId,
		speechCount: (speechesResult.data ?? []).length,
		decidedMotionCount: decidedMotions.length,
		passedMotionCount: decidedMotions.filter((motion) => motion.status === 'passed').length,
		votes: closedVotes.map((vote) => ({ subject: vote.subject, passed: vote.passed === true }))
	};
}
