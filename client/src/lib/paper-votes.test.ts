import { describe, expect, it } from 'vitest';
import {
	adoptedSentence,
	amendmentVoteSubjects,
	isVotedStatus,
	liveVoteWord,
	livePaperLine,
	printedLine,
	recordDay,
	recordFacts,
	recordName,
	voteSubjectChoices,
	voteSubjects,
	votedWord,
	type ApprovedAmendment,
	type PaperVote
} from './paper-votes';
import { OTHER_VOTE_SUBJECT } from './votes';

const DRAFT_ONE = { id: 'paper-1', name: 'Draft resolution 1.1', title: 'Human control' };
const DRAFT_TWO = { id: 'paper-2', name: 'Draft resolution 1.2', title: 'Export controls' };
const AMENDMENT = { id: 'amendment-1', name: 'Amendment 1', title: 'Strike clause 2' };

/** A vote closed at 16:40 in London on 16 March 2027, 31 to 6 with 7 abstentions. */
const PASSED_VOTE: PaperVote = {
	passed: true,
	counts: { for: 31, against: 6, abstain: 7 },
	closedAt: '2027-03-16T16:40:00Z'
};

describe('voteSubjects', () => {
	it('lists nothing while debate is open and no amendment waits', () => {
		expect(voteSubjects({ amendments: [], drafts: [DRAFT_ONE], isDebateClosed: false })).toEqual(
			[]
		);
	});

	it('lists the drafts in their order once debate is closed', () => {
		expect(
			voteSubjects({ amendments: [], drafts: [DRAFT_ONE, DRAFT_TWO], isDebateClosed: true })
		).toEqual([DRAFT_ONE, DRAFT_TWO]);
	});

	it('always lists the amendments, and before the drafts', () => {
		expect(
			voteSubjects({ amendments: [AMENDMENT], drafts: [DRAFT_ONE], isDebateClosed: false })
		).toEqual([AMENDMENT]);
		expect(
			voteSubjects({ amendments: [AMENDMENT], drafts: [DRAFT_ONE], isDebateClosed: true })
		).toEqual([AMENDMENT, DRAFT_ONE]);
	});
});

describe('amendmentVoteSubjects', () => {
	/** Approved amendments on two drafts, in no particular order, as the database answers. */
	const APPROVED: ApprovedAmendment[] = [
		{ id: 'a-2-3', paperId: 'paper-2', sequence: 3, parentId: null },
		{ id: 'a-1-4', paperId: 'paper-1', sequence: 4, parentId: null },
		{ id: 'a-1-5', paperId: 'paper-1', sequence: 5, parentId: 'a-1-2' },
		{ id: 'a-1-2', paperId: 'paper-1', sequence: 2, parentId: null }
	];

	it('lists them draft by draft and by number, an amendment to an amendment just before it', () => {
		const subjects = amendmentVoteSubjects([DRAFT_ONE, DRAFT_TWO], APPROVED);

		expect(subjects.map((subject) => subject.id)).toEqual(['a-1-5', 'a-1-2', 'a-1-4', 'a-2-3']);
	});

	it('names each as its vote is named, with its draft’s title, marked as an amendment', () => {
		expect(amendmentVoteSubjects([DRAFT_ONE], APPROVED)[1]).toEqual({
			id: 'a-1-2',
			name: 'Amendment 2 to Draft resolution 1.1',
			title: 'Human control',
			isAmendment: true
		});
	});

	it('leaves out an amendment to an amendment that is not approved, and drafts not on the list', () => {
		const orphan = { id: 'a-1-6', paperId: 'paper-1', sequence: 6, parentId: 'a-1-1' };
		const subjects = amendmentVoteSubjects([DRAFT_ONE], [...APPROVED, orphan]);

		expect(subjects.map((subject) => subject.id)).toEqual(['a-1-5', 'a-1-2', 'a-1-4']);
	});
});

describe('voteSubjectChoices', () => {
	it('names each subject with its title beside it, then Other', () => {
		expect(voteSubjectChoices([DRAFT_ONE])).toEqual([
			{ value: 'paper-1', label: 'Draft resolution 1.1', detail: 'Human control' },
			{ value: OTHER_VOTE_SUBJECT, label: 'Other' }
		]);
	});
});

describe('isVotedStatus', () => {
	it('is true for passed and failed alone', () => {
		expect(isVotedStatus('passed')).toBe(true);
		expect(isVotedStatus('failed')).toBe(true);
		expect(isVotedStatus('introduced')).toBe(false);
	});
});

describe('votedWord', () => {
	it('says when the paper passed and how the vote went', () => {
		expect(votedWord({ status: 'passed', vote: PASSED_VOTE }, 'Europe/London')).toBe(
			'Passed 16 March, 16:40 · 31 for · 6 against · 7 abstentions'
		);
	});

	it('says Failed for a failed paper', () => {
		const vote = { ...PASSED_VOTE, passed: false, counts: { for: 6, against: 31, abstain: 1 } };

		expect(votedWord({ status: 'failed', vote }, 'Europe/London')).toBe(
			'Failed 16 March, 16:40 · 6 for · 31 against · 1 abstention'
		);
	});

	it('says the outcome alone without a vote, and nothing before one', () => {
		expect(votedWord({ status: 'passed', vote: null }, 'Europe/London')).toBe('Passed');
		expect(votedWord({ status: 'introduced' }, 'Europe/London')).toBeNull();
	});
});

