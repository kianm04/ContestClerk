import { describe, expect, it } from 'vitest';
import type { PaperSupport } from './paper-support';
import {
	RETURNED_SIGNATORIES_NOTE,
	SUBMITTING_MESSAGES,
	approvedSentence,
	authorSteps,
	daisPanel,
	decisionByline,
	isReturnedPaper,
	paperProgressWord,
	returnedNotes,
	submitBlockedSentence,
	submitConfirmText,
	submitsNext,
	withTheDaisSentence,
	type PaperDecision
} from './paper-submitting';

// London keeps Greenwich time in the middle of March, so these read as written.
const LONDON = 'Europe/London';

const RETURNED: PaperDecision = {
	decidedAt: '2099-03-15T09:46:00Z',
	decidedBy: { name: 'Eleanor Price', title: 'Chair' },
	returnComment: 'Say in clause 2 whether the register is public.'
};

function support(count: number, needed: number): PaperSupport {
	return {
		sponsors: count,
		signatories: 0,
		count,
		needed,
		seatsWithDelegate: 44,
		rules: {
			minimum: 20,
			unit: 'percent',
			countsSponsors: true,
			sponsorLimit: 5,
			checksFormat: true
		}
	};
}

describe('isReturnedPaper', () => {
	it('is true for a paper being written again after the dais returned it', () => {
		expect(isReturnedPaper('writing', RETURNED)).toBe(true);
	});

	it('is false for a paper never decided, or decided some other way', () => {
		expect(isReturnedPaper('writing', null)).toBe(false);
		expect(isReturnedPaper('approved', RETURNED)).toBe(false);
	});
});

describe('paperProgressWord', () => {
	const writing = { status: 'writing' as const, submittedAt: null };

	it('says when the paper went to the dais, and that it is there', () => {
		const submitted = { status: 'submitted' as const, submittedAt: '2099-03-15T09:12:00Z' };

		expect(paperProgressWord(submitted, null, LONDON)).toBe(
			'Submitted 15 March, 09:12 · With the dais'
		);
	});

	it('says when it came back, was approved, or that it was withdrawn', () => {
		const once = { ...writing, submittedAt: '2099-03-15T09:12:00Z' };

		expect(paperProgressWord(once, RETURNED, LONDON)).toBe('Returned 15 March, 09:46');
		expect(paperProgressWord({ ...once, status: 'approved' }, RETURNED, LONDON)).toBe(
			'Approved 15 March, 09:46'
		);
		expect(paperProgressWord({ ...once, status: 'withdrawn' }, null, LONDON)).toBe('Withdrawn');
	});

	it('has nothing for a paper being written for the first time', () => {
		expect(paperProgressWord(writing, null, LONDON)).toBeNull();
	});
});

describe('submitsNext', () => {
	it('sends a working paper straight to the dais', () => {
		expect(submitsNext('working_paper', false, null)).toBe(true);
	});

	it('opens a draft for signatures first while it lacks the support', () => {
		expect(submitsNext('draft_resolution', false, support(5, 9))).toBe(false);
		expect(submitsNext('draft_resolution', true, support(5, 9))).toBe(true);
		expect(submitsNext('draft_resolution', false, support(12, 9))).toBe(true);
	});
});

describe('authorSteps', () => {
	const open = { action: 'openSignatures' as const, label: 'Open for signatures', isPrimary: true };

	it('makes "Open for signatures" the one primary button while a draft lacks support', () => {
		expect(
			authorSteps('draft_resolution', true, { isOpen: false, button: open }, support(5, 9))
		).toEqual({ signing: open, isSubmitShown: false });
	});

	it('puts "Submit to the dais" first once it is next, and quietens opening', () => {
		expect(
			authorSteps('draft_resolution', true, { isOpen: false, button: open }, support(12, 9))
		).toEqual({ signing: { ...open, isPrimary: false }, isSubmitShown: true });
	});

	it('shows no submitting to somebody who may not submit', () => {
		expect(authorSteps('working_paper', false, null, null)).toEqual({
			signing: null,
			isSubmitShown: false
		});
	});
});

