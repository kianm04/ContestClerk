/**
 * Reading and writing a session's votes for the chair's Vote view.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the reader's own Supabase client, so Row Level Security decides what they may
 * read and write: a chair of the committee, or an organiser of its conference.
 * Opening, closing and cancelling a vote also change the room's one
 * `committee_state` row, which realtime sends to every screen in the room.
 *
 * The shapes and the form rules are in `$lib/votes.ts`, so this file only
 * fetches and writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { VoteStatus } from '$lib/chair-room';
import { CLEARED_TIMER, type MajorityType, type VoteCounts } from '$lib/committee-room';
import type {
	OpenVote,
	SessionVote,
	SessionVotes,
	VoteChoice,
	VoteInput,
	VoteKind,
	VoteMethod
} from '$lib/votes';
import {
	CLEARED_CAUCUS_CLOCK,
	CLEARED_SUSPENSION,
	finishSpeechInProgress,
	readCommitteeState,
	readGeneralSpeakersListId,
	timerColumns,
	updateCommitteeState
} from '$lib/server/committee-room';

/** The code `check_vote_paper` refuses a vote's paper with, in a sentence the chair can read. */
const PAPER_REFUSAL_CODE = '22023';

/** The vote columns the page draws. */
const VOTE_COLUMNS =
	'id, subject, kind, method, majority, status, votes_for, votes_against, votes_abstain, passed, opened_at, closed_at';

/** One vote as the database returns it. */
type VoteRow = {
	id: string;
	subject: string | null;
	kind: VoteKind;
	method: VoteMethod;
	majority: MajorityType;
	status: VoteStatus;
	votes_for: number | null;
	votes_against: number | null;
	votes_abstain: number | null;
	passed: boolean | null;
	opened_at: string;
	closed_at: string | null;
};

/** A vote row, in the shape the page draws. */
function toSessionVote(row: VoteRow): SessionVote {
	return {
		id: row.id,
		// A substantive vote always has a subject in MVP; the database allows
		// none only for the procedural votes that point at a motion instead.
		subject: row.subject ?? '',
		kind: row.kind,
		method: row.method,
		majority: row.majority,
		status: row.status,
		votesFor: row.votes_for,
		votesAgainst: row.votes_against,
		votesAbstain: row.votes_abstain,
		passed: row.passed,
		openedAt: row.opened_at,
		closedAt: row.closed_at
	};
}

/** Each seat's answer in one roll call vote, keyed by seat id. */
async function readVoteEntries(
	supabase: SupabaseClient,
	voteId: string
): Promise<Record<string, VoteChoice>> {
	const { data, error } = await supabase
		.from('vote_entries')
		.select('seat_id, choice')
		.eq('vote_id', voteId)
		.overrideTypes<{ seat_id: string; choice: VoteChoice }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the vote's answers: ${error.message}`);
	}

	const entries: Record<string, VoteChoice> = {};

	for (const row of data ?? []) {
		entries[row.seat_id] = row.choice;
	}

	return entries;
}

/**
 * A session's votes: the one `currentVoteId` points at, open or closed, with
 * its roll call answers, and every closed one, newest first. After "Close
 * vote" the room's vote stays current, with its result, until "End voting"
 * (S10), so the current vote may be in the closed list too.
 */
export async function getVotes(
	supabase: SupabaseClient,
	sessionId: string,
	currentVoteId: string | null
): Promise<SessionVotes> {
	const { data, error } = await supabase
		.from('votes')
		.select(VOTE_COLUMNS)
		.eq('session_id', sessionId)
		.order('opened_at', { ascending: false })
		.overrideTypes<VoteRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the session's votes: ${error.message}`);
	}

	const votes = (data ?? []).map(toSessionVote);
	const closedVotes = votes.filter((vote) => vote.status === 'closed');
	const current = votes.find((vote) => vote.id === currentVoteId);

	if (!current) return { currentVote: null, closedVotes };

	const entries = await readVoteEntries(supabase, current.id);

	return { currentVote: { ...current, entries }, closedVotes };
}