describe('recordName', () => {
	const numbered = { topicNumber: 1, sequence: 1 };

	it('calls a passed draft resolution a resolution', () => {
		expect(recordName({ kind: 'draft_resolution', status: 'passed', ...numbered })).toBe(
			'Resolution 1.1'
		);
	});

	it('keeps the name of anything else', () => {
		expect(recordName({ kind: 'draft_resolution', status: 'failed', ...numbered })).toBe(
			'Draft resolution 1.1'
		);
		expect(recordName({ kind: 'committee_directive', status: 'passed', ...numbered })).toBe(
			'Committee directive 1.1'
		);
	});
});

describe('recordDay', () => {
	it('writes the day in full, in the conference’s time zone', () => {
		expect(recordDay('2027-03-16T23:30:00Z', 'Europe/London')).toBe('16 March 2027');
		expect(recordDay('2027-03-16T23:30:00Z', 'Asia/Tokyo')).toBe('17 March 2027');
	});
});

describe('adoptedSentence', () => {
	it('says when and by how many votes', () => {
		expect(adoptedSentence('2027-03-16T16:40:00Z', PASSED_VOTE, 'Europe/London')).toBe(
			'Adopted on 16 March 2027 by 31 votes to 6, with 7 abstentions.'
		);
	});

	it('writes one vote and one abstention in the singular', () => {
		const close = { ...PASSED_VOTE, counts: { for: 1, against: 0, abstain: 1 } };

		expect(adoptedSentence('2027-03-16T16:40:00Z', close, 'Europe/London')).toBe(
			'Adopted on 16 March 2027 by 1 vote to 0, with 1 abstention.'
		);
	});

	it('leaves out the abstentions when there were none', () => {
		const unopposed = { ...PASSED_VOTE, counts: { for: 2, against: 0, abstain: 0 } };

		expect(adoptedSentence('2027-03-16T16:40:00Z', unopposed, 'Europe/London')).toBe(
			'Adopted on 16 March 2027 by 2 votes to 0.'
		);
	});

	it('gives the day it was decided alone without a vote', () => {
		expect(adoptedSentence('2027-03-15T10:00:00Z', null, 'Europe/London')).toBe(
			'Adopted on 15 March 2027.'
		);
	});
});

describe('printedLine', () => {
	it('says the copy is printed from MUNMeet, and when', () => {
		expect(printedLine(new Date('2027-03-16T12:00:00Z'), 'Europe/London')).toBe(
			'Record copy, printed from MUNMeet on 16 March 2027.'
		);
	});
});

describe('liveVoteWord', () => {
	it('says Voting on while the vote is open and Voted on after', () => {
		expect(liveVoteWord(true)).toBe('Voting on');
		expect(liveVoteWord(false)).toBe('Voted on');
	});
});

describe('recordFacts', () => {
	it('puts the conference before the heading’s lines', () => {
		const heading = {
			lines: [
				{ label: 'Committee', value: 'DISEC' },
				{ label: 'Sponsors', value: 'Austria' }
			],
			opening: 'The General Assembly,'
		};

		expect(recordFacts('Northbridge MUN 2027', heading)).toEqual([
			{ label: 'Conference', value: 'Northbridge MUN 2027' },
			{ label: 'Committee', value: 'DISEC' },
			{ label: 'Sponsors', value: 'Austria' }
		]);
	});

	it('says None, not None yet, for a line with nobody on it', () => {
		const heading = {
			lines: [{ label: 'Signatories', value: 'None yet' }],
			opening: 'The General Assembly,'
		};

		expect(recordFacts('Northbridge MUN 2027', heading)).toContainEqual({
			label: 'Signatories',
			value: 'None'
		});
	});
});

describe('livePaperLine', () => {
	const DISPLAYED = { id: 'paper-1', name: 'Working paper 1.1', title: 'Meaningful human control' };
	const VOTED = { id: 'paper-2', name: 'Draft resolution 1.1', title: 'Autonomous weapons' };

	it('names the paper being voted on, then voted on, while the vote has the screen', () => {
		const vote = { kind: 'vote' } as const;

		expect(livePaperLine(vote, DISPLAYED, { paper: VOTED, isOpen: true })).toEqual({
			word: 'Voting on',
			paper: VOTED
		});
		expect(livePaperLine(vote, DISPLAYED, { paper: VOTED, isOpen: false })).toEqual({
			word: 'Voted on',
			paper: VOTED
		});
		expect(livePaperLine(vote, DISPLAYED, null)).toBeNull();
	});

	it('names the paper on the projector while the room debates', () => {
		expect(livePaperLine({ kind: 'unmod' }, DISPLAYED, null)).toEqual({
			word: 'On screen',
			paper: DISPLAYED
		});
		expect(livePaperLine({ kind: 'unmod' }, null, null)).toBeNull();
	});
});
