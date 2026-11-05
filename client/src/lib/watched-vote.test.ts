import { describe, expect, it } from 'vitest';
import type { OpenVote } from './votes';
import {
	displayVoteLine,
	majorityWords,
	phoneVoteLine,
	readerAnswerText,
	showsWatchedCounts,
	watchedVoteCounts,
	watchedVoteTitle
} from './watched-vote';

// The vote of "What the display shows" (`05-pages/chair/display.md`) and
// "What delegates see" (`05-pages/delegate/committee-live.md`): open by show
// of hands, open by roll call, and closed.

const OPEN_HANDS: OpenVote = {
	id: 'vote-1',
	subject: 'Draft Resolution 1.1',
	kind: 'substantive',
	method: 'show_of_hands',
	majority: 'simple',
	status: 'open',
	votesFor: 4,
	votesAgainst: 1,
	votesAbstain: null,
	passed: null,
	openedAt: '2020-05-06T11:00:00Z',
	closedAt: null,
	entries: {}
};

const OPEN_ROLL_CALL: OpenVote = {
	...OPEN_HANDS,
	method: 'roll_call',
	majority: 'two_thirds',
	votesFor: null,
	votesAgainst: null,
	entries: { 'seat-cn': 'for', 'seat-gb': 'for', 'seat-ke': 'against' }
};

const CLOSED: OpenVote = {
	...OPEN_HANDS,
	status: 'closed',
	votesFor: 4,
	votesAgainst: 1,
	votesAbstain: 1,
	passed: true,
	closedAt: '2020-05-06T11:10:00Z'
};

describe('the vote, as watchers see it', () => {
	it('counts a show of hands as the chair saves it, a roll call from its answers, and a result as saved', () => {
		expect(watchedVoteCounts(OPEN_HANDS)).toEqual({ for: 4, against: 1, abstain: 0 });
		expect(watchedVoteCounts(OPEN_ROLL_CALL)).toEqual({ for: 2, against: 1, abstain: 0 });
		expect(watchedVoteCounts(CLOSED)).toEqual({ for: 4, against: 1, abstain: 1 });
	});

	it('titles an open vote by its subject and a closed one by its result', () => {
		expect(watchedVoteTitle(OPEN_HANDS)).toBe('Draft Resolution 1.1');
		expect(watchedVoteTitle(CLOSED)).toBe('Draft Resolution 1.1 passes');
		expect(watchedVoteTitle({ ...CLOSED, passed: false })).toBe('Draft Resolution 1.1 fails');
	});

	it('gives the projector the method and majority, then the subject and majority once closed', () => {
		expect(displayVoteLine(OPEN_HANDS)).toBe('Voting by show of hands · simple majority');
		expect(displayVoteLine(OPEN_ROLL_CALL)).toBe('Roll call vote · two-thirds majority');
		expect(displayVoteLine(CLOSED)).toBe('Draft Resolution 1.1 · simple majority');
	});

	it('gives a phone the majority and method while open, and nothing once closed', () => {
		expect(phoneVoteLine(OPEN_HANDS)).toBe('Simple majority · voting by show of hands');
		expect(phoneVoteLine({ ...OPEN_HANDS, majority: 'two_thirds' })).toBe(
			'Two-thirds majority · voting by show of hands'
		);
		expect(phoneVoteLine(OPEN_ROLL_CALL)).toBe('Roll call vote · two-thirds majority');
		expect(phoneVoteLine(CLOSED)).toBeNull();
	});

	it('shows a phone no counts for an open show of hands', () => {
		expect(showsWatchedCounts(OPEN_HANDS)).toBe(false);
		expect(showsWatchedCounts(OPEN_ROLL_CALL)).toBe(true);
		expect(showsWatchedCounts(CLOSED)).toBe(true);
	});

	it('tells a present delegate their own roll call answer, or that they have not been called', () => {
		expect(readerAnswerText(OPEN_ROLL_CALL, 'seat-cn', {})).toBe('You voted yes');
		expect(readerAnswerText(OPEN_ROLL_CALL, 'seat-ke', {})).toBe('You voted no');
		expect(
			readerAnswerText({ ...OPEN_ROLL_CALL, entries: { 'seat-jp': 'abstain' } }, 'seat-jp', {})
		).toBe('You abstained');
		expect(readerAnswerText(OPEN_ROLL_CALL, 'seat-jp', {})).toBe(
			'Your seat has not been called yet'
		);
	});

	it('says nothing to staff, to a seat marked absent, for a show of hands or once closed', () => {
		expect(readerAnswerText(OPEN_ROLL_CALL, null, {})).toBeNull();
		expect(readerAnswerText(OPEN_ROLL_CALL, 'seat-jp', { 'seat-jp': 'absent' })).toBeNull();
		expect(readerAnswerText(OPEN_HANDS, 'seat-cn', {})).toBeNull();
		expect(readerAnswerText({ ...OPEN_ROLL_CALL, status: 'closed' }, 'seat-cn', {})).toBeNull();
	});
});

describe('majorityWords', () => {
	it('names the majority the way a watcher reads it', () => {
		expect(majorityWords('simple')).toBe('simple majority');
		expect(majorityWords('two_thirds')).toBe('two-thirds majority');
	});
});