/**
 * The vote `voteId` names, open or closed, with its roll call answers, or
 * null when there is none (`voteId` null, or the vote cancelled meanwhile).
 * The Vote view's actions read the room's current vote with it.
 */
export async function getCurrentVote(
	supabase: SupabaseClient,
	voteId: string | null
): Promise<OpenVote | null> {
	if (voteId === null) return null;

	const { data, error } = await supabase
		.from('votes')
		.select(VOTE_COLUMNS)
		.eq('id', voteId)
		.maybeSingle()
		.overrideTypes<VoteRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the current vote: ${error.message}`);
	}

	if (!data) return null;

	const entries = await readVoteEntries(supabase, data.id);

	return { ...toSessionVote(data), entries };
}

/**
 * Open a vote and put the room into voting: the vote becomes the
 * current one, both clocks are cleared, and whatever caucus or speech was
 * running ends, so the mode banner names nothing else during the vote. The
 * speech in progress is recorded as `spoken` with its time, as "End speech"
 * records it. The room is put back on the General Speakers' List, which is
 * where formal debate carries on once the vote is closed. `voteId` is the id the browser chose for the vote
 * (T141), so the row this saves is the same row the Voting page already
 * shows; null lets the database choose one, as when the request carries no
 * JavaScript.
 *
 * A vote picked from the form's list carries its paper (`votes.paper_id`),
 * or its approved amendment (`votes.amendment_id`). The database checks it
 * (`check_vote_paper`): the paper must be this committee's, introduced, and
 * not already being voted on, and an amendment one the dais approved, an
 * amendment to it voted on first. Its sentence is
 * answered, for the chair to read, and the room is left alone; null means
 * the vote is open.
 */
export async function openVote(
	supabase: SupabaseClient,
	committeeId: string,
	sessionId: string,
	input: VoteInput,
	now: Date,
	voteId: string | null = null
): Promise<string | null> {
	const { data, error } = await supabase
		.from('votes')
		.insert({
			...(voteId === null ? {} : { id: voteId }),
			...(input.paperId === undefined ? {} : { paper_id: input.paperId }),
			...(input.amendmentId === undefined ? {} : { amendment_id: input.amendmentId }),
			committee_id: committeeId,
			session_id: sessionId,
			kind: input.kind,
			subject: input.subject,
			method: input.method,
			majority: input.majority,
			status: 'open',
			opened_at: now.toISOString()
		})
		.select('id')
		.single();

	if (error?.code === PAPER_REFUSAL_CODE) return error.message;
	if (error || !data) {
		throw new Error(`Could not open the vote: ${error?.message}`);
	}

	const committeeState = await readCommitteeState(supabase, committeeId);
	await finishSpeechInProgress(supabase, committeeState, now);

	const generalListId = await readGeneralSpeakersListId(supabase, sessionId);

	await updateCommitteeState(supabase, committeeId, {
		mode: 'voting',
		current_vote_id: data.id,
		current_motion_id: null,
		active_speakers_list_id: generalListId,
		current_speaker_entry_id: null,
		...timerColumns(CLEARED_TIMER),
		...CLEARED_CAUCUS_CLOCK,
		...CLEARED_SUSPENSION
	});

	return null;
}

/** Write down one seat's answer in a roll call vote, replacing any answer it gave before. */
export async function recordRollCallChoice(
	supabase: SupabaseClient,
	voteId: string,
	seatId: string,
	choice: VoteChoice
): Promise<void> {
	const { error } = await supabase
		.from('vote_entries')
		.upsert({ vote_id: voteId, seat_id: seatId, choice }, { onConflict: 'vote_id,seat_id' });

	if (error) {
		throw new Error(`Could not record the seat's vote: ${error.message}`);
	}
}

