import { describe, expect, it } from 'vitest';
import {
	PREAMBLE_STOP,
	clauseCounts,
	clausePositionText,
	screenStep,
	shownClauseStop,
	steppedClauseStop,
	subClauseLabel
} from './paper-on-screen';

/** A draft resolution with three preambulatory clauses and six operative ones. */
const DRAFT = { preamble: 3, operative: 6 };
/** A directive, which has operative clauses only. */
const DIRECTIVE = { preamble: 0, operative: 2 };

describe('clauseCounts', () => {
	it('counts the clauses of each part, not their sub-clauses', () => {
		const content = {
			preamble: [{ id: 'p1', markdown: 'Recalling,' }],
			operative: [
				{
					id: 'o1',
					markdown: 'Calls upon:',
					children: [{ id: 'o1a', markdown: 'a;', children: [] }]
				},
				{ id: 'o2', markdown: 'Decides.', children: [] }
			]
		};

		expect(clauseCounts(content)).toEqual({ preamble: 1, operative: 2 });
	});
});

describe('shownClauseStop', () => {
	it('starts a draft at its preamble, and a directive at clause 1', () => {
		expect(shownClauseStop(DRAFT, null)).toBe(PREAMBLE_STOP);
		expect(shownClauseStop(DIRECTIVE, null)).toBe(1);
	});

	it('draws a stop past either end as that end', () => {
		expect(shownClauseStop(DRAFT, 9)).toBe(6);
		expect(shownClauseStop(DIRECTIVE, 0)).toBe(1);
		expect(shownClauseStop({ preamble: 2, operative: 0 }, 4)).toBe(PREAMBLE_STOP);
	});

	it('is null for a paper with no clauses, which is shown whole', () => {
		expect(shownClauseStop({ preamble: 0, operative: 0 }, 2)).toBeNull();
	});
});

describe('steppedClauseStop', () => {
	it('moves one clause either way, from the preamble into clause 1', () => {
		expect(steppedClauseStop(DRAFT, null, 'next')).toBe(1);
		expect(steppedClauseStop(DRAFT, 3, 'next')).toBe(4);
		expect(steppedClauseStop(DRAFT, 1, 'previous')).toBe(PREAMBLE_STOP);
	});

	it('stays put at either end', () => {
		expect(steppedClauseStop(DRAFT, 6, 'next')).toBe(6);
		expect(steppedClauseStop(DRAFT, null, 'previous')).toBe(PREAMBLE_STOP);
		expect(steppedClauseStop(DIRECTIVE, null, 'previous')).toBe(1);
	});

	it('is null for a paper with no clauses', () => {
		expect(steppedClauseStop({ preamble: 0, operative: 0 }, null, 'next')).toBeNull();
	});
});

describe('clausePositionText', () => {
	it('says which clause of how many, as the projector’s grey line', () => {
		expect(clausePositionText(DRAFT, 1)).toBe('Operative clause 1 of 6');
		expect(clausePositionText(DRAFT, PREAMBLE_STOP)).toBe('Preambulatory clauses');
	});
});

describe('screenStep', () => {
	it('says where the projector stands and which ways it can move', () => {
		expect(screenStep(DRAFT, null)).toEqual({
			position: 'Preambulatory clauses',
			hasPrevious: false,
			hasNext: true
		});
		expect(screenStep(DRAFT, 3)).toEqual({
			position: 'Operative clause 3 of 6',
			hasPrevious: true,
			hasNext: true
		});
		expect(screenStep(DRAFT, 6)).toMatchObject({ hasPrevious: true, hasNext: false });
	});

	it('cannot move in a paper of one clause, and is null for a paper with none', () => {
		expect(screenStep({ preamble: 0, operative: 1 }, null)).toEqual({
			position: 'Operative clause 1 of 1',
			hasPrevious: false,
			hasNext: false
		});
		expect(screenStep({ preamble: 0, operative: 0 }, null)).toBeNull();
	});
});

describe('subClauseLabel', () => {
	it('letters a sub-clause and numbers one below it in Roman numerals', () => {
		expect(subClauseLabel(2, 2)).toBe('(b)');
		expect(subClauseLabel(3, 3)).toBe('(iii)');
	});
});
