/**
 * The vote the room is on as the people watching it see it, on the projector
 * (`specs/05-pages/chair/display.md`) and on a delegate's phone
 * (`05-pages/delegate/committee-live.md`): the counts, the title or result,
 * the line about how it is counted, and the reader's own roll call answer.
 *
 * Plain functions with no Svelte in them, so they can be read and tested on
 * their own.
 */

import type { AttendanceStatus, MajorityType, VoteCounts } from '$lib/committee-room';
import { closedVoteCounts, countEntries, type OpenVote, type VoteChoice } from '$lib/votes';
import { resultTitle } from '$lib/vote-view';

/** The majority as a watcher reads it: "simple majority" or "two-thirds majority". */
export function majorityWords(majority: MajorityType): string {
	return majority === 'two_thirds' ? 'two-thirds majority' : 'simple majority';
}

/**
 * The counts a watcher sees: a closed vote's saved result, an open roll call
 * vote's answers so far, and an open show of hands as the chair saves its count.
 */
export function watchedVoteCounts(vote: OpenVote): VoteCounts {
	if (vote.status === 'open' && vote.method === 'roll_call') return countEntries(vote.entries);

	return closedVoteCounts(vote);
}

/** The vote's subject while it is open, and "Draft Resolution 1.1 passes" once closed. */
export function watchedVoteTitle(vote: OpenVote): string {
	return vote.status === 'closed' ? resultTitle(vote) : vote.subject;
}

/**
 * The projector's mode line over the vote: how it is counted and the
 * majority while open, "Voting by show of hands · simple majority"; the
 * subject and the majority once closed, since the result names the outcome.
 */
export function displayVoteLine(vote: OpenVote): string {
	const majority = majorityWords(vote.majority);

	if (vote.status === 'closed') return `${vote.subject} · ${majority}`;

	const method = vote.method === 'roll_call' ? 'Roll call vote' : 'Voting by show of hands';

	return `${method} · ${majority}`;
}

/**
 * The phone's line under the vote's subject: "Simple majority · voting by
 * show of hands" or "Roll call vote · two-thirds majority", and none once the
 * vote is closed and its result is the title.
 */
export function phoneVoteLine(vote: OpenVote): string | null {
	if (vote.status === 'closed') return null;

	const majority = majorityWords(vote.majority);

	if (vote.method === 'roll_call') return `Roll call vote · ${majority}`;

	const capitalised = majority.charAt(0).toUpperCase() + majority.slice(1);

	return `${capitalised} · voting by show of hands`;
}

/** Whether the phone shows the counts: always once closed, and while a roll call vote is open. */
export function showsWatchedCounts(vote: OpenVote): boolean {
	return vote.status === 'closed' || vote.method === 'roll_call';
}

/** How a seat's roll call answer reads to the delegate who holds it. */
const ANSWER_WORDS: Record<VoteChoice, string> = {
	for: 'You voted yes',
	against: 'You voted no',
	abstain: 'You abstained'
};

/**
 * The reader's own line in an open roll call vote: their answer once the
 * chair has recorded it, or "Your seat has not been called yet". Null for a
 * show of hands, a closed vote, staff watching (no seat) and a seat marked
 * absent, who see the counts without it.
 */
export function readerAnswerText(
	vote: OpenVote,
	mySeatId: string | null,
	attendance: Record<string, AttendanceStatus>
): string | null {
	if (vote.status !== 'open' || vote.method !== 'roll_call') return null;
	if (mySeatId === null || attendance[mySeatId] === 'absent') return null;

	const answer = vote.entries[mySeatId];

	return answer === undefined ? 'Your seat has not been called yet' : ANSWER_WORDS[answer];
}
