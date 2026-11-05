import { describe, expect, it } from 'vitest';
import { formatWarnings } from './resolution-checks';

describe('formatWarnings', () => {
	it('finds nothing in a draft written in the format', () => {
		const preamble = 'Recalling its resolution 78/241,\n\n*Our bloc* being concerned,';
		const operative = [
			'1. Calls upon all States to:',
			'   1. negotiate a treaty;',
			'   2. regulate other systems;',
			'2. ++Urges strongly++ restraint;',
			'3. Decides to remain seized of the matter.'
		].join('\n');

		expect(formatWarnings(preamble, operative)).toEqual([]);
	});

	it('names each clause that ends with the wrong mark, and the last clause', () => {
		const operative = '1. Calls upon all States;\n2. Urges restraint\n3. Decides to remain seized';

		expect(formatWarnings('Recalling its resolution.', operative)).toEqual([
			{
				clauseName: 'preambulatory clause 1',
				sentence: 'Preambulatory clause 1 should end with a comma.'
			},
			{ clauseName: 'clause 2', sentence: 'Clause 2 should end with a semicolon.' },
			{ clauseName: 'clause 3', sentence: 'The last clause should end with a full stop.' }
		]);
	});

	it('asks for an opening phrase in a clause but not in a sub-clause', () => {
		const operative = '1. Our bloc thinks:\n   1. that is all.';

		expect(formatWarnings('', operative)).toEqual([
			{ clauseName: 'clause 1', sentence: 'Clause 1 should start with an opening phrase.' }
		]);
	});

	it('asks for a colon before sub-clauses', () => {
		const operative = '1. Calls upon all States\n   1. to negotiate.';

		expect(formatWarnings('', operative).map((warning) => warning.sentence)).toEqual([
			'Clause 1 should end with a colon, before its sub-clauses.'
		]);
	});

	it('reads the mark before a closing quote or bracket, and skips a clause with no words', () => {
		const preamble = 'Recalling its resolution 2417 (2018),';
		const operative =
			'1. Calls upon all States to ban “killer robots”;\n2. \n3. Decides to remain seized.';

		expect(formatWarnings(preamble, operative)).toEqual([]);
	});

	it('has nothing to say about a text with no clauses', () => {
		expect(formatWarnings('', '')).toEqual([]);
	});
});
