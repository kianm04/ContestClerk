import { describe, expect, it } from 'vitest';
import {
	DAIS_PAPER_KINDS,
	PAPER_NUMBER_REFUSAL,
	RETURN_COMMENT_MAX_LENGTH,
	RETURN_COMMENT_REFUSAL,
	approveButtonText,
	approvedMessage,
	daisRowMetaLine,
	daisSections,
	paperNumberText,
	parsePaperNumber,
	proposedNumber,
	readApprovedNumber,
	readDaisDialog,
	readReturnComment,
	returnedMessage,
	reviewMetaLine,
	submittedText,
	withdrawnMessage,
	type DaisPaper
} from './chair-resolutions';

const TIME_ZONE = 'Europe/Vienna';

function paper(overrides: Partial<DaisPaper> = {}): DaisPaper {
	return {
		id: 'paper-1',
		kind: 'draft_resolution',
		topicNumber: null,
		sequence: null,
		status: 'submitted',
		title: 'Human control over the use of force',
		topic: 'Lethal autonomous weapons',
		leadSeatName: 'Austria',
		// 09:12 in Vienna in March, an hour ahead of UTC.
		submittedAt: '2027-03-15T08:12:00Z',
		...overrides
	};
}

describe('DAIS_PAPER_KINDS', () => {
	it('names the kinds the dais approves, and not the crisis notes', () => {
		expect(DAIS_PAPER_KINDS).toEqual(['working_paper', 'draft_resolution', 'committee_directive']);
	});
});

describe('daisSections', () => {
	it('sorts papers into the four sections in the order the dais works through them', () => {
		const sections = daisSections([
			paper({ id: 'passed', status: 'passed', topicNumber: 1, sequence: 1 }),
			paper({ id: 'introduced', status: 'introduced', topicNumber: 1, sequence: 2 }),
			paper({ id: 'approved', status: 'approved', topicNumber: 1, sequence: 3 }),
			paper({ id: 'submitted' })
		]);

		expect(sections.map((section) => section.title)).toEqual([
			'Submitted',
			'Approved, not introduced',
			'Introduced',
			'Decided'
		]);
		expect(sections.map((section) => section.papers.map((each) => each.id))).toEqual([
			['submitted'],
			['approved'],
			['introduced'],
			['passed']
		]);
	});

	it('gives every section one sentence for when it is empty', () => {
		for (const section of daisSections([])) {
			expect(section.papers).toEqual([]);
			expect(section.emptySentence).toMatch(/^[A-Z].*\.$/);
		}
	});

	it('leaves out papers being written and the kinds the crisis staff answer', () => {
		const sections = daisSections([
			paper({ id: 'writing', status: 'writing' }),
			paper({ id: 'press', kind: 'press_release' })
		]);

		expect(sections.flatMap((section) => section.papers)).toEqual([]);
	});

	it('puts the oldest submission first, and numbered papers in their numbers’ order', () => {
		const sections = daisSections([
			paper({ id: 'later', submittedAt: '2027-03-15T10:00:00Z' }),
			paper({ id: 'earlier', submittedAt: '2027-03-15T09:00:00Z' }),
			paper({ id: 'dr-1.2', status: 'approved', topicNumber: 1, sequence: 2 }),
			paper({ id: 'dr-2.1', status: 'approved', topicNumber: 2, sequence: 1 }),
			paper({
				id: 'wp-1.4',
				status: 'approved',
				kind: 'working_paper',
				topicNumber: 1,
				sequence: 4
			})
		]);

		expect(sections[0].papers.map((each) => each.id)).toEqual(['earlier', 'later']);
		expect(sections[1].papers.map((each) => each.id)).toEqual(['wp-1.4', 'dr-1.2', 'dr-2.1']);
	});
});

describe('submittedText', () => {
	it('says the day and the time in the conference’s time zone', () => {
		expect(submittedText('2027-03-15T08:12:00Z', TIME_ZONE)).toBe('15 March, 09:12');
	});
});

describe('daisRowMetaLine', () => {
	it('gives the kind and number, the topic, the lead seat and when it was submitted', () => {
		expect(daisRowMetaLine(paper({ topicNumber: 1, sequence: 1 }), TIME_ZONE)).toBe(
			'Draft resolution 1.1 · Lethal autonomous weapons · Austria · Submitted 15 March, 09:12'
		);
	});

	it('leaves out what a paper lacks, and ends a decided paper with how it was decided', () => {
		const decided = paper({ status: 'failed', topic: null, leadSeatName: null, submittedAt: null });

		expect(daisRowMetaLine(decided, TIME_ZONE)).toBe('Draft resolution · Failed');
	});
});

describe('reviewMetaLine', () => {
	it('says what the paper is, when and by whom it was submitted, and its version', () => {
		expect(reviewMetaLine(paper(), 'Austria', 1, TIME_ZONE)).toBe(
			'Draft resolution · Submitted 15 March, 09:12 by Austria · Version 1'
		);
	});

	it('leaves out the seat and the version when there are none', () => {
		expect(reviewMetaLine(paper(), null, null, TIME_ZONE)).toBe(
			'Draft resolution · Submitted 15 March, 09:12'
		);
	});
});

