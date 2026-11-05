import { describe, expect, it } from 'vitest';
import { creationClasses } from './creation-classes';

describe('creationClasses', () => {
	it('lets a later design size replace an earlier one', () => {
		expect(creationClasses('fs-16 lh-24', 'fs-15 lh-21')).toBe('fs-15 lh-21');
	});

	it("replaces Tailwind's own text size with a design size, and the other way round", () => {
		expect(creationClasses('text-sm', 'fs-17')).toBe('fs-17');
		expect(creationClasses('fs-17', 'text-sm')).toBe('text-sm');
		expect(creationClasses('leading-none', 'lh-38')).toBe('lh-38');
	});

	it('still merges everything cn merges, and drops a condition that is off', () => {
		const isHidden = false;
		expect(creationClasses('pt-4.5 pr-5 pb-5 pl-5', 'pb-4', isHidden && 'hidden')).toBe(
			'pt-4.5 pr-5 pl-5 pb-4'
		);
	});
});
