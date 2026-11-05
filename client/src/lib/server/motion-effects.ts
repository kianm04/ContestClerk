/**
 * What a passed motion does to the committee room.
 *
 * Files under `$lib/server` only ever run on the server. The Motions page
 * calls `applyPassedMotion` when the chair presses "Pass"; every change lands
 * in the room's one `committee_state` row and the rows it points at, which
 * realtime sends to every screen in the room. `specs/05-pages/chair/motions.md`
 * lists what each kind of motion does.
 *
 * The work itself is the SQL function `apply_passed_motion`
 * (`supabase/migrations/20261001120500_room_press_functions.sql`), so that the
 * motion, the motions it drops, the speech it ends and the room it changes are
 * written in one transaction (S2), and two chairs passing the same motion at
 * once cannot both succeed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeStateView } from '$lib/chair-room';
import type { SessionMotion } from '$lib/motions';
import { roomRefusal } from '$lib/server/committee-room';

/** The counts a motion passed with, or both null when the chair passed it without counting. */
export type PassedMotionCounts = {
	votesFor: number | null;
	votesAgainst: number | null;
};

/**
 * What passing did: the ids of the other motions it dropped from the floor, or
 * the sentence the database refused with, such as "That motion is no longer on
 * the floor." when a co-chair decided it first.
 */
export type PassedMotionOutcome = { droppedMotionIds: string[] } | { refusal: string };

/**
 * The code `introduce_paper` raises its refusals with (22023, "invalid
 * parameter value"), when the paper a motion names is no longer waiting to be
 * introduced, such as one withdrawn while the motion was on the floor.
 */
const PAPER_REFUSAL_CODE = '22023';

/** The sentence `introduce_paper` refused with, which the chair is shown as it is; or null. */
function paperRefusal(error: { code?: string; message: string } | null): string | null {
	return error?.code === PAPER_REFUSAL_CODE ? error.message : null;
}

/** No counts, which is how the direct route and an uncounted Pass are recorded. */
const UNCOUNTED: PassedMotionCounts = { votesFor: null, votesAgainst: null };

/**
 * Pass `motion` and change the room the way it asks, in one transaction:
 *
 * - the motion becomes `passed` with `counts`, and every other motion still on
 *   the floor of the session is `dropped` (unless this one was started from
 *   its own view without a vote, which leaves the floor alone);
 * - a moderated caucus runs on a new speakers list of its own, with nobody
 *   speaking yet and its total on the caucus clock, paused;
 * - an unmoderated caucus starts its total time on the room's timer;
 * - an extension adds its time to the caucus being run;
 * - suspending the meeting suspends the room, pausing every clock, with the
 *   motion's length as the time the room is back;
 * - adjourning ends the session, as "End session" on the Room page does;
 * - closing debate moves the room to voting with nobody speaking;
 * - introducing a document that names an approved paper introduces it and
 *   puts it on the projector (`introduce_paper`); a typed document and any
 *   other motion are only recorded.
 *
 * A caucus, closing debate or adjourning ends the speech in progress, with its
 * time recorded. A caucus passed while another is running replaces it; the
 * old motion keeps its `passed`.
 *
 * `committeeId`, `committeeState` and `sessionId` are no longer read, because
 * the function reads the room itself, under a lock; they stay parameters so
 * that the pages calling this did not have to change.
 */
export async function applyPassedMotion(
	supabase: SupabaseClient,
	committeeId: string,
	committeeState: CommitteeStateView,
	sessionId: string,
	motion: SessionMotion,
	now: Date,
	counts: PassedMotionCounts = UNCOUNTED
): Promise<PassedMotionOutcome> {
	// A function that returns a set of ids comes back as a plain list of them.
	const { data, error } = await supabase.rpc('apply_passed_motion', {
		motion_id: motion.id,
		votes_for: counts.votesFor,
		votes_against: counts.votesAgainst,
		pressed_at: now.toISOString()
	});

	const refusal = roomRefusal(error) ?? paperRefusal(error);

	if (refusal !== null) return { refusal };

	if (error) {
		throw new Error(`Could not pass the motion: ${error.message}`);
	}

	const droppedMotionIds: string[] = data ?? [];

	return { droppedMotionIds };
}
