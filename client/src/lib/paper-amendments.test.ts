import { describe, expect, it } from 'vitest';
import {
	AMENDMENT_ACTION_OPTIONS,
	AMENDMENT_MESSAGES,
	AMENDMENT_NOT_FOUND,
	AMENDMENT_TEXT_MAX_LENGTH,
	amendmentChoices,
	amendmentName,
	amendmentStatusTone,
	amendmentStatusWord,
	amendmentsWaitingForSeat,
	clauseChoiceValue,
	isAmendable,
	isAmendmentWaiting,
	proposedMessage,
	readAmendmentForm,
	readAmendmentToAmendmentForm,
	readClauseChoice,
	waitingForYouText,
	amendmentToAnswerText,
	type AmendmentRules,
	type PaperAmendment
} from './paper-amendments';

/** An amendment by Germany, collecting support, with what each test changes. */
function amendment(overrides: Partial<PaperAmendment> = {}): PaperAmendment {
	return {
		id: 'amendment-1',
		sequence: 1,
		proposedBySeatId: 'germany',
		proposerName: 'Germany',
		action: 'change',
		targetPart: 'operative',
		targetClauseId: 'o1',
		textMarkdown: 'Calls upon all States to act;',
		parentAmendmentId: null,
		status: 'collecting_support',
		isFriendly: false,
		queuePosition: null,
		ruling: null,
		basedOnVersionId: 'version-1',
		createdAt: '2026-03-15T14:20:00Z',
		decidedAt: null,
		sponsorAnswers: [],
		supporterSeatIds: [],
		...overrides
	};
}

const RULES: AmendmentRules = {
	hasFriendlyAmendments: true,
	isPreambleAmendable: false,
	hasSecondDegreeAmendments: true,
	supportNeeded: 5
};

/** A form with these fields, as the browser sends it. */
function form(fields: Record<string, string>): FormData {
	const data = new FormData();
	for (const [name, value] of Object.entries(fields)) data.set(name, value);

	return data;
}

describe('isAmendmentWaiting, amendmentStatusWord and amendmentStatusTone', () => {
	it('names each status as a chair would, amber while it waits', () => {
		expect(isAmendmentWaiting('approved')).toBe(true);
		expect(isAmendmentWaiting('written_in')).toBe(false);
		expect(amendmentStatusWord('awaiting_sponsors')).toBe('Asking the sponsors');
		expect(amendmentStatusWord('with_the_dais')).toBe('With the dais');
		expect(amendmentStatusWord('written_in')).toBe('Written in');
		expect(amendmentStatusTone('collecting_support')).toBe('warning');
		expect(amendmentStatusTone('written_in')).toBe('success');
		expect(amendmentStatusTone('out_of_order')).toBe('danger');
		expect(amendmentStatusTone('lapsed')).toBe('neutral');
	});
});

describe('amendmentName', () => {
	it('names an amendment by its number on the draft', () => {
		expect(amendmentName({ sequence: 3 })).toBe('Amendment 3');
	});
});

describe('isAmendable', () => {
	it('allows an amendment to a waiting unfriendly change or addition', () => {
		expect(isAmendable(amendment(), RULES)).toBe(true);
		expect(isAmendable(amendment({ status: 'approved' }), RULES)).toBe(true);
	});

	it('refuses a strike, a friendly one, an amendment to an amendment, and a committee without them', () => {
		expect(isAmendable(amendment({ action: 'strike' }), RULES)).toBe(false);
		expect(isAmendable(amendment({ isFriendly: true }), RULES)).toBe(false);
		expect(isAmendable(amendment({ parentAmendmentId: 'other' }), RULES)).toBe(false);
		expect(isAmendable(amendment({ status: 'awaiting_sponsors' }), RULES)).toBe(false);
		expect(isAmendable(amendment(), { ...RULES, hasSecondDegreeAmendments: false })).toBe(false);
	});
});

