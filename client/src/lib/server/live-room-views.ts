/**
 * What the live room, `chair`, reads for the view the room's mode draws
 * (`05-pages/chair/committee-room.md`, "Data": "Opening and debate"): the
 * GSL view's list, the running caucus, the single speaker or the vote.
 *
 * Files under `$lib/server` only ever run on the server. Each view's own
 * route (`chair/gsl`, `chair/mod`, `chair/unmod`, `chair/single`,
 * `chair/voting`) calls the same reader as this file does, so `chair` and
 * the view's route always draw the same thing. A view is read while its mode
 * runs and while the room is suspended in it, so "Resume session" can draw it
 * the moment it is pressed, before `load` has run again.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isSessionRunning, type CommitteeSession, type CommitteeStateView } from '$lib/chair-room';
import type { ModViewData, UnmodViewData } from '$lib/caucus-view';
import type { RoomSeat } from '$lib/committee-room';
import type { GslList } from '$lib/gsl-floor';
import { isModeRunning } from '$lib/mode-start';
import type { SingleSpeakerViewData } from '$lib/single-speaker';
import type { VoteViewData } from '$lib/votes';
import { readModView, readUnmodView } from '$lib/server/caucus-view';
import { readGslList } from '$lib/server/gsl-view';
import { readSingleSpeakerView } from '$lib/server/single-speaker-view';
import { readVoteView } from '$lib/server/vote-view';

/** The part of the chair layout's data the readers need. */
export type LiveRoomFrame = {
	committeeId: string;
	committeeState: CommitteeStateView;
	currentSession: CommitteeSession | null;
	seats: RoomSeat[];
};

/** Each view's data, or null while that view is not the one the room runs. */
export type LiveRoomViews = {
	/**
	 * The General Speakers' List, read whenever a session runs: the GSL view
	 * draws it, the opening band sits over it, and "End caucus", "Return to
	 * GSL" and "End voting" draw it at the press.
	 */
	gsl: GslList | null;
	mod: ModViewData | null;
	unmod: UnmodViewData | null;
	single: SingleSpeakerViewData | null;
	/** The Vote view's data, under the name the console's keys look for (`voteView`). */
	voteView: VoteViewData | null;
};

/** Whether the room votes, or is suspended in the middle of a vote. */
function isVoteUnderway(state: CommitteeStateView): boolean {
	if (state.mode === 'voting') return true;

	return state.mode === 'suspended' && state.modeBeforeSuspension === 'voting';
}

/**
 * Every view's data `chair` may draw, read side by side. `url` carries the
 * Vote view's questions (`?vote=new`, `?cancel=confirm`, `?seat=<id>`).
 * While no session runs every view is null.
 */
export async function readLiveRoomViews(
	supabase: SupabaseClient,
	frame: LiveRoomFrame,
	url: URL
): Promise<LiveRoomViews> {
	const session = frame.currentSession;

	if (session === null || !isSessionRunning(session)) {
		return { gsl: null, mod: null, unmod: null, single: null, voteView: null };
	}

	const state = frame.committeeState;
	// `readModView` and `readSingleSpeakerView` answer null by themselves while
	// their mode is not running; the other two read whenever a session runs,
	// so they are asked only while theirs is.
	const isUnmodRunning = isModeRunning(state, 'unmoderated_caucus');

	const [gsl, mod, unmod, single, voteView] = await Promise.all([
		readGslList(supabase, session.id, frame.seats),
		readModView(supabase, frame),
		isUnmodRunning ? readUnmodView(supabase, frame) : null,
		readSingleSpeakerView(supabase, frame),
		isVoteUnderway(state) ? readVoteView(supabase, frame, url) : null
	]);

	return { gsl, mod, unmod, single, voteView };
}
