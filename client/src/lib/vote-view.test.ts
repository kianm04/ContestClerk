import { describe, expect, it } from 'vitest';
import type { RoomSeat } from '$lib/committee-room';
import type { SessionVote } from '$lib/votes';
import {
	attendanceLine,
	closeVoteLabel,
	closedVoteWord,
	countsInWords,
	draftCounts,
	handCountDraftOf,
	handCountWords,
	isSavableCount,
	majorityInWords,
	resultTitle,
	tallyBarGeometry,
	toCallText,
	voteAttendance,
	voteHistoryLine,
	voteMeta,
	voteScreen
} from './vote-view';

/** A closed vote, changed by `overrides`. */
function closedVote(overrides: Partial<SessionVote> = {}): SessionVote {
	return {
		id: 'vote-1',
		subject: 'Draft Resolution 1.1',
		kind: 'substantive',
		method: 'show_of_hands',
		majority: 'simple',
		status: 'closed',
		votesFor: 5,
		votesAgainst: 8,
		votesAbstain: 1,
		passed: false,
		openedAt: '2026-01-01T10:00:00.000Z',
		closedAt: '2026-01-01T10:02:00.000Z',
		...overrides
	};
}

const BRAZIL: RoomSeat = { id: 'seat-br', name: 'Brazil', countryCode: 'BR' };
const CHINA: RoomSeat = { id: 'seat-cn', name: 'China', countryCode: 'CN' };
const FRANCE: RoomSeat = { id: 'seat-fr', name: 'France', countryCode: 'FR' };
const GHANA: RoomSeat = { id: 'seat-gh', name: 'Ghana', countryCode: 'GH' };

describe('voteScreen', () => {
	const open = { status: 'open', method: 'show_of_hands' } as const;
	const closed = { status: 'closed', method: 'show_of_hands' } as const;

	it('counts hands or calls the roll while a vote is open', () => {
		const facts = { isRoomVoting: true, isNewVoteShown: false };

		expect(voteScreen({ ...facts, currentVote: open })).toBe('handCount');
		expect(voteScreen({ ...facts, currentVote: { ...open, method: 'roll_call' } })).toBe(
			'rollCall'
		);
	});

	it('shows a closed vote’s result while the room votes, until another is asked for', () => {
		expect(voteScreen({ currentVote: closed, isRoomVoting: true, isNewVoteShown: false })).toBe(
			'result'
		);
		expect(voteScreen({ currentVote: closed, isRoomVoting: true, isNewVoteShown: true })).toBe(
			'setup'
		);
		expect(voteScreen({ currentVote: closed, isRoomVoting: false, isNewVoteShown: false })).toBe(
			'setup'
		);
	});

	it('sets a vote up when the room has none', () => {
		expect(voteScreen({ currentVote: null, isRoomVoting: true, isNewVoteShown: false })).toBe(
			'setup'
		);
		expect(voteScreen({ currentVote: null, isRoomVoting: false, isNewVoteShown: false })).toBe(
			'setup'
		);
	});
});

describe('voteAttendance', () => {
	const attendance = {
		'seat-fr': 'present',
		'seat-br': 'present_and_voting',
		'seat-gh': 'absent'
	} as const;

	it('lists the seats marked present in alphabetical order, leaving out absent and unmarked ones', () => {
		const room = voteAttendance([FRANCE, GHANA, BRAZIL, CHINA], attendance);

		expect(room.votingSeats.map((seat) => seat.name)).toEqual(['Brazil', 'France']);
		expect(room.presentCount).toBe(2);
		expect(room.presentAndVotingSeatIds).toEqual(['seat-br']);
		expect(room.seatCount).toBe(4);
		expect(room.quorum).toEqual({ needed: 2, hasQuorum: true });
	});
});

describe('attendanceLine', () => {
	it('says who is present, and how many of them are present and voting', () => {
		const room = voteAttendance([BRAZIL, FRANCE], {
			'seat-br': 'present_and_voting',
			'seat-fr': 'present'
		});

		expect(attendanceLine(room)).toEqual({
			text: '2 present, 1 of them present and voting',
			isBelowQuorum: false
		});
	});

	it('leaves "present and voting" out when nobody is', () => {
		const room = voteAttendance([BRAZIL], { 'seat-br': 'present' });

		expect(attendanceLine(room).text).toBe('1 present');
	});

	it('warns below quorum, naming how many of the seats are present', () => {
		const seats = [BRAZIL, CHINA, FRANCE, GHANA, { ...GHANA, id: 'seat-x' }];
		const room = voteAttendance(seats, { 'seat-br': 'present', 'seat-cn': 'present' });

		expect(attendanceLine(room)).toEqual({
			text: 'No quorum: 2 of 5 present',
			isBelowQuorum: true
		});
	});
});

