/**
 * What each button of the Vote view is expected to change, worked out in the
 * browser at the moment of the press (T141). The buttons hand these to the
 * chair's shared instant form (`$lib/chair-form.ts`), and the view draws the
 * room's vote, and its history, with them laid on top until the server has
 * answered.
 *
 * Each function mirrors what `$lib/server/votes.ts` does to the same data:
 * `openVote`, `saveHandCount`, `closeVote`, `cancelVote` and `endVoting`.
 * Every change says what things will be, never "one more", so laying it over
 * data that already holds it changes nothing.
 *
 * A roll call vote's own answers (`?/castRollCall`, `?/clearRollCall`) carry
 * no expectation: `$lib/roll-call-vote-preview.ts` reads them straight from
 * the presses.
 */
import { expectationsOf, type ChairExpectation, type ChairPress } from '$lib/chair-form';
import { CLEARED_CAUCUS_CLOCK } from '$lib/caucus-clock';
import { CLEARED_TIMER, type VoteCounts } from '$lib/committee-room';
import type { OpenVote, SessionVote, VoteInput } from '$lib/votes';

/**
 * "Open vote": the vote appears open, under the id the browser chose, and the
 * room goes to voting with nobody speaking and both clocks cleared.
 */
export function openVotePress(
	input: VoteInput,
	newVoteId: string,
	pressed: Date
): ChairExpectation {
	const vote: SessionVote = {
		id: newVoteId,
		subject: input.subject,
		kind: input.kind,
		method: input.method,
		majority: input.majority,
		status: 'open',
		votesFor: null,
		votesAgainst: null,
		votesAbstain: null,
		passed: null,
		openedAt: pressed.toISOString(),
		closedAt: null
	};

	return {
		// The server also puts the room back on the General Speakers' List, whose
		// id this view does not have, so `activeSpeakersListId` is left out and
		// the list follows once the server has answered.
		state: {
			mode: 'voting',
			currentVoteId: newVoteId,
			currentMotionId: null,
			currentSpeakerEntryId: null,
			timer: CLEARED_TIMER,
			caucusClock: CLEARED_CAUCUS_CLOCK
		},
		votes: [{ id: newVoteId, added: vote }]
	};
}

/** A − or + press, or a typed count: the show of hands is saved as it stands. */
export function countVotePress(voteId: string, counts: VoteCounts): ChairExpectation {
	return {
		votes: [
			{
				id: voteId,
				changes: {
					votesFor: counts.for,
					votesAgainst: counts.against,
					votesAbstain: counts.abstain
				}
			}
		]
	};
}

/**
 * "Close vote": the vote is closed with its tally and result. The room stays
 * in voting with the vote on show, until "End voting" (S10).
 */
export function closeVotePress(
	voteId: string,
	counts: VoteCounts,
	hasPassed: boolean,
	pressed: Date
): ChairExpectation {
	return {
		votes: [
			{
				id: voteId,
				changes: {
					status: 'closed',
					votesFor: counts.for,
					votesAgainst: counts.against,
					votesAbstain: counts.abstain,
					passed: hasPassed,
					closedAt: pressed.toISOString()
				}
			}
		]
	};
}

/** "Cancel vote": the vote is taken away, nothing recorded, and the room goes back to formal debate. */
export function cancelVotePress(voteId: string): ChairExpectation {
	return {
		state: { mode: 'formal_debate', currentVoteId: null },
		votes: [{ id: voteId, isDeleted: true }]
	};
}

/** "End voting": the room goes back to formal debate on the General Speakers' List. */
export function endVotingPress(): ChairExpectation {
	return { state: { mode: 'formal_debate', currentVoteId: null } };
}

/** The room's current vote and the closed history the Vote view draws. */
export type ShownVotes = {
	currentVote: OpenVote | null;
	closedVotes: SessionVote[];
};

/** `vote` without its roll call answers, which a closed vote in the history does not carry. */
function withoutEntries(vote: OpenVote): SessionVote {
	return {
		id: vote.id,
		subject: vote.subject,
		kind: vote.kind,
		method: vote.method,
		majority: vote.majority,
		status: vote.status,
		votesFor: vote.votesFor,
		votesAgainst: vote.votesAgainst,
		votesAbstain: vote.votesAbstain,
		passed: vote.passed,
		openedAt: vote.openedAt,
		closedAt: vote.closedAt
	};
}

/** Whether `voteId` is already the current vote, or already in the history. */
function isVoteShown(voteId: string, shown: ShownVotes): boolean {
	if (shown.currentVote?.id === voteId) return true;

	return shown.closedVotes.some((vote) => vote.id === voteId);
}

/**
 * `shown` with every press's changes to the votes laid on top: an opened vote
 * becomes the current one, with no roll call answers yet; a count changes the
 * current vote's numbers; a closed vote stays current, closed, and joins the
 * history; a cancelled vote leaves and joins nothing. Whether the room still
 * shows the current vote is the room's `currentVoteId`, which "End voting"
 * clears.
 */
export function votesAfterPresses(shown: ShownVotes, presses: ChairPress[]): ShownVotes {
	let { currentVote, closedVotes } = shown;

	for (const expectation of expectationsOf(presses)) {
		for (const change of expectation.votes ?? []) {
			if (change.added) {
				// The loaded data may already hold the vote, with its answers, while
				// the press is still kept: opening it again would wipe them.
				if (!isVoteShown(change.id, { currentVote, closedVotes })) {
					currentVote = { ...change.added, entries: {} };
				}
				continue;
			}

			// A change or a cancellation only ever names the vote the room is on.
			if (currentVote === null || currentVote.id !== change.id) continue;

			if (change.isDeleted) {
				currentVote = null;
				continue;
			}

			currentVote = { ...currentVote, ...change.changes };

			if (currentVote.status === 'closed') {
				const otherClosedVotes = closedVotes.filter((vote) => vote.id !== change.id);
				closedVotes = [withoutEntries(currentVote), ...otherClosedVotes];
			}
		}
	}

	return { currentVote, closedVotes };
}
