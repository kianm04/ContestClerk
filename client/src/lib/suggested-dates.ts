/**
 * The dates the next edition of a conference is suggested for (Trello
 * fe3reN7Y): the same weekday pattern in the same part of the month a year
 * later, for the same number of days. "Friday to Sunday, the third weekend of
 * April 2026" suggests "Friday to Sunday, the third weekend of April 2027",
 * not the dates exactly 365 days later, which would land on a Saturday.
 *
 * Every day is a `YYYY-MM-DD` string, and the arithmetic is done in UTC so a
 * clock change can never move a date by a day. Nothing here talks to Supabase
 * or knows any Svelte.
 */

import { addDays } from '$lib/schedule';

/** `YYYY-MM-DD`. */
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** A day read at midnight UTC, so weekday and month come out the same everywhere. */
function readDay(day: string): Date {
	return new Date(`${day}T00:00:00Z`);
}

/** `YYYY-MM-DD` of a moment, in UTC. */
function formatDay(moment: Date): string {
	return moment.toISOString().slice(0, 10);
}

/** How many whole days from `start` to `end`, 0 for the same day. */
function dayCount(start: string, end: string): number {
	const difference = readDay(end).getTime() - readDay(start).getTime();

	return Math.round(difference / 86_400_000);
}

/**
 * The first day a year on from `previousStart` that falls on the same weekday
 * and is the same occurrence of that weekday in its month: the third Friday of
 * April stays the third Friday of April. When that month has no such
 * occurrence (a fifth Friday), the last one is used.
 */
function sameWeekdayNextYear(previousStart: string): string {
	const start = readDay(previousStart);
	const weekday = start.getUTCDay();
	// The 1st to the 7th are the first occurrence, the 8th to the 14th the second, and so on.
	const occurrence = Math.ceil(start.getUTCDate() / 7);
	const year = start.getUTCFullYear() + 1;
	const month = start.getUTCMonth();

	const firstOfMonth = new Date(Date.UTC(year, month, 1));
	const daysUntilWeekday = (weekday - firstOfMonth.getUTCDay() + 7) % 7;
	let candidate = new Date(Date.UTC(year, month, 1 + daysUntilWeekday + (occurrence - 1) * 7));

	// A month with only four of that weekday has no fifth: fall back a week.
	if (candidate.getUTCMonth() !== month) {
		candidate = new Date(candidate.getTime() - 7 * 86_400_000);
	}

	return formatDay(candidate);
}

/** The suggested next edition, or `null` when the previous dates are not dates. */
export type SuggestedDates = {
	startDate: string;
	endDate: string;
};

/**
 * Next year's dates for a conference that ran from `previousStart` to
 * `previousEnd`: the same weekday, the same week of the month and the same
 * length. An end before its start, or anything that is not a day, gives `null`.
 */
export function suggestNextEditionDates(
	previousStart: string,
	previousEnd: string
): SuggestedDates | null {
	if (!DAY_SHAPE.test(previousStart) || !DAY_SHAPE.test(previousEnd)) {
		return null;
	}

	const length = dayCount(previousStart, previousEnd);

	if (length < 0) {
		return null;
	}

	const startDate = sameWeekdayNextYear(previousStart);

	return { startDate, endDate: addDays(startDate, length) };
}

/** "Fri – Sun (3 days)": the shape of a date span, which stays the same a year on. */
export function describeDateSpan(startDate: string, endDate: string): string {
	if (!DAY_SHAPE.test(startDate) || !DAY_SHAPE.test(endDate)) {
		return '';
	}

	const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' });
	const days = dayCount(startDate, endDate) + 1;
	const dayWord = days === 1 ? 'day' : 'days';

	if (days <= 1) {
		return `${weekday.format(readDay(startDate))} (1 day)`;
	}

	return `${weekday.format(readDay(startDate))} – ${weekday.format(readDay(endDate))} (${days} ${dayWord})`;
}
