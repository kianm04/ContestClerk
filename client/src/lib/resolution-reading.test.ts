import { describe, expect, it } from 'vitest';
import { withOpeningPhraseMarked, withOpeningPhrasesMarked } from './resolution-reading';

describe('withOpeningPhrasesMarked', () => {
	it('marks a draft’s phrases, italic in the preamble and underlined on numbered clauses', () => {
		const text = [
			'Recalling its resolution 78/241,',
			'',
			'*Our bloc* believes,',
			'',
			'1. Calls upon all States:',
			'   1. negotiate;',
			'2. Decides to remain seized.'
		].join('\n');

		expect(withOpeningPhrasesMarked('draft_resolution', text)).toBe(
			[
				'*Recalling* its resolution 78/241,',
				'',
				'*Our bloc* believes,',
				'',
				'1. ++Calls upon++ all States:',
				'   1. negotiate;',
				'2. ++Decides++ to remain seized.'
			].join('\n')
		);
	});

	it('marks a directive as its operative part, and leaves a working paper as it was', () => {
		expect(withOpeningPhrasesMarked('committee_directive', '1. Requests a report.')).toBe(
			'1. ++Requests++ a report.'
		);
		expect(withOpeningPhrasesMarked('working_paper', 'Recalling the past.')).toBe(
			'Recalling the past.'
		);
	});

	it('leaves a phrase with formatting inside it alone', () => {
		expect(withOpeningPhrasesMarked('committee_directive', '1. Calls **upon** all.')).toBe(
			'1. Calls **upon** all.'
		);
	});
});

describe('withOpeningPhraseMarked', () => {
	it('marks one clause on its own, italic in the preamble and underlined in the operative part', () => {
		expect(withOpeningPhraseMarked('Recalling its resolution 78/241,', 'preamble')).toBe(
			'*Recalling* its resolution 78/241,'
		);
		expect(withOpeningPhraseMarked('Calls upon all States to act;', 'operative')).toBe(
			'++Calls upon++ all States to act;'
		);
	});

	it('leaves a sub-clause, which has no phrase, and a phrase marked already as they were', () => {
		expect(withOpeningPhraseMarked('negotiate a treaty;', 'operative')).toBe('negotiate a treaty;');
		expect(withOpeningPhraseMarked('*Calls upon* all States;', 'operative')).toBe(
			'*Calls upon* all States;'
		);
	});
});
