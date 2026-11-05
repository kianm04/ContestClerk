import { describe, expect, it } from 'vitest';
import {
	amendmentMetaLine,
	amendmentSentence,
	clauseOptions,
	clauseReference,
	findClause,
	wordChange
} from './amendment-wording';
import type { AmendmentRules, PaperAmendment } from './paper-amendments';
import type { ClauseContent } from './paper-clauses';

const CONTENT: ClauseContent = {
	preamble: [
		{ id: 'p1', markdown: 'Recalling its resolution 78/241,' },
		{ id: 'p2', markdown: 'Alarmed by the pace of change,' }
	],
	operative: [
		{
			id: 'o1',
			markdown: 'Calls upon all States:',
			children: [
				{ id: 'o1a', markdown: 'to refrain from deploying weapons;', children: [] },
				{ id: 'o1b', markdown: 'to share what they know;', children: [] }
			]
		},
		{ id: 'o2', markdown: 'Requests a report from the Secretary-General;', children: [] }
	]
};

const RULES: AmendmentRules = {
	hasFriendlyAmendments: true,
	isPreambleAmendable: true,
	hasSecondDegreeAmendments: true,
	supportNeeded: 5
};

function amendment(overrides: Partial<PaperAmendment> = {}): PaperAmendment {
	return {
		id: 'amendment-1',
		sequence: 1,
		proposedBySeatId: 'germany',
		proposerName: 'Germany',
		action: 'change',
		targetPart: 'operative',
		targetClauseId: 'o1a',
		textMarkdown: 'to refrain from deploying weapons whose effects cannot be controlled;',
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

const CONTEXT = { rules: RULES, parent: null, sponsorsWord: 'sponsors', timeZone: 'Europe/London' };

describe('findClause and clauseReference', () => {
	it('finds a clause by its id and names it as a chair reads it', () => {
		const subClause = findClause(CONTENT, 'operative', 'o1a');
		const preambular = findClause(CONTENT, 'preamble', 'p2');

		expect(subClause?.reference).toBe('1(a)');
		expect(clauseReference(subClause!)).toBe('1(a)');
		expect(clauseReference(preambular!)).toBe('preambulatory clause 2');
		expect(findClause(CONTENT, 'preamble', 'o1a')).toBe(null);
		expect(findClause(CONTENT, 'operative', null)).toBe(null);
	});
});

describe('wordChange', () => {
	it('finds what was added, struck or replaced between the words both share', () => {
		expect(wordChange('to share what they know;', 'to share all that they know;')).toEqual({
			kind: 'replace',
			removed: 'what',
			added: 'all that'
		});
		expect(wordChange('to act now;', 'to act together now;')).toEqual({
			kind: 'add',
			added: 'together'
		});
		expect(wordChange('to act together now;', 'to act now;')).toEqual({
			kind: 'strike',
			removed: 'together'
		});
		expect(wordChange('to act;', '*to* act;')).toEqual({ kind: 'same' });
		expect(wordChange('Decides to act;', 'Urges restraint.')).toEqual({ kind: 'whole' });
	});
});

describe('amendmentSentence', () => {
	const before = 'to refrain from deploying weapons;';

	it('words a change by what it does to the clause', () => {
		expect(
			amendmentSentence(amendment(), {
				clause: findClause(CONTENT, 'operative', 'o1a'),
				before,
				parent: null
			})
		).toBe('Change 1(a): add ‘whose effects cannot be controlled’.');
	});

	it('words a strike and an addition', () => {
		expect(
			amendmentSentence(amendment({ action: 'strike', textMarkdown: null }), {
				clause: findClause(CONTENT, 'operative', 'o2'),
				before: null,
				parent: null
			})
		).toBe('Strike clause 2');
		expect(
			amendmentSentence(amendment({ action: 'add', textMarkdown: 'Affirms that *all* States;' }), {
				clause: findClause(CONTENT, 'operative', 'o2'),
				before: null,
				parent: null
			})
		).toBe('Add after clause 2: ‘++Affirms++ that *all* States;’');
		expect(
			amendmentSentence(
				amendment({ action: 'add', targetPart: 'preamble', textMarkdown: 'Noting the report,' }),
				{ clause: null, before: null, parent: null }
			)
		).toBe('Add at the start of the preamble: ‘*Noting* the report,’');
	});

	it('words an amendment to an amendment against the words it changes', () => {
		expect(
			amendmentSentence(amendment({ textMarkdown: 'to share all that they know;' }), {
				clause: findClause(CONTENT, 'operative', 'o1b'),
				before: 'to share what they know;',
				parent: { sequence: 2 }
			})
		).toBe('Change amendment 2: replace ‘what’ with ‘all that’.');
	});

	it('escapes Markdown in the words it quotes, and says when the clause has gone', () => {
		expect(
			amendmentSentence(amendment({ textMarkdown: 'to act now #1;' }), {
				clause: null,
				before: 'to act;',
				parent: null
			})
		).toBe('Change a clause no longer in the draft: add ‘now \\#1’.');
	});
});

describe('amendmentMetaLine', () => {
	it('counts the sponsors’ answers while they are asked', () => {
		const asking = amendment({
			status: 'awaiting_sponsors',
			proposerName: 'India',
			sponsorAnswers: [
				{ seatId: 'a', seatName: 'A', accepts: true },
				{ seatId: 'b', seatName: 'B', accepts: null },
				{ seatId: 'c', seatName: 'C', accepts: true }
			]
		});

		expect(amendmentMetaLine(asking, CONTEXT)).toBe('India · 2 of 3 sponsors have answered');
	});

	it('counts the support of an unfriendly amendment', () => {
		expect(amendmentMetaLine(amendment({ supporterSeatIds: ['a'] }), CONTEXT)).toBe(
			'Germany · Unfriendly · Supported by 2 seats of the 5 it needs'
		);
		expect(
			amendmentMetaLine(
				amendment({
					status: 'with_the_dais',
					proposerName: 'United States',
					supporterSeatIds: ['a', 'b', 'c', 'd']
				}),
				CONTEXT
			)
		).toBe('United States · Unfriendly · Supported by 5 seats, the 5 it needs');
	});

	it('dates one that has ended, and names the amendment it changes', () => {
		expect(
			amendmentMetaLine(
				amendment({ status: 'written_in', isFriendly: true, decidedAt: '2026-03-15T14:52:00Z' }),
				CONTEXT
			)
		).toBe('Germany · Friendly · 15 March, 14:52');
		expect(
			amendmentMetaLine(amendment({ status: 'with_the_dais', parentAmendmentId: 'two' }), {
				...CONTEXT,
				parent: { sequence: 2 },
				rules: { ...RULES, supportNeeded: 1 }
			})
		).toBe('Germany · To amendment 2');
	});
});

describe('clauseOptions', () => {
	it('offers every clause, and the starts of each part for an addition', () => {
		expect(clauseOptions(CONTENT, true, 'add').map((option) => option.label)).toEqual([
			'At the start of the preamble',
			'After preambulatory clause 1',
			'After preambulatory clause 2',
			'Before clause 1',
			'After clause 1',
			'After clause 1(a)',
			'After clause 1(b)',
			'After clause 2'
		]);
	});

	it('leaves out the preamble where it is not amended, and the starts for a change', () => {
		expect(clauseOptions(CONTENT, false, 'change')).toEqual([
			{ value: 'operative:o1', label: 'Clause 1', detail: 'Calls upon all States:' },
			{
				value: 'operative:o1a',
				label: 'Clause 1(a)',
				detail: 'to refrain from deploying weapons;'
			},
			{ value: 'operative:o1b', label: 'Clause 1(b)', detail: 'to share what they know;' },
			{
				value: 'operative:o2',
				label: 'Clause 2',
				detail: 'Requests a report from the Secretary-General;'
			}
		]);
	});

	it('offers every choice when the action is not yet known', () => {
		const options = clauseOptions(CONTENT, false, null);

		expect(options[0]).toEqual({
			value: 'operative:start',
			label: 'Before clause 1',
			detail: 'An addition only'
		});
		expect(options).toHaveLength(5);
	});
});
