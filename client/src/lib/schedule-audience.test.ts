import { describe, expect, it } from 'vitest';
import { scheduleAudienceText } from './schedule-audience';

describe('scheduleAudienceText', () => {
	it('names the audiences that are not one committee', () => {
		expect(scheduleAudienceText({ audience: 'everyone', committeeAbbreviation: null })).toBe(
			'Everyone'
		);
		expect(scheduleAudienceText({ audience: 'delegates', committeeAbbreviation: null })).toBe(
			'Delegates only'
		);
		expect(scheduleAudienceText({ audience: 'staff', committeeAbbreviation: null })).toBe(
			'Staff only'
		);
	});

	it("names a committee event's committee by its short name", () => {
		expect(scheduleAudienceText({ audience: 'committee', committeeAbbreviation: 'UNSC' })).toBe(
			'UNSC'
		);
	});

	it('falls back to "One committee" when the committee has no short name', () => {
		expect(scheduleAudienceText({ audience: 'committee', committeeAbbreviation: null })).toBe(
			'One committee'
		);
	});
});