describe('submitBlockedSentence', () => {
	it('says how many suggestions are in the way', () => {
		expect(submitBlockedSentence(1)).toBe(
			'Accept or reject the open suggestion before submitting.'
		);
		expect(submitBlockedSentence(3)).toBe(
			'Accept or reject the 3 open suggestions before submitting.'
		);
	});
});

describe('withTheDaisSentence', () => {
	it('names the committee’s chair, as the drawing does', () => {
		expect(withTheDaisSentence('draft_resolution', { name: 'Eleanor Price', title: 'Chair' })).toBe(
			'Eleanor Price, the Chair, will approve it as a draft resolution or return it to you with notes. Until then the text is frozen as version 1.'
		);
	});

	it('has the dais do it where nobody alone chairs the committee', () => {
		expect(withTheDaisSentence('working_paper', null)).toMatch(
			/^The dais will approve it as a working paper or return/
		);
	});
});

describe('approvedSentence', () => {
	it('says who approved it, as what and when', () => {
		expect(approvedSentence('Draft resolution 1.1', RETURNED, LONDON)).toBe(
			'Eleanor Price approved it as Draft resolution 1.1 on 15 March, 09:46. It comes to the floor once the committee passes a motion to introduce it.'
		);
	});
});

describe('daisPanel', () => {
	const draft = { kind: 'draft_resolution' as const, topicNumber: 1, sequence: 1 };

	it('says who decides while the paper waits, and what was decided once approved', () => {
		expect(daisPanel({ ...draft, status: 'submitted' }, null, null, LONDON)?.title).toBe(
			'With the dais'
		);
		expect(daisPanel({ ...draft, status: 'approved' }, RETURNED, null, LONDON)).toEqual({
			title: 'Approved',
			sentence: approvedSentence('Draft resolution 1.1', RETURNED, LONDON)
		});
	});

	it('has nothing while the paper is written, or after it is withdrawn', () => {
		expect(daisPanel({ ...draft, status: 'writing' }, null, null, LONDON)).toBeNull();
		expect(daisPanel({ ...draft, status: 'withdrawn' }, null, null, LONDON)).toBeNull();
	});
});

describe('decisionByline', () => {
	it('names the one who returned the paper, with their title and the time', () => {
		expect(decisionByline(RETURNED, LONDON)).toBe('Eleanor Price, Chair · 15 March, 09:46');
		expect(decisionByline({ ...RETURNED, decidedBy: null }, LONDON)).toBe(
			'The dais · 15 March, 09:46'
		);
	});
});

describe('returnedNotes', () => {
	it('has the dais’s comment and its byline while the paper is back with its authors', () => {
		expect(returnedNotes({ status: 'writing' }, RETURNED, LONDON)).toEqual({
			comment: 'Say in clause 2 whether the register is public.',
			byline: 'Eleanor Price, Chair · 15 March, 09:46'
		});
	});

	it('has nothing once it is submitted again or never came back', () => {
		expect(returnedNotes({ status: 'submitted' }, RETURNED, LONDON)).toBeNull();
		expect(returnedNotes({ status: 'writing' }, null, LONDON)).toBeNull();
	});
});

describe('submitConfirmText', () => {
	it('says the text freezes, and what happens to the signatures', () => {
		expect(submitConfirmText('working_paper', false)).toMatch(/as version 1/);
		expect(submitConfirmText('draft_resolution', true)).toMatch(/stops taking signatures/);
		expect(submitConfirmText('draft_resolution', false)).toMatch(/keeps the signatures/);
	});
});

describe('the messages', () => {
	it('quote the paper’s title', () => {
		expect(SUBMITTING_MESSAGES.submitted('Autonomy')).toBe('“Autonomy” is with the dais.');
		expect(SUBMITTING_MESSAGES.withdrawn('Autonomy')).toBe('“Autonomy” is withdrawn.');
		expect(SUBMITTING_MESSAGES.submitTitle('A')).toBe('Submit “A” to the dais?');
		expect(SUBMITTING_MESSAGES.withdrawTitle('A')).toBe('Withdraw “A”?');
		expect(RETURNED_SIGNATORIES_NOTE).toMatch(/until you submit again/);
	});
});
