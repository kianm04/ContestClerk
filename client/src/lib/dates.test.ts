import { describe, expect, it } from 'vitest';
import {
	addMonths,
	ageInYears,
	dayInTimezone,
	dayLabel,
	daysBetween,
	formatDateRange,
	formatDayAndMonth,
	formatDayAndTime,
	formatDueIn,
	formatEventTime,
	formatRelativeTime,
	formatTimeOfDay,
	formatWeekdayAndDay,
	formatWeekdayAndTime,
	groupByDay,
	instantFromLocalDateTime,
	localDateTimeInTimezone
} from './dates';

/** The conference timezone used throughout these tests. */
const AMSTERDAM = 'Europe/Amsterdam';

describe('formatDateRange', () => {
	it('writes the month and the year once when both days share them', () => {
		expect(formatDateRange('2026-02-12', '2026-02-15')).toBe('12 – 15 Feb 2026');
	});

	it('writes both months when the conference crosses one', () => {
		expect(formatDateRange('2026-02-28', '2026-03-03')).toBe('28 Feb – 3 Mar 2026');
	});

	it('writes both years when the conference crosses one', () => {
		expect(formatDateRange('2026-12-28', '2027-01-02')).toBe('28 Dec 2026 – 2 Jan 2027');
	});

	it('writes a one-day conference as a single date', () => {
		expect(formatDateRange('2026-02-12', '2026-02-12')).toBe('12 Feb 2026');
	});

	it('does not slip to the day before', () => {
		// A `YYYY-MM-DD` is midnight UTC, which is the previous evening in New
		// York. Formatting it in any zone but UTC would print the wrong day.
		expect(formatDateRange('2026-01-01', '2026-01-01')).toBe('1 Jan 2026');
	});
});

describe('formatEventTime', () => {
	it('shows the time in the conference timezone, not in UTC', () => {
		// 12:30 UTC in January is 13:30 in Amsterdam.
		expect(formatEventTime('2026-01-15T12:30:00Z', '2026-01-15T14:00:00Z', AMSTERDAM)).toBe(
			'13:30 – 15:00'
		);
	});

	it('shows only the start when nothing says when it ends', () => {
		expect(formatEventTime('2026-01-15T12:30:00Z', null, AMSTERDAM)).toBe('13:30');
	});

	it('uses the 24-hour clock with a leading zero', () => {
		expect(formatEventTime('2026-01-15T08:05:00Z', null, AMSTERDAM)).toBe('09:05');
	});
});

describe('dayInTimezone', () => {
	it('gives the day as it reads in that timezone', () => {
		// In June this moment is 23:30 in London, half past midnight the next day
		// in Amsterdam, and half past six the previous evening in New York.
		const moment = new Date('2026-06-01T22:30:00Z');

		expect(dayInTimezone(moment, 'Europe/London')).toBe('2026-06-01');
		expect(dayInTimezone(moment, AMSTERDAM)).toBe('2026-06-02');
		expect(dayInTimezone(moment, 'America/New_York')).toBe('2026-06-01');
	});
});

describe('daysBetween', () => {
	it('counts whole days forward, backward and across a month and a clock change', () => {
		expect(daysBetween('2026-09-27', '2026-09-29')).toBe(2);
		expect(daysBetween('2026-09-29', '2026-09-27')).toBe(-2);
		expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
		// The clocks go back in Europe on 25 October 2026; the answer is still 1.
		expect(daysBetween('2026-10-24', '2026-10-25')).toBe(1);
		expect(daysBetween('2026-09-28', '2026-09-28')).toBe(0);
	});
});

describe('addMonths', () => {
	it('moves to the same day of a later month, across a new year too', () => {
		expect(addMonths('2026-10-01', 3)).toBe('2027-01-01');
		expect(addMonths('2026-10-01', 12)).toBe('2027-10-01');
		expect(addMonths('2026-03-15', 0)).toBe('2026-03-15');
	});

	it('stops at the end of a shorter month', () => {
		expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
		expect(addMonths('2027-08-31', 6)).toBe('2028-02-29');
		expect(addMonths('2026-12-31', 3)).toBe('2027-03-31');
	});
});

