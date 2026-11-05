import { describe, expect, it } from 'vitest';
import { readTypedSpeakingTime } from './speaking-time';

describe('readTypedSpeakingTime', () => {
	it('reads a time typed the MUN way', () => {
		expect(readTypedSpeakingTime('1:30')).toBe(90);
		expect(readTypedSpeakingTime('90s')).toBe(90);
		// A bare number is minutes.
		expect(readTypedSpeakingTime('2')).toBe(120);
		expect(readTypedSpeakingTime(' 0:45 ')).toBe(45);
	});

	it('accepts 30 seconds and 5 minutes, the two ends', () => {
		expect(readTypedSpeakingTime('0:30')).toBe(30);
		expect(readTypedSpeakingTime('5:00')).toBe(300);
	});

	it('refuses a time outside 30 seconds to 5 minutes', () => {
		expect(readTypedSpeakingTime('0:29')).toBeNull();
		expect(readTypedSpeakingTime('5:01')).toBeNull();
		expect(readTypedSpeakingTime('6')).toBeNull();
	});

	it('refuses text that is not a time, and a missing field', () => {
		expect(readTypedSpeakingTime('soon')).toBeNull();
		expect(readTypedSpeakingTime('')).toBeNull();
		expect(readTypedSpeakingTime(null)).toBeNull();
	});
});
