/**
 * Starting a mode from its own view: a moderated or unmoderated caucus the
 * chair calls without a vote, and a single speaker given the floor
 * (`specs/05-pages/chair/mod.md`, "`startModerated`"; `unmod.md`,
 * "`startUnmoderated`"; `single-speaker.md`, "`startSingle`").
 *
 * Files under `$lib/server` only ever run on the server. The SQL functions do
 * the moving in one transaction each (`apply_passed_motion` and
 * `start_single_speaker`, in
 * `supabase/migrations/20261001120500_room_press_functions.sql`), and refuse
 * with the sentences the pages show, which these pass back to the action.
 */

import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSessionRunning, type CommitteeSession, type CommitteeStateView } from '$lib/chair-room';
import type { CaucusStartInput } from '$lib/caucus-start';
import type { Flash } from '$lib/flash';
import { START_REFUSALS, startBlockedReason } from '$lib/mode-start';
import type { SingleSpeakerInput } from '$lib/single-speaker';
import { roomRefusal } from '$lib/server/committee-room';

/** Where and when a start happens. */
export type StartPlace = {
	committeeId: string;
	sessionId: string;
	/** The moment the chair pressed, which the clocks are worked out from. */
	pressedAt: Date;
};

/**
 * Refuse a start with `message` as an error toast, sending back what was
 * typed so the form is drawn again as it was, without JavaScript too.
 */
export function refuseStart<Values>(message: string, values: Values) {
	return fail(400, { flash: { tone: 'error', message } satisfies Flash, values });
}

/** Whether a vote of the session is still open, which every start waits for. */
export async function hasOpenVote(supabase: SupabaseClient, sessionId: string): Promise<boolean> {
	const { data, error } = await supabase
		.from('votes')
		.select('id')
		.eq('session_id', sessionId)
		.eq('status', 'open')
		.limit(1);

	if (error) {
		throw new Error(`Could not read whether a vote is open: ${error.message}`);
	}

	return (data ?? []).length > 0;
}

/**
 * Whether a start may go ahead, asked before its form is read (`mod.md`,
 * "`startModerated`"): there must be a session running, not suspended, with
 * no vote open. Answers the running session's id, or the sentence to refuse
 * with, the same words the disabled button shows.
 */
export async function checkStart(
	supabase: SupabaseClient,
	frame: { committeeState: CommitteeStateView; currentSession: CommitteeSession | null }
): Promise<{ sessionId: string } | { refusal: string }> {
	const session = frame.currentSession;

	if (session === null || !isSessionRunning(session)) return { refusal: START_REFUSALS.noSession };

	const blocked = startBlockedReason({
		isSuspended: frame.committeeState.mode === 'suspended',
		hasOpenVote: await hasOpenVote(supabase, session.id)
	});

	return blocked === null ? { sessionId: session.id } : { refusal: blocked };
}

/**
 * Start a caucus the chair calls without a vote: the direct route (D3). The
 * motion is written down as `proposed`, raised by the chosen seat (null for
 * the chair) and marked `started_without_vote`, under the id the browser
 * chose (`motionId`, or the database's own with null); `apply_passed_motion`
 * then passes it and moves the room exactly as Pass in Motions does, except
 * that it drops none of the motions on the floor. Answers the sentence the
 * database refused with ("Close the open vote first."), or null once the
 * caucus runs.
 */
export async function startCaucusDirectly(
	supabase: SupabaseClient,
	place: StartPlace,
	input: CaucusStartInput,
	motionId: string | null
): Promise<string | null> {
	const { data, error } = await supabase
		.from('motions')
		.insert({
			...(motionId === null ? {} : { id: motionId }),
			committee_id: place.committeeId,
			session_id: place.sessionId,
			proposed_by_seat_id: input.proposedBySeatId,
			kind: input.kind,
			topic: input.topic,
			total_time_seconds: input.totalSeconds,
			speaking_time_seconds: input.speakingSeconds,
			started_without_vote: true
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not record the caucus: ${error?.message}`);
	}

	const { error: passError } = await supabase.rpc('apply_passed_motion', {
		motion_id: data.id,
		votes_for: null,
		votes_against: null,
		pressed_at: place.pressedAt.toISOString()
	});

	if (passError === null) return null;

	// The two requests are not one transaction, so a refused pass would leave
	// the motion on the floor as if somebody had raised it. It goes again.
	await supabase.from('motions').delete().eq('id', data.id);

	const refusal = roomRefusal(passError);

	if (refusal !== null) return refusal;

	throw new Error(`Could not start the caucus: ${passError.message}`);
}

/**
 * Give one speaker the floor (D5) through `start_single_speaker`: a new list
 * of kind `single` with the purpose and the time, the seat or the typed name
 * on it with the floor and the clock ready, a caucus that was live ended, and
 * no motion recorded. The database chooses the ids of the list and the entry.
 * Answers the sentence it refused with, or null once the speaker has the
 * floor.
 */
export async function startSingleSpeaker(
	supabase: SupabaseClient,
	place: Omit<StartPlace, 'sessionId'>,
	input: SingleSpeakerInput
): Promise<string | null> {
	const { error } = await supabase.rpc('start_single_speaker', {
		committee_id: place.committeeId,
		seat_id: input.seatId,
		speaker_name: input.speakerName,
		purpose: input.purpose,
		speaking_time_seconds: input.speakingSeconds,
		pressed_at: place.pressedAt.toISOString()
	});

	if (error === null) return null;

	const refusal = roomRefusal(error);

	if (refusal !== null) return refusal;

	throw new Error(`Could not give the floor: ${error.message}`);
}