describe('amendmentChoices', () => {
	const asking = amendment({
		status: 'awaiting_sponsors',
		sponsorAnswers: [
			{ seatId: 'ghana', seatName: 'Ghana', accepts: null },
			{ seatId: 'india', seatName: 'India', accepts: true }
		]
	});

	it('asks a sponsor still to answer, and lets one who accepted decline', () => {
		expect(amendmentChoices(asking, { seatId: 'ghana', isObserver: false }, RULES).answer).toBe(
			'unanswered'
		);
		expect(amendmentChoices(asking, { seatId: 'india', isObserver: false }, RULES).answer).toBe(
			'accepted'
		);
		expect(amendmentChoices(asking, { seatId: 'kenya', isObserver: false }, RULES).answer).toBe(
			null
		);
	});

	it('lets the proposer stop asking, or withdraw', () => {
		const choices = amendmentChoices(asking, { seatId: 'germany', isObserver: false }, RULES);

		expect(choices).toMatchObject({
			mayMakeUnfriendly: true,
			mayWithdraw: true,
			maySupport: false
		});
	});

	it('lets any other seat support it once, observers too, but only an amending delegate amend it', () => {
		const observer = amendmentChoices(amendment(), { seatId: 'holy-see', isObserver: true }, RULES);
		const supporter = amendmentChoices(
			amendment({ supporterSeatIds: ['kenya'] }),
			{ seatId: 'kenya', isObserver: false },
			RULES
		);

		expect(observer).toMatchObject({ maySupport: true, mayAmend: false, hasSupported: false });
		expect(supporter).toMatchObject({ maySupport: false, mayAmend: true, hasSupported: true });
	});

	it('offers the dais nothing on the paper', () => {
		expect(amendmentChoices(amendment(), null, RULES)).toEqual({
			answer: null,
			mayMakeUnfriendly: false,
			maySupport: false,
			hasSupported: false,
			mayWithdraw: false,
			mayAmend: false
		});
	});
});

describe('amendmentsWaitingForSeat and waitingForYouText', () => {
	it('finds what a sponsor has still to answer', () => {
		const waiting = amendment({
			sequence: 3,
			status: 'awaiting_sponsors',
			sponsorAnswers: [{ seatId: 'ghana', seatName: 'Ghana', accepts: null }]
		});
		const answered = amendment({
			sequence: 4,
			status: 'awaiting_sponsors',
			sponsorAnswers: [{ seatId: 'ghana', seatName: 'Ghana', accepts: true }]
		});

		expect(amendmentsWaitingForSeat([waiting, answered], 'ghana')).toEqual([waiting]);
		expect(amendmentsWaitingForSeat([waiting], null)).toEqual([]);
	});

	it('names them in one quiet line', () => {
		expect(waitingForYouText([{ sequence: 3 }])).toBe('Waiting for you: amendment 3');
		expect(waitingForYouText([{ sequence: 3 }, { sequence: 5 }])).toBe(
			'Waiting for you: amendments 3 and 5'
		);
		expect(waitingForYouText([{ sequence: 2 }, { sequence: 3 }, { sequence: 5 }])).toBe(
			'Waiting for you: amendments 2, 3 and 5'
		);
	});
});

describe('clauseChoiceValue and readClauseChoice', () => {
	it('round-trips a clause and the start of a part', () => {
		expect(clauseChoiceValue('operative', 'o1a')).toBe('operative:o1a');
		expect(clauseChoiceValue('preamble', null)).toBe('preamble:start');
		expect(readClauseChoice('operative:o1a')).toEqual({ part: 'operative', clauseId: 'o1a' });
		expect(readClauseChoice('preamble:start')).toEqual({ part: 'preamble', clauseId: null });
		expect(readClauseChoice('annex:o1')).toBe(null);
	});
});