describe('the words of a vote', () => {
	it('puts the majority into words', () => {
		expect(majorityInWords('simple')).toBe('simple majority: more for than against');
		expect(majorityInWords('two_thirds')).toBe(
			'two-thirds majority: two thirds of those voting for or against'
		);
	});

	it('writes the heading’s quieter half, with "roll call" first for a roll call vote', () => {
		expect(voteMeta(closedVote())).toBe('substantive · simple majority');
		expect(voteMeta(closedVote({ method: 'roll_call', majority: 'two_thirds' }))).toBe(
			'roll call · substantive · two-thirds majority'
		);
	});

	it('says the result and the counts in words', () => {
		expect(resultTitle(closedVote({ passed: true }))).toBe('Draft Resolution 1.1 passes');
		expect(resultTitle(closedVote())).toBe('Draft Resolution 1.1 fails');
		expect(countsInWords({ for: 9, against: 4, abstain: 2 })).toBe(
			'9 for · 4 against · 2 abstentions'
		);
		expect(countsInWords({ for: 4, against: 1, abstain: 1 })).toBe(
			'4 for · 1 against · 1 abstention'
		);
	});

	it('writes the history’s word and line', () => {
		expect(closedVoteWord(closedVote())).toBe('Failed');
		expect(closedVoteWord(closedVote({ passed: true }))).toBe('Passed');
		expect(voteHistoryLine(closedVote(), 'Europe/Amsterdam')).toBe(
			'5–8–1 · simple majority · 11:02'
		);
	});

	it('counts the seats still to call', () => {
		expect(toCallText(3)).toBe('3 to call');
	});
});

describe('a show of hands as it is counted', () => {
	it('starts from the saved counts, nothing counted as 0', () => {
		expect(
			handCountDraftOf(closedVote({ votesFor: null, votesAgainst: 2, votesAbstain: null }))
		).toEqual({
			for: 0,
			against: 2,
			abstain: 0
		});
	});

	it('counts an emptied field as 0', () => {
		expect(draftCounts({ for: 4, against: null, abstain: 1 })).toEqual({
			for: 4,
			against: 0,
			abstain: 1
		});
	});

	it('saves a count only when every field holds a number and no more hands than present', () => {
		expect(isSavableCount({ for: 4, against: 1, abstain: 1 }, 6)).toBe(true);
		expect(isSavableCount({ for: 4, against: 2, abstain: 1 }, 6)).toBe(false);
		expect(isSavableCount({ for: 4, against: null, abstain: 1 }, 6)).toBe(false);
	});

	it('says what to do before a count, and how the count comes out once counted', () => {
		expect(handCountWords({ for: 0, against: 0, abstain: 0 }, 'simple')).toBe(
			'Count the hands for, then against, then abstentions.'
		);
		expect(handCountWords({ for: 4, against: 1, abstain: 1 }, 'simple')).toBe(
			'As counted, it passes.'
		);
		expect(handCountWords({ for: 2, against: 2, abstain: 0 }, 'simple')).toBe(
			'As counted, it fails.'
		);
	});

	it('names "Close vote" by the result the count gives', () => {
		expect(closeVoteLabel({ for: 4, against: 1, abstain: 1 }, 'simple')).toBe('Close vote: passes');
		expect(closeVoteLabel({ for: 6, against: 4, abstain: 0 }, 'two_thirds')).toBe(
			'Close vote: fails'
		);
	});
});

describe('tallyBarGeometry', () => {
	it('draws For against Against and marks where the majority is met', () => {
		const geometry = tallyBarGeometry({ for: 9, against: 4, abstain: 2 }, 'simple');

		expect(geometry.needed).toBe(7);
		expect(geometry.forPercent).toBeCloseTo((9 / 13) * 100);
		expect(geometry.againstPercent).toBeCloseTo((4 / 13) * 100);
		expect(geometry.markPercent).toBeCloseTo((7 / 13) * 100);
		expect(geometry.markAlign).toBe('center');
	});

	it('marks a half, or two thirds, before anything is cast', () => {
		expect(tallyBarGeometry({ for: 0, against: 0, abstain: 3 }, 'simple').markPercent).toBe(50);
		expect(tallyBarGeometry({ for: 0, against: 0, abstain: 0 }, 'two_thirds').markPercent).toBe(
			66.7
		);
	});

	it('hangs the mark’s words inwards near either end', () => {
		expect(tallyBarGeometry({ for: 1, against: 0, abstain: 0 }, 'simple')).toMatchObject({
			markPercent: 100,
			markAlign: 'end'
		});
	});
});