describe('formatDueIn', () => {
	/** Midday on 12 February 2026, so no test sits near midnight by accident. */
	const now = new Date('2026-02-12T12:00:00Z');

	it('counts the days left', () => {
		expect(formatDueIn('2026-02-17', now, AMSTERDAM)).toBe('In 5 days');
	});

	it('names today and tomorrow instead of counting them', () => {
		expect(formatDueIn('2026-02-12', now, AMSTERDAM)).toBe('Today');
		expect(formatDueIn('2026-02-13', now, AMSTERDAM)).toBe('Tomorrow');
	});

	it('says a passed deadline is overdue', () => {
		expect(formatDueIn('2026-02-11', now, AMSTERDAM)).toBe('Overdue');
		expect(formatDueIn('2025-12-01', now, AMSTERDAM)).toBe('Overdue');
	});
});

describe('groupByDay', () => {
	/** A notification, cut down to the one field this function reads. */
	type Notification = { id: string; createdAt: string };

	const momentOf = (notification: Notification) => notification.createdAt;

	it('puts everything from one day in one group', () => {
		const rows: Notification[] = [
			{ id: 'a', createdAt: '2026-02-12T09:00:00Z' },
			{ id: 'b', createdAt: '2026-02-12T17:00:00Z' },
			{ id: 'c', createdAt: '2026-02-11T08:00:00Z' }
		];

		expect(groupByDay(rows, momentOf, AMSTERDAM)).toEqual([
			{ day: '2026-02-12', items: [rows[0], rows[1]] },
			{ day: '2026-02-11', items: [rows[2]] }
		]);
	});

	it('groups by the day in the given timezone', () => {
		// In June, 22:30 UTC is still the same evening in London but already the
		// next day in Amsterdam, so the same two moments group differently.
		const rows: Notification[] = [
			{ id: 'a', createdAt: '2026-06-01T10:00:00Z' },
			{ id: 'b', createdAt: '2026-06-01T22:30:00Z' }
		];

		expect(groupByDay(rows, momentOf, 'Europe/London')).toHaveLength(1);
		expect(groupByDay(rows, momentOf, AMSTERDAM)).toHaveLength(2);
	});

	it('gives back nothing for an empty list', () => {
		expect(groupByDay([], momentOf, AMSTERDAM)).toEqual([]);
	});
});

describe('dayLabel', () => {
	const now = new Date('2026-02-12T12:00:00Z');

	it('names the days around today', () => {
		expect(dayLabel('2026-02-12', now, AMSTERDAM)).toBe('Today');
		expect(dayLabel('2026-02-11', now, AMSTERDAM)).toBe('Yesterday');
		expect(dayLabel('2026-02-13', now, AMSTERDAM)).toBe('Tomorrow');
	});

	it('writes the date for anything further away', () => {
		expect(dayLabel('2026-02-09', now, AMSTERDAM)).toBe('9 Feb 2026');
		expect(dayLabel('2026-03-01', now, AMSTERDAM)).toBe('1 Mar 2026');
	});
});