/** Take a seat's answer off a roll call vote again, for when the chair tapped the wrong one. */
export async function clearRollCallChoice(
	supabase: SupabaseClient,
	voteId: string,
	seatId: string
): Promise<void> {
	const { error } = await supabase
		.from('vote_entries')
		.delete()
		.eq('vote_id', voteId)
		.eq('seat_id', seatId);

	if (error) {
		throw new Error(`Could not clear the seat's vote: ${error.message}`);
	}
}

/**
 * Save a show of hands' counts as the chair counts them ("−", "+" and typed
 * numbers), so the projector can draw the tally as it grows (S10, S12). Only
 * a vote still open and counted by hands is written. Answers whether it was.
 */
export async function saveHandCount(
	supabase: SupabaseClient,
	voteId: string,
	counts: VoteCounts
): Promise<boolean> {
	const { data, error } = await supabase
		.from('votes')
		.update({
			votes_for: counts.for,
			votes_against: counts.against,
			votes_abstain: counts.abstain
		})
		.eq('id', voteId)
		.eq('status', 'open')
		.eq('method', 'show_of_hands')
		.select('id');

	if (error) {
		throw new Error(`Could not save the count: ${error.message}`);
	}

	return (data ?? []).length > 0;
}

/**
 * "End voting": the room goes back to formal debate on the General Speakers'
 * List, whose waiting speakers are where they were, with no vote current. A
 * room that was suspended meanwhile is not suspended any more; the database
 * keeps the suspension to a suspended room, so it is cleared too. Cancelling
 * a vote ends voting the same way.
 */
export async function endVoting(supabase: SupabaseClient, committeeId: string): Promise<void> {
	await updateCommitteeState(supabase, committeeId, {
		mode: 'formal_debate',
		current_vote_id: null,
		...CLEARED_SUSPENSION
	});
}

/**
 * Close a vote with its counts and result. The room stays in voting with the
 * vote as its current one, so every screen shows the result until "End
 * voting" (S10). Only a vote still open is closed, so two chairs closing the
 * same vote at once cannot both succeed. Answers whether this call closed it.
 */
export async function closeVote(
	supabase: SupabaseClient,
	voteId: string,
	counts: VoteCounts,
	hasPassed: boolean,
	now: Date
): Promise<boolean> {
	const { data, error } = await supabase
		.from('votes')
		.update({
			votes_for: counts.for,
			votes_against: counts.against,
			votes_abstain: counts.abstain,
			passed: hasPassed,
			status: 'closed',
			closed_at: now.toISOString()
		})
		.eq('id', voteId)
		.eq('status', 'open')
		.select('id');

	if (error) {
		throw new Error(`Could not close the vote: ${error.message}`);
	}

	return (data ?? []).length > 0;
}

/**
 * Cancel an open vote: delete it with its roll call answers, so nothing is
 * recorded, and return the room to formal debate. Answers whether this call
 * removed it.
 */
export async function cancelVote(
	supabase: SupabaseClient,
	committeeId: string,
	voteId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('votes')
		.delete()
		.eq('id', voteId)
		.eq('status', 'open')
		.select('id');

	if (error) {
		throw new Error(`Could not cancel the vote: ${error.message}`);
	}

	if ((data ?? []).length === 0) return false;

	await endVoting(supabase, committeeId);

	return true;
}

/**
 * Cancel every vote of a session that is still open, deleting each with its
 * roll call answers, the way "Cancel vote" does. Ending a session calls it,
 * because a vote nobody finished must not stay open in a session that has
 * closed: nothing was decided in it.
 */
export async function cancelOpenVotes(supabase: SupabaseClient, sessionId: string): Promise<void> {
	const { error } = await supabase
		.from('votes')
		.delete()
		.eq('session_id', sessionId)
		.eq('status', 'open');

	if (error) {
		throw new Error(`Could not cancel the open vote: ${error.message}`);
	}
}
