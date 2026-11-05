import { describe, expect, it } from 'vitest';
import { seatsAssignedText, seatsGivenText } from './delegation-seat-words';

const PROGRESS = { requested: 12, allocated: 10, assigned: 6, percentAssigned: 60 };

describe('seatsGivenText', () => {
	it('names the seats given out of the seats asked for', () => {
		expect(seatsGivenText(PROGRESS)).toBe('10 of 12 given');
	});

	it('says none have been given to a delegation still waiting', () => {
		const waiting = { requested: 12, allocated: 0, assigned: 0, percentAssigned: 0 };

		expect(seatsGivenText(waiting)).toBe('0 of 12 given');
	});
});

describe('seatsAssignedText', () => {
	it('names the seats the head has put somebody in', () => {
		expect(seatsAssignedText(PROGRESS)).toBe('6 assigned to members');
	});
});
