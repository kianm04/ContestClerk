import { describe, expect, it } from 'vitest';
import {
	conferenceDateBlock,
	conferenceDayOfDays,
	dayAndFullMonth,
	startsInWords
} from './manage-list-dates';

describe('conferenceDateBlock', () => {
	it('writes the month once for a conference inside one month', () => {
		expect(conferenceDateBlock('2026-10-05', '2026-10-07')).toEqual({
			days: '5 – 7',
			monthAndYear: 'October 2026'
		});
	});

	it('writes one day for a one-day conference', () => {
		expect(conferenceDateBlock('2026-10-05', '2026-10-05')).toEqual({
			days: '5',
			monthAndYear: 'October 2026'
		});
	});

	it('names both months for a conference that crosses into the next', () => {
		expect(conferenceDateBlock('2026-10-30', '2026-11-02')).toEqual({
			days: '30 – 2',
			monthAndYear: 'Oct – Nov 2026'
		});
	});

	it('names both years for a conference that crosses a new year', () => {
		expect(conferenceDateBlock('2026-12-30', '2027-01-02')).toEqual({
			days: '30 – 2',
			monthAndYear: 'Dec 2026 – Jan 2027'
		});
	});
});

/** A conference in London from 5 to 7 October 2026. */
const CONFERENCE = { startDate: '2026-10-05', endDate: '2026-10-07', timezone: 'Europe/London' };

describe('startsInWords', () => {
	it('counts the days to a conference that starts soon', () => {
		expect(startsInWords(CONFERENCE, new Date('2026-10-02T09:00:00Z'))).toBe('starts in 3 days');
	});

	it('says tomorrow and today rather than one day and nought', () => {
		expect(startsInWords(CONFERENCE, new Date('2026-10-04T09:00:00Z'))).toBe('starts tomorrow');
		expect(startsInWords(CONFERENCE, new Date('2026-10-05T09:00:00Z'))).toBe('starts today');
	});

	it('counts the day where the conference is, not in UTC', () => {
		// 23:30 UTC on the 3rd is already the 4th in Tokyo, a day before the start.
		const tokyo = { ...CONFERENCE, timezone: 'Asia/Tokyo' };

		expect(startsInWords(tokyo, new Date('2026-10-03T23:30:00Z'))).toBe('starts tomorrow');
	});

	it('says nothing about a conference more than two weeks away, or already begun', () => {
		expect(startsInWords(CONFERENCE, new Date('2026-09-15T09:00:00Z'))).toBe('');
		expect(startsInWords(CONFERENCE, new Date('2026-10-06T09:00:00Z'))).toBe('');
	});
});

describe('dayAndFullMonth', () => {
	it('names the day where the conference is, with the whole month', () => {
		expect(dayAndFullMonth('2026-10-25T22:59:00Z', 'Europe/London')).toBe('25 October');
		// 23:30 UTC on the 31st is already 1 November in Tokyo.
		expect(dayAndFullMonth('2026-10-31T23:30:00Z', 'Asia/Tokyo')).toBe('1 November');
	});
});

describe('conferenceDayOfDays', () => {
	it('says which day of how many it is', () => {
		expect(conferenceDayOfDays(CONFERENCE, new Date('2026-10-06T09:00:00Z'))).toBe('day 2 of 3');
	});
});
