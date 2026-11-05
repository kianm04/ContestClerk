import { describe, expect, it } from 'vitest';
import { initials, splitIntoParagraphs } from '$lib/text';

describe('splitIntoParagraphs', () => {
	it('splits on a blank line', () => {
		expect(splitIntoParagraphs('First one.\n\nSecond one.')).toEqual(['First one.', 'Second one.']);
	});

	it('keeps a single line break inside a paragraph', () => {
		expect(splitIntoParagraphs('One line\nand another')).toEqual(['One line\nand another']);
	});

	it('ignores extra blank lines and spaces around a paragraph', () => {
		expect(splitIntoParagraphs('  First.  \n \n\n  Second.  ')).toEqual(['First.', 'Second.']);
	});

	it('understands Windows line endings', () => {
		expect(splitIntoParagraphs('First.\r\n\r\nSecond.')).toEqual(['First.', 'Second.']);
	});

	it('gives an empty list for text that is only spaces', () => {
		expect(splitIntoParagraphs('   \n\n  ')).toEqual([]);
	});
});

describe('initials', () => {
	it('takes the first letter of the first two words', () => {
		expect(initials('Daniel Perez')).toBe('DP');
	});

	it('stops at two letters however many words there are', () => {
		expect(initials('The Hague International MUN')).toBe('TH');
	});

	it('gives one letter for a single word', () => {
		expect(initials('Amsterdam')).toBe('A');
	});

	it('gives nothing for empty text', () => {
		expect(initials('   ')).toBe('');
	});
});