describe('formatRelativeTime', () => {
	const now = new Date('2026-02-12T12:00:00Z');

	it('says "Just now" for anything under a minute old', () => {
		expect(formatRelativeTime('2026-02-12T12:00:00Z', now, AMSTERDAM)).toBe('Just now');
		expect(formatRelativeTime('2026-02-12T11:59:30Z', now, AMSTERDAM)).toBe('Just now');
	});

	it('says "Just now" for a moment that has not arrived yet', () => {
		// An award notification is dated ahead of time, and a clock a second out
		// of step should never produce "in -1 minutes".
		expect(formatRelativeTime('2026-02-12T12:05:00Z', now, AMSTERDAM)).toBe('Just now');
	});

	it('counts the minutes, then the hours, then the days', () => {
		expect(formatRelativeTime('2026-02-12T11:59:00Z', now, AMSTERDAM)).toBe('1 minute ago');
		expect(formatRelativeTime('2026-02-12T11:30:00Z', now, AMSTERDAM)).toBe('30 minutes ago');
		expect(formatRelativeTime('2026-02-12T11:00:00Z', now, AMSTERDAM)).toBe('1 hour ago');
		expect(formatRelativeTime('2026-02-12T10:00:00Z', now, AMSTERDAM)).toBe('2 hours ago');
		expect(formatRelativeTime('2026-02-11T12:00:00Z', now, AMSTERDAM)).toBe('1 day ago');
		expect(formatRelativeTime('2026-02-09T12:00:00Z', now, AMSTERDAM)).toBe('3 days ago');
	});

	it('writes the date once a week has gone by', () => {
		expect(formatRelativeTime('2026-02-04T12:00:00Z', now, AMSTERDAM)).toBe('4 Feb 2026');
	});

	it('reads that date in the timezone it is given', () => {
		// Half past midnight in Amsterdam is still the evening before in New York.
		const moment = '2026-01-01T23:30:00Z';

		expect(formatRelativeTime(moment, now, AMSTERDAM)).toBe('2 Jan 2026');
		expect(formatRelativeTime(moment, now, 'America/New_York')).toBe('1 Jan 2026');
	});
});

describe('formatWeekdayAndTime', () => {
	it('names the weekday, the day, the month and the time in the timezone it is given', () => {
		// 11:00 UTC is 13:00 in Amsterdam in October, on a Thursday.
		expect(formatWeekdayAndTime('2026-10-01T11:00:00Z', AMSTERDAM)).toBe('Thu 1 Oct, 13:00');
	});
});

describe('formatDayAndTime', () => {
	it('names the day, the month, the year and the time on a 24-hour clock', () => {
		// 22:59 in London is 23:59 in Amsterdam in January.
		expect(formatDayAndTime('2027-01-20T22:59:00Z', AMSTERDAM)).toBe('20 Jan 2027, 23:59');
	});

	it('reads the day in the timezone it is given', () => {
		expect(formatDayAndTime('2027-01-20T23:30:00Z', AMSTERDAM)).toBe('21 Jan 2027, 00:30');
	});
});

describe('formatTimeOfDay', () => {
	it('names the time on a 24-hour clock with a leading zero', () => {
		// 08:02 in London is 09:02 in Amsterdam in February.
		expect(formatTimeOfDay('2026-02-14T08:02:00Z', AMSTERDAM)).toBe('09:02');
	});

	it('reads midnight as 00, not 24', () => {
		expect(formatTimeOfDay('2026-02-14T23:05:00Z', AMSTERDAM)).toBe('00:05');
	});
});

describe('formatDayAndMonth', () => {
	it('names the day and the month, and leaves the year out', () => {
		expect(formatDayAndMonth('2026-10-04T09:00:00Z', AMSTERDAM)).toBe('4 Oct');
	});

	it('does not pad the day out to two digits', () => {
		expect(formatDayAndMonth('2026-10-09T09:00:00Z', AMSTERDAM)).toBe('9 Oct');
	});

	it('reads the day in the timezone it is given', () => {
		// Half past midnight in Amsterdam is still the evening before in New York,
		// so the same moment is two different days in the two places.
		const moment = '2026-10-04T23:30:00Z';

		expect(formatDayAndMonth(moment, AMSTERDAM)).toBe('5 Oct');
		expect(formatDayAndMonth(moment, 'America/New_York')).toBe('4 Oct');
	});
});

describe('localDateTimeInTimezone', () => {
	it('reads the clock in that timezone rather than in UTC', () => {
		// 12:30 UTC in January is 13:30 in Amsterdam and 07:30 in New York.
		const moment = new Date('2026-01-15T12:30:00Z');

		expect(localDateTimeInTimezone(moment, AMSTERDAM)).toBe('2026-01-15T13:30');
		expect(localDateTimeInTimezone(moment, 'America/New_York')).toBe('2026-01-15T07:30');
	});

	it('writes midnight as 00:00 on the day the clock has reached', () => {
		expect(localDateTimeInTimezone(new Date('2026-10-31T23:00:00Z'), AMSTERDAM)).toBe(
			'2026-11-01T00:00'
		);
	});

	it('writes minutes and never seconds, which is what the input wants', () => {
		expect(localDateTimeInTimezone(new Date('2026-01-15T08:05:45Z'), AMSTERDAM)).toBe(
			'2026-01-15T09:05'
		);
	});
});

