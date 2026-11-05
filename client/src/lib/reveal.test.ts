import { describe, expect, it } from 'vitest';
import { isBelowTheFold, prefersReducedMotion, staggerDelay } from './reveal';

describe('isBelowTheFold', () => {
	it('leaves alone whatever is on the first screen', () => {
		expect(isBelowTheFold(300, 800)).toBe(false);
	});

	it('leaves alone a block just at the foot of the first screen, which the observer would count as in view', () => {
		expect(isBelowTheFold(720, 800)).toBe(false);
	});

	it('hides a block the reader has to scroll to', () => {
		expect(isBelowTheFold(1200, 800)).toBe(true);
	});
});

describe('prefersReducedMotion', () => {
	it('reads the answer off the media query', () => {
		expect(prefersReducedMotion(() => ({ matches: true }))).toBe(true);
		expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
	});

	it('asks for the reduced motion query and nothing else', () => {
		const asked: string[] = [];

		prefersReducedMotion((query) => {
			asked.push(query);
			return { matches: false };
		});

		expect(asked).toEqual(['(prefers-reduced-motion: reduce)']);
	});

	it('assumes nothing where the browser cannot be asked', () => {
		expect(prefersReducedMotion(undefined)).toBe(false);
	});
});

describe('staggerDelay', () => {
	it('starts the first item at once and spaces the rest 80ms apart', () => {
		expect(staggerDelay(0)).toBe(0);
		expect(staggerDelay(3)).toBe(240);
	});

	it('takes a different spacing when asked', () => {
		expect(staggerDelay(2, 120)).toBe(240);
	});
});
