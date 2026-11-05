import { describe, expect, it } from 'vitest';
import { isUuid } from './uuid';

describe('isUuid', () => {
	it('accepts an id written in either case', () => {
		expect(isUuid('6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b')).toBe(true);
		expect(isUuid('6F1A2B3C-4D5E-4F60-8A7B-9C0D1E2F3A4B')).toBe(true);
	});

	it('refuses anything that is not exactly one id', () => {
		expect(isUuid('')).toBe(false);
		expect(isUuid('committee-1')).toBe(false);
		// Spaces, braces and a trailing comma are all things an address can carry.
		expect(isUuid(' 6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b')).toBe(false);
		expect(isUuid('{6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b}')).toBe(false);
		expect(isUuid('6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b,x')).toBe(false);
		// The hyphens are part of the shape Postgres expects from us.
		expect(isUuid('6f1a2b3c4d5e4f608a7b9c0d1e2f3a4b')).toBe(false);
		expect(isUuid("' or 1=1")).toBe(false);
	});
});