describe('readAmendmentForm', () => {
	it('reads a change', () => {
		expect(
			readAmendmentForm(form({ action: 'change', clause: 'operative:o1', text: ' New words; ' }))
		).toEqual({
			values: { action: 'change', clause: 'operative:o1', text: ' New words; ' },
			errors: {},
			proposal: {
				action: 'change',
				targetPart: 'operative',
				targetClauseId: 'o1',
				textMarkdown: 'New words;'
			}
		});
	});

	it('reads a strike without words, and an addition at the start', () => {
		expect(readAmendmentForm(form({ action: 'strike', clause: 'operative:o2' })).proposal).toEqual({
			action: 'strike',
			targetPart: 'operative',
			targetClauseId: 'o2',
			textMarkdown: null
		});
		expect(
			readAmendmentForm(form({ action: 'add', clause: 'operative:start', text: 'Affirms;' }))
				.proposal?.targetClauseId
		).toBe(null);
	});

	it('points at each field to fix', () => {
		expect(readAmendmentForm(form({})).errors).toEqual({
			action: 'Choose what the amendment does.',
			clause: 'Choose the clause.',
			text: 'Write the words of the amendment, in at most 10,000 characters.'
		});
		expect(
			readAmendmentForm(form({ action: 'change', clause: 'operative:start', text: 'Words' })).errors
		).toEqual({ clause: 'Choose the clause.' });
		expect(
			readAmendmentForm(
				form({
					action: 'add',
					clause: 'operative:o1',
					text: 'a'.repeat(AMENDMENT_TEXT_MAX_LENGTH + 1)
				})
			).proposal
		).toBe(null);
	});
});

describe('proposedMessage, AMENDMENT_MESSAGES and AMENDMENT_NOT_FOUND', () => {
	it('says where the amendment went', () => {
		expect(proposedMessage({ sequence: 3, status: 'awaiting_sponsors' })).toBe(
			'Amendment 3 proposed. The sponsors are asked whether it is friendly.'
		);
		expect(proposedMessage({ sequence: 3, status: 'collecting_support' })).toBe(
			'Amendment 3 proposed. It needs the support of other seats.'
		);
		expect(proposedMessage({ sequence: 3, status: 'with_the_dais' })).toBe(
			'Amendment 3 proposed and sent to the dais.'
		);
		expect(AMENDMENT_MESSAGES.approved(3, true)).toBe('Amendment 3 approved and written in.');
		expect(AMENDMENT_MESSAGES.declined(3)).toBe('You declined amendment 3. It is now unfriendly.');
		expect(AMENDMENT_NOT_FOUND).toBe('That amendment is not on this draft.');
	});
});

describe('AMENDMENT_ACTION_OPTIONS', () => {
	it('offers the three actions in the order a chair names them', () => {
		expect(AMENDMENT_ACTION_OPTIONS.map((option) => option.label)).toEqual([
			'Add a clause',
			'Change a clause',
			'Strike a clause'
		]);
	});
});

describe('readAmendmentToAmendmentForm', () => {
	it('changes the words of the amendment it amends, at that amendment’s clause', () => {
		const parent = { targetPart: 'operative' as const, targetClauseId: 'o1a' };

		expect(readAmendmentToAmendmentForm(form({ text: ' Better words; ' }), parent)).toEqual({
			values: { action: 'change', clause: 'operative:o1a', text: ' Better words; ' },
			errors: {},
			proposal: {
				action: 'change',
				targetPart: 'operative',
				targetClauseId: 'o1a',
				textMarkdown: 'Better words;'
			}
		});
		expect(readAmendmentToAmendmentForm(form({ text: ' ' }), parent).errors.text).toBeDefined();
	});
});

describe('amendmentToAnswerText', () => {
	it('names the amendment and the draft it amends', () => {
		expect(amendmentToAnswerText({ sequence: 3, paper: { topicNumber: 1, sequence: 2 } })).toBe(
			'Amendment 3 to Draft resolution 1.2'
		);
	});
});
