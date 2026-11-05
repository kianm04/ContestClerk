import { describe, expect, it } from 'vitest';
import { CLEARED_CAUCUS_CLOCK } from '$lib/caucus-clock';
import type { ChairPress } from '$lib/chair-form';
import { CLEARED_TIMER } from '$lib/committee-room';
import type { OpenVote, SessionVote, VoteInput } from '$lib/votes';
import {
	cancelVotePress,
	closeVotePress,
	countVotePress,
	endVotingPress,
	openVotePress,
	votesAfterPresses,
	type ShownVotes
} from './vote-presses';

const PRESSED = new Date('2026-09-26T10:00:00.000Z');

/** One press of the chair form, with the expectation `expected`. Only `expected` is read by the code under test. */
function pressOf(expected: ChairPress['expected']): ChairPress {
	return {
		id: 1,
		formData: new FormData(),
		action: new URL('https://x/voting?/closeVote'),
		expected
	};
}

/** A vote as the set-up opens it. */
function inputOf(method: VoteInput['method']): VoteInput {
	return { subject: 'Draft Resolution 1.1', kind: 'substantive', majority: 'simple', method };
}

/** The room's open vote, counted by hands. */
const OPEN: OpenVote = {
	id: 'vote-1',
	subject: 'Draft Resolution 1.1',
	kind: 'substantive',
	method: 'show_of_hands',
	majority: 'simple',
	status: 'open',
	votesFor: null,
	votesAgainst: null,
	votesAbstain: null,
	passed: null,
	openedAt: '2026-09-26T09:00:00.000Z',
	closedAt: null,
	entries: {}
};

const NONE: ShownVotes = { currentVote: null, closedVotes: [] };

describe('openVotePress', () => {
	it('adds the vote open, under the id the browser chose, and puts the room into voting', () => {
		expect(openVotePress(inputOf('roll_call'), 'vote-new', PRESSED)).toEqual({
			state: {
				mode: 'voting',
				currentVoteId: 'vote-new',
				currentMotionId: null,
				currentSpeakerEntryId: null,
				timer: CLEARED_TIMER,
				caucusClock: CLEARED_CAUCUS_CLOCK
			},
			votes: [
				{
					id: 'vote-new',
					added: {
						id: 'vote-new',
						subject: 'Draft Resolution 1.1',
						kind: 'substantive',
						method: 'roll_call',
						majority: 'simple',
						status: 'open',
						votesFor: null,
						votesAgainst: null,
						votesAbstain: null,
						passed: null,
						openedAt: PRESSED.toISOString(),
						closedAt: null
					}
				}
			]
		});
	});
});

describe('countVotePress', () => {
	it('saves the three counts as they stand, and changes nothing else', () => {
		expect(countVotePress('vote-1', { for: 4, against: 1, abstain: 1 })).toEqual({
			votes: [{ id: 'vote-1', changes: { votesFor: 4, votesAgainst: 1, votesAbstain: 1 } }]
		});
	});
});

describe('closeVotePress', () => {
	it('marks the vote closed with its tally and result, and leaves the room in voting', () => {
		const expected = closeVotePress('vote-1', { for: 10, against: 2, abstain: 1 }, true, PRESSED);

		expect(expected).toEqual({
			votes: [
				{
					id: 'vote-1',
					changes: {
						status: 'closed',
						votesFor: 10,
						votesAgainst: 2,
						votesAbstain: 1,
						passed: true,
						closedAt: PRESSED.toISOString()
					}
				}
			]
		});
		expect(expected.state).toBeUndefined();
	});
});

describe('cancelVotePress and endVotingPress', () => {
	it('takes the vote away and returns the room to formal debate', () => {
		expect(cancelVotePress('vote-1')).toEqual({
			state: { mode: 'formal_debate', currentVoteId: null },
			votes: [{ id: 'vote-1', isDeleted: true }]
		});
	});

	it('returns the room to formal debate, leaving the closed vote recorded', () => {
		expect(endVotingPress()).toEqual({ state: { mode: 'formal_debate', currentVoteId: null } });
	});
});

