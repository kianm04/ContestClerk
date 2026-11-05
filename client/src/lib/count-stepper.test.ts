import { describe, expect, it } from 'vitest';
import { readTypedCount, steppedCount } from './count-stepper';

describe('readTypedCount', () => {
	it('reads a whole number of 0 or more, spaces around it or not', () => {
		expect(readTypedCount('0')).toBe(0);
		expect(readTypedCount('12')).toBe(12);
		expect(readTypedCount(' 7 ')).toBe(7);
	});

	it('reads an empty field, and anything that is not a whole number, as not counted', () => {
		expect(readTypedCount('')).toBeNull();
		expect(readTypedCount('4.5')).toBeNull();
		expect(readTypedCount('-1')).toBeNull();
		expect(readTypedCount('four')).toBeNull();
	});
});

describe('steppedCount', () => {
	it('adds and takes away one', () => {
		expect(steppedCount(4, 1)).toBe(5);
		expect(steppedCount(4, -1)).toBe(3);
	});

	it('never goes below 0', () => {
		expect(steppedCount(0, -1)).toBe(0);
	});

	it('starts an uncounted field at 1 on +, and leaves it empty on −', () => {
		expect(steppedCount(null, 1)).toBe(1);
		expect(steppedCount(null, -1)).toBeNull();
	});
});
