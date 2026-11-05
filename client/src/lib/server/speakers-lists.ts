/**
 * Moving the floor on: the next speaker, and a speaker yielding their time.
 *
 * Files under `$lib/server` only ever run on the server. The rules are in
 * `specs/05-pages/chair/speakers.md`: the speech that ends is marked `spoken`
 * with how long it lasted, and `committee_state` points at whoever has the
 * floor next, with the timer set for them. The Room page (T41) and the
 * Speakers page (T43) call the same functions, so the two pages cannot drift
 * apart. "Next speaker" is the SQL function `call_next_speaker`, which moves
 * the floor on in one transaction (S2).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeStateView, RoomSpeaker, SpeakersListSummary } from '$lib/chair-room';
import { CLEARED_TIMER, remainingSeconds, spokeSeconds, startedTimer } from '$lib/committee-room';
import {
	timerColumns,
	updateCommitteeState,
	type CommitteeStateChanges
} from '$lib/server/committee-room';

/**
 * What moving to the next speaker did: the floor `moved` to the next seat, it
 * is `empty` because nobody was waiting, or it was `unchanged` because another
 * press had already moved it on since the chair's screen was drawn.
 */
export type NextSpeakerOutcome = 'moved' | 'empty' | 'unchanged';

/** The speakers list and the entries the room page loaded for it. */
export type SpeakersListInRoom = {
	speakersList: SpeakersListSummary;
	speakers: RoomSpeaker[];
};

/**
 * Mark the speech that has the floor as finished: `spoken`, when it ended and
 * how long it lasted. Does nothing when nobody is speaking.
 */
async function finishCurrentSpeech(
	supabase: SupabaseClient,
	committeeState: CommitteeStateView,
	speakingTimeSeconds: number,
	now: Date
): Promise<void> {
	const entryId = committeeState.currentSpeakerEntryId;

	if (entryId === null) return;

	const secondsLeft = remainingSeconds(committeeState.timer, now) ?? 0;

	const { error } = await supabase
		.from('speakers_list_entries')
		.update({
			status: 'spoken',
			finished_at: now.toISOString(),
			spoke_seconds: spokeSeconds(speakingTimeSeconds, secondsLeft)
		})
		.eq('id', entryId);

	if (error) {
		throw new Error(`Could not end the speech: ${error.message}`);
	}
}

/**
 * Give the floor to the first seat waiting on the list, through the SQL
 * function `call_next_speaker`, which does it in one transaction: the speech in
 * progress ends with its time, the next waiting entry by position (skipping a
 * seat marked absent at the latest roll call) starts, and the room points at
 * it with its clock ready at the list's speaking time and paused, for the
 * chair to start. When nobody is waiting, the speaker and the timer are
 * cleared and the answer is `empty`, so the page can say so.
 *
 * `committeeState` is the room the chair's screen was drawn from: the function
 * only moves the floor on when the speaker it names is still the one speaking,
 * so two presses at once never skip a speaker. `list` is no longer read, since
 * the function reads the list itself; it stays a parameter so that the pages
 * calling this did not have to change.
 */
export async function moveToNextSpeaker(
	supabase: SupabaseClient,
	committeeId: string,
	committeeState: CommitteeStateView,
	list: SpeakersListInRoom,
	now: Date
): Promise<NextSpeakerOutcome> {
	const { data, error } = await supabase.rpc('call_next_speaker', {
		committee_id: committeeId,
		speaking_entry_id: committeeState.currentSpeakerEntryId,
		pressed_at: now.toISOString()
	});

	if (error) {
		throw new Error(`Could not give the floor to the next speaker: ${error.message}`);
	}

	const outcome: NextSpeakerOutcome = data;

	return outcome;
}

/**
 * The speaker gives the rest of their time back to the chair: the floor is
 * empty again. `alsoWrites` are more columns for the same update: in a
 * moderated caucus, the caucus clock, paused (`$lib/caucus-floor.ts`, S7).
 */
export async function yieldToChair(
	supabase: SupabaseClient,
	committeeId: string,
	committeeState: CommitteeStateView,
	list: SpeakersListInRoom,
	now: Date,
	alsoWrites: CommitteeStateChanges = {}
): Promise<void> {
	await finishCurrentSpeech(supabase, committeeState, list.speakersList.speakingTimeSeconds, now);

	await updateCommitteeState(supabase, committeeId, {
		current_speaker_entry_id: null,
		...timerColumns(CLEARED_TIMER),
		...alsoWrites
	});
}

/**
 * The speaker gives the rest of their time to another seat. That seat gets a
 * new entry at the top of the list, already speaking, and the timer runs on
 * for the seconds that were left. The length the timer is shown against stays
 * the list's speaking time. `entryId` is the id the chair's browser chose for
 * the new entry (`$lib/new-row-id.ts`); with null the database chooses one.
 */
export async function yieldToSeat(
	supabase: SupabaseClient,
	committeeId: string,
	committeeState: CommitteeStateView,
	list: SpeakersListInRoom,
	seatId: string,
	now: Date,
	entryId: string | null = null
): Promise<void> {
	// Read before the speech is finished, because finishing it does not stop the clock.
	const secondsLeft = remainingSeconds(committeeState.timer, now) ?? 0;

	await finishCurrentSpeech(supabase, committeeState, list.speakersList.speakingTimeSeconds, now);

	const { data, error } = await supabase
		.from('speakers_list_entries')
		.insert({
			// The id the chair's browser chose (`$lib/new-row-id.ts`), or the database's own.
			...(entryId === null ? {} : { id: entryId }),
			speakers_list_id: list.speakersList.id,
			seat_id: seatId,
			position: 0,
			status: 'speaking',
			started_at: now.toISOString()
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not give the floor to that seat: ${error?.message}`);
	}

	const runsOn = startedTimer(secondsLeft, now);

	await updateCommitteeState(supabase, committeeId, {
		current_speaker_entry_id: data.id,
		...timerColumns({ ...runsOn, totalSeconds: list.speakersList.speakingTimeSeconds })
	});
}
