import { describe, expect, it } from 'vitest';
import type { DraftVersion } from './amendment-cards';
import {
	addedClausePlace,
	amendmentOutcome,
	clauseWithWord,
	recordAmendmentWords,
	recordedAmendments,
	type RecordedAmendment
} from './amendment-record';
import type { PaperAmendment } from './paper-amendments';
import type { ClauseContent } from './paper-clauses';
import type { PaperVote } from './paper-votes';

const SUBMITTED: ClauseContent = {
	preamble: [{ id: 'p1', markdown: '*Recalling* its resolution 78/241,' }],
	operative: [
		{
			id: 'o1',
			markdown: 'Calls upon all States:',
			children: [{ id: 'o1a', markdown: 'to refrain from deploying weapons;', children: [] }]
		},
		{ id: 'o2', markdown: 'Requests a report;', children: [] },
		{ id: 'o3', markdown: 'Decides to remain seized of the matter.', children: [] }
	]
};

// Once amendment 1 is written in and amendment 3 has passed: 1(a) changed, a clause after 2.
const ADOPTED: ClauseContent = {
	preamble: SUBMITTED.preamble,
	operative: [
		{
			id: 'o1',
			markdown: 'Calls upon all States:',
			children: [{ id: 'o1a', markdown: 'to refrain from deploying weapons now;', children: [] }]
		},
		{ id: 'o2', markdown: 'Requests a report;', children: [] },
		{ id: 'a3', markdown: '*Affirms* its resolve;', children: [] },
		{ id: 'o3', markdown: 'Decides to remain seized of the matter.', children: [] }
	]
};

const VERSIONS: DraftVersion[] = [
	{ id: 'version-1', versionNumber: 1, content: SUBMITTED },
	{ id: 'version-2', versionNumber: 2, content: ADOPTED }
];

function amendment(overrides: Partial<PaperAmendment> = {}): PaperAmendment {
	return {
		id: 'amendment-1',
		sequence: 1,
		proposedBySeatId: 'germany',
		proposerName: 'Germany',
		action: 'change',
		targetPart: 'operative',
		targetClauseId: 'o1a',
		textMarkdown: 'to refrain from deploying weapons now;',
		parentAmendmentId: null,
		status: 'written_in',
		isFriendly: true,
		queuePosition: null,
		ruling: null,
		basedOnVersionId: 'version-1',
		createdAt: '2026-03-15T14:20:00Z',
		decidedAt: '2026-03-15T14:52:00Z',
		sponsorAnswers: [],
		supporterSeatIds: [],
		...overrides
	};
}

function vote(forCount: number, against: number, abstain: number): PaperVote {
	return {
		passed: forCount > against,
		counts: { for: forCount, against, abstain },
		closedAt: '2026-03-15T15:30:00Z'
	};
}

const STRIKE = amendment({
	id: 'amendment-2',
	sequence: 2,
	proposerName: 'United States',
	action: 'strike',
	targetClauseId: 'o2',
	textMarkdown: null,
	status: 'failed',
	isFriendly: false
});

const ADDITION = amendment({
	id: 'amendment-3',
	sequence: 3,
	proposerName: 'India',
	action: 'add',
	targetClauseId: 'o2',
	textMarkdown: '*Affirms* its resolve;',
	status: 'passed',
	isFriendly: false
});