describe('paperNumberText and parsePaperNumber', () => {
	it('writes a number as the dais types it and reads it back', () => {
		expect(paperNumberText({ topicNumber: 1, sequence: 2 })).toBe('1.2');
		expect(parsePaperNumber(' 1.2 ')).toEqual({ topicNumber: 1, sequence: 2 });
	});

	it('refuses anything that is not two whole numbers from 1', () => {
		for (const text of ['', '1', '1.', '0.1', '1.0', '-1.2', '1.2.3', 'one.two', '1,2']) {
			expect(parsePaperNumber(text)).toBeNull();
		}
	});
});

describe('PAPER_NUMBER_REFUSAL', () => {
	it('is the database’s own words', () => {
		expect(PAPER_NUMBER_REFUSAL).toBe("A paper's number is two whole numbers from 1, such as 1.2.");
	});
});

describe('proposedNumber', () => {
	const topics = ['Lethal autonomous weapons', 'Outer space'];

	it('numbers the first paper of its kind on its topic 1', () => {
		expect(proposedNumber(paper({ topic: 'Outer space' }), topics, [])).toEqual({
			topicNumber: 2,
			sequence: 1
		});
	});

	it('takes the next number of the same kind on the same topic, counting withdrawn ones', () => {
		const numbered = [
			{ kind: 'draft_resolution' as const, topicNumber: 1, sequence: 1 },
			{ kind: 'draft_resolution' as const, topicNumber: 1, sequence: 3 },
			{ kind: 'working_paper' as const, topicNumber: 1, sequence: 7 },
			{ kind: 'draft_resolution' as const, topicNumber: 2, sequence: 9 }
		];

		expect(proposedNumber(paper(), topics, numbered)).toEqual({ topicNumber: 1, sequence: 4 });
	});

	it('uses the first topic for a paper with no topic or one no longer on the agenda', () => {
		expect(proposedNumber(paper({ topic: null }), topics, [])).toEqual({
			topicNumber: 1,
			sequence: 1
		});
		expect(proposedNumber(paper({ topic: 'Gone' }), topics, [])).toEqual({
			topicNumber: 1,
			sequence: 1
		});
	});
});

describe('approveButtonText', () => {
	it('names the kind and the number the paper will get', () => {
		expect(approveButtonText('draft_resolution', { topicNumber: 1, sequence: 1 })).toBe(
			'Approve as Draft resolution 1.1'
		);
		expect(approveButtonText('working_paper', null)).toBe('Approve as Working paper');
	});
});

describe('approvedMessage, returnedMessage and withdrawnMessage', () => {
	it('say what happened to which paper', () => {
		expect(
			approvedMessage('Human control', 'draft_resolution', { topicNumber: 1, sequence: 1 })
		).toBe('“Human control” approved as Draft resolution 1.1.');
		expect(returnedMessage('Human control')).toBe('“Human control” returned to its authors.');
		expect(
			withdrawnMessage({
				kind: 'draft_resolution',
				topicNumber: 1,
				sequence: 1,
				title: 'Human control'
			})
		).toBe('Draft resolution 1.1, “Human control”, withdrawn.');
	});
});

describe('RETURN_COMMENT_REFUSAL and RETURN_COMMENT_MAX_LENGTH', () => {
	it('are the database’s words and limit', () => {
		expect(RETURN_COMMENT_REFUSAL).toBe(
			'Say in at most 2,000 characters what the authors should change.'
		);
		expect(RETURN_COMMENT_MAX_LENGTH).toBe(2000);
	});
});

describe('readReturnComment', () => {
	it('reads the comment trimmed, and nothing for a blank one', () => {
		const sent = new FormData();
		sent.set('comment', '  Number the operative clauses.  ');
		expect(readReturnComment(sent)).toBe('Number the operative clauses.');

		sent.set('comment', '   ');
		expect(readReturnComment(sent)).toBeNull();
		expect(readReturnComment(new FormData())).toBeNull();
	});
});

describe('readApprovedNumber', () => {
	it('reads the number typed, and nothing for one that is not a number', () => {
		const sent = new FormData();
		sent.set('number', '2.3');
		expect(readApprovedNumber(sent)).toEqual({ topicNumber: 2, sequence: 3 });

		sent.set('number', 'next');
		expect(readApprovedNumber(sent)).toBeNull();
		expect(readApprovedNumber(new FormData())).toBeNull();
	});
});

describe('readDaisDialog', () => {
	it('opens Return over a submitted paper and Withdraw over an introduced one', () => {
		expect(readDaisDialog(new URLSearchParams('return=1'), 'submitted')).toBe('return');
		expect(readDaisDialog(new URLSearchParams('withdraw=1'), 'introduced')).toBe('withdraw');
	});

	it('opens neither where the database would refuse it', () => {
		expect(readDaisDialog(new URLSearchParams('return=1'), 'approved')).toBeNull();
		expect(readDaisDialog(new URLSearchParams('withdraw=1'), 'submitted')).toBeNull();
		expect(readDaisDialog(new URLSearchParams(''), 'submitted')).toBeNull();
	});
});
