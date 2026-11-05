/**
 * The two ways a row of `/manage` (artboard Main of the manage redesign) talks
 * about a conference's dates: the block of dates at its left ("5 – 7" over
 * "October 2026") and the few words saying when it starts ("starts in 3 days",
 * "day 2 of 3").
 *
 * A conference's first and last day are plain `YYYY-MM-DD` dates with no time,
 * so they are formatted in UTC, which never moves them to the day before or
 * after. "Today" is worked out in the conference's own timezone, as
 * `conferencePhase` does.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { Conference } from '$lib/conferences';
import { dayInTimezone, daysBetween } from '$lib/dates';

/** Within how many days of its first day a row says "starts in N days". */
export const STARTS_SOON_DAYS = 14;

/** The two lines of the date block. */
export type DateBlock = {
	/** The days, large: "5 – 7", "5", or "30 – 2" across two months. */
	days: string;
	/** The month and year under them: "October 2026", "Oct – Nov 2026". */
	monthAndYear: string;
};

/** Read a `YYYY-MM-DD` date as midnight UTC, which every formatter below expects. */
function readDay(date: string): Date {
	return new Date(`${date}T00:00:00Z`);
}

/** One formatter of UTC dates, so each line below names only the parts it shows. */
function formatInUtc(date: string, options: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(readDay(date));
}

/**
 * The block of dates at the left of a row. Whatever the two days share is
 * written once: "5 – 7" over "October 2026" inside one month, "30 – 2" over
 * "Oct – Nov 2026" across two, and "30 – 2" over "Dec 2026 – Jan 2027" across
 * a new year. A one-day conference is "5" over "October 2026".
 */
export function conferenceDateBlock(startDate: string, endDate: string): DateBlock {
	const startDay = formatInUtc(startDate, { day: 'numeric' });
	const endDay = formatInUtc(endDate, { day: 'numeric' });

	// The dash is an en dash (–) with a space each side, as the style guide asks.
	const days = startDate === endDate ? startDay : `${startDay} – ${endDay}`;

	if (startDate.slice(0, 7) === endDate.slice(0, 7)) {
		return { days, monthAndYear: formatInUtc(startDate, { month: 'long', year: 'numeric' }) };
	}

	if (startDate.slice(0, 4) === endDate.slice(0, 4)) {
		const startMonth = formatInUtc(startDate, { month: 'short' });
		const endMonthAndYear = formatInUtc(endDate, { month: 'short', year: 'numeric' });

		return { days, monthAndYear: `${startMonth} – ${endMonthAndYear}` };
	}

	const startMonthAndYear = formatInUtc(startDate, { month: 'short', year: 'numeric' });
	const endMonthAndYear = formatInUtc(endDate, { month: 'short', year: 'numeric' });

	return { days, monthAndYear: `${startMonthAndYear} – ${endMonthAndYear}` };
}

/** The columns of a conference its dates are talked about from. */
export type ConferenceDayFields = Pick<Conference, 'startDate' | 'endDate' | 'timezone'>;

/**
 * "day 2 of 3": which day of the conference `now` falls on, where the
 * conference is. Only meaningful while it is running.
 */
export function conferenceDayOfDays(conference: ConferenceDayFields, now: Date): string {
	const today = dayInTimezone(now, conference.timezone);
	const dayNumber = daysBetween(conference.startDate, today) + 1;
	const dayCount = daysBetween(conference.startDate, conference.endDate) + 1;

	return `day ${dayNumber} of ${dayCount}`;
}

/**
 * When a conference that has not begun starts, in a few words: "starts
 * tomorrow", "starts in 3 days". Empty when it starts more than
 * `STARTS_SOON_DAYS` away, or has already started, because then the date block
 * says enough.
 */
export function startsInWords(conference: ConferenceDayFields, now: Date): string {
	const today = dayInTimezone(now, conference.timezone);
	const daysToGo = daysBetween(today, conference.startDate);

	if (daysToGo < 0 || daysToGo > STARTS_SOON_DAYS) {
		return '';
	}

	if (daysToGo === 0) {
		return 'starts today';
	}

	if (daysToGo === 1) {
		return 'starts tomorrow';
	}

	return `starts in ${daysToGo} days`;
}

/**
 * A moment as the day and the full month it falls on where the conference is:
 * "25 October". A row on `/manage` has room for the whole month, which reads
 * more easily than "25 Oct" in a sentence.
 */
export function dayAndFullMonth(moment: string, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'long' }).format(
		new Date(moment)
	);
}