describe('recordAmendmentWords', () => {
	it('names the change to a clause and the words it added, without their Markdown', () => {
		expect(recordAmendmentWords(amendment(), [amendment()], VERSIONS)).toBe(
			'Clause 1(a): adds “now”'
		);
	});

	it('names a strike and an addition by the clause', () => {
		expect(recordAmendmentWords(STRIKE, [STRIKE], VERSIONS)).toBe('Strike clause 2');
		expect(recordAmendmentWords(ADDITION, [ADDITION], VERSIONS)).toBe(
			'Adds a clause after clause 2'
		);
	});

	it('names an addition at the start of the operative clauses', () => {
		const atStart = amendment({ action: 'add', targetClauseId: null, textMarkdown: 'Notes;' });

		expect(recordAmendmentWords(atStart, [atStart], VERSIONS)).toBe(
			'Adds a clause before clause 1'
		);
	});

	it('names an amendment to an amendment by the amendment it changed', () => {
		const child = amendment({
			id: 'amendment-4',
			sequence: 4,
			action: 'change',
			targetClauseId: 'o2',
			textMarkdown: '*Affirms* its firm resolve;',
			parentAmendmentId: 'amendment-3'
		});

		expect(recordAmendmentWords(child, [ADDITION, child], VERSIONS)).toBe(
			'Amendment 3: adds “firm”'
		);
	});
});

describe('clauseWithWord', () => {
	it('names an operative clause by its number and a preambulatory one in full', () => {
		const clause = { id: 'o2', level: 1, markdown: '', marker: '2.', reference: '2' };

		expect(clauseWithWord({ ...clause, part: 'operative' })).toBe('clause 2');
		expect(clauseWithWord({ ...clause, part: 'preamble' })).toBe('preambulatory clause 2');
	});
});

describe('addedClausePlace', () => {
	it('finds where a passed addition now stands', () => {
		expect(addedClausePlace(ADDITION, ADOPTED)).toBe('now clause 3');
	});

	it('has nothing to say of anything but an addition', () => {
		expect(addedClausePlace(STRIKE, ADOPTED)).toBeNull();
	});
});

describe('amendmentOutcome', () => {
	const context = { vote: null, place: null, timeZone: 'Europe/London' };

	it('says when a friendly amendment was written in', () => {
		expect(amendmentOutcome(amendment(), context)).toBe('Friendly; written in on 15 March');
	});

	it('gives a failed amendment its count', () => {
		expect(amendmentOutcome(STRIKE, { ...context, vote: vote(12, 25, 6) })).toBe(
			'Failed, 12 to 25, with 6 abstentions'
		);
	});

	it('gives a passed addition its count and its place', () => {
		expect(
			amendmentOutcome(ADDITION, { ...context, vote: vote(25, 13, 1), place: 'now clause 5' })
		).toBe('Passed, 25 to 13, with 1 abstention; now clause 5');
	});

	it('leaves out the count of a vote it does not hold, and abstentions when there were none', () => {
		expect(amendmentOutcome(ADDITION, context)).toBe('Passed');
		expect(amendmentOutcome(STRIKE, { ...context, vote: vote(12, 25, 0) })).toBe(
			'Failed, 12 to 25'
		);
	});
});

describe('recordedAmendments', () => {
	it('lists the decided amendments by number, leaving out those ruled out', () => {
		const ruledOut = amendment({ id: 'amendment-5', sequence: 5, status: 'out_of_order' });
		const rows: RecordedAmendment[] = recordedAmendments(
			[ADDITION, ruledOut, STRIKE, amendment()],
			{
				versions: VERSIONS,
				votes: { 'amendment-2': vote(12, 25, 6), 'amendment-3': vote(25, 13, 6) },
				timeZone: 'Europe/London'
			}
		);

		expect(rows).toEqual([
			{
				id: 'amendment-1',
				sequence: 1,
				proposedBy: 'Germany',
				words: 'Clause 1(a): adds “now”',
				outcome: 'Friendly; written in on 15 March'
			},
			{
				id: 'amendment-2',
				sequence: 2,
				proposedBy: 'United States',
				words: 'Strike clause 2',
				outcome: 'Failed, 12 to 25, with 6 abstentions'
			},
			{
				id: 'amendment-3',
				sequence: 3,
				proposedBy: 'India',
				words: 'Adds a clause after clause 2',
				outcome: 'Passed, 25 to 13, with 6 abstentions; now clause 3'
			}
		]);
	});
});