describe('instantFromLocalDateTime', () => {
	it('reads what was typed as a wall clock in that timezone', () => {
		expect(instantFromLocalDateTime('2026-11-01T00:00', AMSTERDAM)).toBe(
			'2026-10-31T23:00:00.000Z'
		);
		expect(instantFromLocalDateTime('2026-01-15T07:30', 'America/New_York')).toBe(
			'2026-01-15T12:30:00.000Z'
		);
	});

	it('uses the offset of that time of year, not one offset all year round', () => {
		// Amsterdam is an hour ahead of UTC in the winter and two in the summer.
		expect(instantFromLocalDateTime('2026-07-01T12:00', AMSTERDAM)).toBe(
			'2026-07-01T10:00:00.000Z'
		);
	});

	it('lands on the right side of a daylight-saving change', () => {
		// Amsterdam clocks go forward at 02:00 on 29 March 2026. Half past one
		// that morning is still winter time, an hour ahead of UTC, and only the
		// second pass over the offset gets that right.
		expect(instantFromLocalDateTime('2026-03-29T01:30', AMSTERDAM)).toBe(
			'2026-03-29T00:30:00.000Z'
		);
		expect(instantFromLocalDateTime('2026-03-29T03:00', AMSTERDAM)).toBe(
			'2026-03-29T01:00:00.000Z'
		);
	});

	it('leaves a moment alone when the timezone is UTC itself', () => {
		expect(instantFromLocalDateTime('2026-01-15T12:30', 'UTC')).toBe('2026-01-15T12:30:00.000Z');
	});

	it('gives back nothing for an empty box, so a null is stored', () => {
		expect(instantFromLocalDateTime('', AMSTERDAM)).toBeNull();
	});

	it('gives back nothing for anything that is not a date and a time', () => {
		expect(instantFromLocalDateTime('2026-11-01', AMSTERDAM)).toBeNull();
		expect(instantFromLocalDateTime('2026-11-01T00:00:00', AMSTERDAM)).toBeNull();
		expect(instantFromLocalDateTime('tomorrow', AMSTERDAM)).toBeNull();
	});

	it('comes back to what was typed when it is read out again', () => {
		const typed = '2026-11-01T09:45';
		const stored = instantFromLocalDateTime(typed, AMSTERDAM) ?? '';

		expect(localDateTimeInTimezone(new Date(stored), AMSTERDAM)).toBe(typed);
	});
});

describe('ageInYears', () => {
	// Every test in this block asks about the same day, so the answer does not
	// change with the day the test happens to run.
	const NOW = new Date('2026-09-22T12:00:00Z');

	it('counts a birthday that has already come round this year', () => {
		expect(ageInYears('2008-04-12', NOW)).toBe(18);
	});

	it("counts one year fewer while this year's birthday is still ahead", () => {
		expect(ageInYears('2008-11-20', NOW)).toBe(17);
	});

	it('answers null for a member who never gave a date of birth', () => {
		expect(ageInYears(null, NOW)).toBeNull();
	});

	it('answers null for text that is not a YYYY-MM-DD date at all', () => {
		expect(ageInYears('12 April 2008', NOW)).toBeNull();
	});

	it('answers null for a date of birth in the future, which is a typo rather than an age', () => {
		expect(ageInYears('2027-01-01', NOW)).toBeNull();
	});
});

describe('formatWeekdayAndDay', () => {
	it('writes the weekday, the day and the short month where the moment falls', () => {
		// Intl writes September as "Sept" in British English.
		expect(formatWeekdayAndDay('2026-09-24T12:00:00Z', 'UTC')).toBe('Thu 24 Sept');
	});

	it('uses the day of the timezone asked for, not the one in UTC', () => {
		// Half past eleven at night in UTC is already Friday in Amsterdam.
		expect(formatWeekdayAndDay('2026-10-01T23:30:00Z', AMSTERDAM)).toBe('Fri 2 Oct');
	});
});
