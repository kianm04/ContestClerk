import { describe, expect, it } from 'vitest';
import { numberInWords, numberInWordsCapitalised } from './number-words';

describe('numberInWords', () => {
	it('writes nought to ten as words', () => {
		expect(numberInWords(0)).toBe('no');
		expect(numberInWords(1)).toBe('one');
		expect(numberInWords(10)).toBe('ten');
	});

	it('keeps a larger count, or a negative one, as a figure', () => {
		expect(numberInWords(11)).toBe('11');
		expect(numberInWords(-1)).toBe('-1');
	});
});

describe('numberInWordsCapitalised', () => {
	it('starts the word with a capital letter', () => {
		expect(numberInWordsCapitalised(2)).toBe('Two');
		expect(numberInWordsCapitalised(0)).toBe('No');
	});

	it('leaves a figure as it is', () => {
		expect(numberInWordsCapitalised(12)).toBe('12');
	});
});
