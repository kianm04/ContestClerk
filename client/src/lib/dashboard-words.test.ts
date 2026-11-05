import { describe, expect, it } from 'vitest';
import { countOf, listInWords } from './dashboard-words';

describe('countOf', () => {
	it('uses the singular for exactly one and the plural otherwise', () => {
		expect(countOf(1, 'seat is', 'seats are')).toBe('1 seat is');
		expect(countOf(3, 'seat is', 'seats are')).toBe('3 seats are');
		expect(countOf(0, 'seat is', 'seats are')).toBe('0 seats are');
	});
});

describe('listInWords', () => {
	it('joins names with commas and a last "and"', () => {
		expect(listInWords(['Ana'])).toBe('Ana');
		expect(listInWords(['Ana', 'Ben'])).toBe('Ana and Ben');
		expect(listInWords(['Ana', 'Ben', 'Cleo'])).toBe('Ana, Ben and Cleo');
	});
});
