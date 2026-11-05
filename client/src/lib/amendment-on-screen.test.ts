import { describe, expect, it } from 'vitest';
import {
	amendmentHeadline,
	amendmentVoteLine,
	amendmentVoteTitle,
	proposedByLine,
	seatNameInSentence,
	votedLine,
	type AmendmentOnScreen
} from './amendment-on-screen';
import type { NumberedClause } from './paper-clauses';

const CLAUSE_2: NumberedClause = {
	id: 'o2',
	part: 'operative',
	level: 1,
	markdown: 'Requests a report;',
	marker: '2.',
	reference: '2'
};

const SUB_CLAUSE: NumberedClause = { ...CLAUSE_2, id: 'o1a', level: 2, reference: '1(a)' };

/** Amendment 2 to Draft resolution 1.1, striking clause 2, as the projector shows it. */
const ON_SCREEN: AmendmentOnScreen = {
	sequence: 2,
	paperName: 'Draft resolution 1.1',
	headline: 'Strike clause 2',
	proposedLine: 'Proposed by the United States · Unfriendly',
	page: {
		shows: 'amendment',
		reference: '2',
		struckHtml: '<p>Requests a report;</p>',
		newHtml: null
	}
};

describe('amendmentHeadline', () => {
	it('puts a strike, a change and an addition in a chair’s words', () => {
		const operative = { targetPart: 'operative' as const };
		const noParent = { parent: null };

		expect(
			amendmentHeadline({ ...operative, action: 'strike' }, { ...noParent, clause: CLAUSE_2 })
		).toBe('Strike clause 2');
		expect(
			amendmentHeadline({ ...operative, action: 'change' }, { ...noParent, clause: SUB_CLAUSE })
		).toBe('Change clause 1(a)');
		expect(
			amendmentHeadline({ ...operative, action: 'add' }, { ...noParent, clause: CLAUSE_2 })
		).toBe('Add a clause after clause 2');
		expect(amendmentHeadline({ ...operative, action: 'add' }, { ...noParent, clause: null })).toBe(
			'Add a clause before clause 1'
		);
	});

	it('names an amendment to an amendment by the amendment it changes', () => {
		expect(
			amendmentHeadline(
				{ targetPart: 'operative', action: 'change' },
				{ clause: CLAUSE_2, parent: { sequence: 2 } }
			)
		).toBe('Change amendment 2');
	});
});

describe('seatNameInSentence', () => {
	it('says "the" before the names that take it, and nothing before the rest', () => {
		expect(seatNameInSentence('United States')).toBe('the United States');
		expect(seatNameInSentence('Netherlands')).toBe('the Netherlands');
		expect(seatNameInSentence('Russian Federation')).toBe('the Russian Federation');
		expect(seatNameInSentence('Germany')).toBe('Germany');
		expect(seatNameInSentence('India')).toBe('India');
	});
});

describe('proposedByLine', () => {
	it('names the proposer and whether the sponsors took it as friendly', () => {
		expect(proposedByLine({ proposerName: 'United States', isFriendly: false })).toBe(
			'Proposed by the United States · Unfriendly'
		);
		expect(proposedByLine({ proposerName: null, isFriendly: false })).toBe(
			'Proposed by a seat since removed · Unfriendly'
		);
	});
});

describe('amendmentVoteLine', () => {
	it('says what the room is voting on, and then what it voted on', () => {
		expect(amendmentVoteLine(false, ON_SCREEN)).toBe(
			'Voting on amendment 2 · Draft resolution 1.1'
		);
		expect(amendmentVoteLine(true, ON_SCREEN)).toBe('Voted on amendment 2 · Draft resolution 1.1');
	});
});

describe('amendmentVoteTitle', () => {
	it('is what the amendment does while open, and the result once closed', () => {
		expect(amendmentVoteTitle({ isClosed: false, passed: null }, ON_SCREEN)).toBe(
			'Strike clause 2'
		);
		expect(amendmentVoteTitle({ isClosed: true, passed: false }, ON_SCREEN)).toBe(
			'Amendment 2 fails'
		);
		expect(amendmentVoteTitle({ isClosed: true, passed: true }, ON_SCREEN)).toBe(
			'Amendment 2 passes'
		);
	});
});

describe('votedLine', () => {
	it('counts who has voted against who is present', () => {
		expect(votedLine({ for: 12, against: 21, abstain: 5 }, 43)).toBe('38 of 43 have voted');
		expect(votedLine({ for: 1, against: 0, abstain: 0 }, 43)).toBe('1 of 43 has voted');
		expect(votedLine({ for: 1, against: 0, abstain: 0 }, null)).toBeNull();
	});
});