describe('votesAfterPresses', () => {
	it('shows an opened vote as the current one, with no roll call answers yet', () => {
		const presses = [pressOf(openVotePress(inputOf('show_of_hands'), 'vote-new', PRESSED))];

		const shown = votesAfterPresses(NONE, presses);

		expect(shown.currentVote?.id).toBe('vote-new');
		expect(shown.currentVote?.entries).toEqual({});
		expect(shown.closedVotes).toEqual([]);
	});

	it('lays a count on the current vote', () => {
		const presses = [pressOf(countVotePress('vote-1', { for: 4, against: 1, abstain: 0 }))];

		const shown = votesAfterPresses({ currentVote: OPEN, closedVotes: [] }, presses);

		expect(shown.currentVote).toMatchObject({ votesFor: 4, votesAgainst: 1, votesAbstain: 0 });
	});

	it('keeps a closed vote current, with its result, and adds it to the history', () => {
		const presses = [
			pressOf(closeVotePress('vote-1', { for: 10, against: 2, abstain: 1 }, true, PRESSED))
		];

		const shown = votesAfterPresses({ currentVote: OPEN, closedVotes: [] }, presses);

		expect(shown.currentVote).toMatchObject({ id: 'vote-1', status: 'closed', passed: true });
		expect(shown.closedVotes).toEqual([
			{
				id: 'vote-1',
				subject: 'Draft Resolution 1.1',
				kind: 'substantive',
				method: 'show_of_hands',
				majority: 'simple',
				status: 'closed',
				votesFor: 10,
				votesAgainst: 2,
				votesAbstain: 1,
				passed: true,
				openedAt: '2026-09-26T09:00:00.000Z',
				closedAt: PRESSED.toISOString()
			}
		]);
	});

	it('takes the current vote away, adding nothing to the history, when it is cancelled', () => {
		const presses = [pressOf(cancelVotePress('vote-1'))];

		const shown = votesAfterPresses({ currentVote: OPEN, closedVotes: [] }, presses);

		expect(shown).toEqual(NONE);
	});

	it('replaces a closed vote on show with the next one opened', () => {
		const closed: OpenVote = { ...OPEN, status: 'closed', passed: true };
		const presses = [pressOf(openVotePress(inputOf('roll_call'), 'vote-2', PRESSED))];

		const shown = votesAfterPresses({ currentVote: closed, closedVotes: [closed] }, presses);

		expect(shown.currentVote?.id).toBe('vote-2');
		expect(shown.closedVotes.map((vote) => vote.id)).toEqual(['vote-1']);
	});

	it('shows a vote once when the loaded data already holds it closed', () => {
		const closedVote: SessionVote = { ...OPEN, status: 'closed', votesFor: 1, votesAgainst: 1 };
		const presses = [
			pressOf(openVotePress(inputOf('show_of_hands'), 'vote-1', PRESSED)),
			pressOf(closeVotePress('vote-1', { for: 1, against: 1, abstain: 0 }, false, PRESSED))
		];

		const shown = votesAfterPresses({ currentVote: null, closedVotes: [closedVote] }, presses);

		expect(shown.currentVote).toBeNull();
		expect(shown.closedVotes.map((vote) => vote.id)).toEqual(['vote-1']);
	});

	it('keeps the roll call answers of an opened vote the loaded data already holds', () => {
		const answered: OpenVote = { ...OPEN, method: 'roll_call', entries: { 'seat-1': 'for' } };
		const presses = [pressOf(openVotePress(inputOf('roll_call'), 'vote-1', PRESSED))];

		const shown = votesAfterPresses({ currentVote: answered, closedVotes: [] }, presses);

		expect(shown.currentVote?.entries).toEqual({ 'seat-1': 'for' });
	});

	it('leaves another vote alone', () => {
		const otherVote: OpenVote = { ...OPEN, id: 'vote-2' };
		const presses = [
			pressOf(closeVotePress('vote-1', { for: 1, against: 0, abstain: 0 }, true, PRESSED))
		];

		const shown = votesAfterPresses({ currentVote: otherVote, closedVotes: [] }, presses);

		expect(shown.currentVote?.id).toBe('vote-2');
		expect(shown.closedVotes).toEqual([]);
	});
});
