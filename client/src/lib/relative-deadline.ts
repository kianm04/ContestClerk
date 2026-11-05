/**
 * An application deadline that moves with the conference (Trello fe3reN7Y).
 *
 * A new draft closes applications "2 weeks before the conference" rather than
 * on a day the organiser has to pick, and when the conference moves, the
 * deadline moves with it. The database stores the rule (`application_close_rule`
 * and `application_close_offset_days`) beside the absolute moment it works out
 * to (`applications_close_at`), so every page that already reads the absolute
 * moment keeps working. Only this file knows how one is turned into the other.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { addDays } from '$lib/schedule';
import { instantFromLocalDateTime } from '$lib/dates';

/** How many days before the first day a new draft closes applications. */
export const DEFAULT_CLOSE_OFFSET_DAYS = -14;

/** The time of day applications close, on the conference's own clock. */
const CLOSING_TIME = '23:59';

/** `YYYY-MM-DD`. */
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** The offsets the When & where step offers, each with its words. */
export const CLOSE_OFFSET_OPTIONS: { value: string; label: string }[] = [
	{ value: '-7', label: '1 week before the conference' },
	{ value: '-14', label: '2 weeks before the conference' },
	{ value: '-21', label: '3 weeks before the conference' },
	{ value: '-28', label: '4 weeks before the conference' },
	{ value: '-42', label: '6 weeks before the conference' },
	{ value: '-56', label: '8 weeks before the conference' }
];

/**
 * "2 weeks before conference", "10 days before conference", "the day the
 * conference starts": the words for an offset, which is zero or negative.
 */
export function relativeDeadlineLabel(offsetDays: number): string {
	const daysBefore = -offsetDays;

	if (daysBefore <= 0) {
		return 'the day the conference starts';
	}

	if (daysBefore % 7 === 0) {
		const weeks = daysBefore / 7;

		return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} before conference`;
	}

	return `${daysBefore} ${daysBefore === 1 ? 'day' : 'days'} before conference`;
}

/**
 * The moment applications close when they close `offsetDays` days (zero or
 * negative) from `startDate`, at 23:59 in `timeZone`. `null` when the start
 * date is not a day yet, because there is nothing to count back from.
 */
export function relativeDeadlineInstant(
	startDate: string,
	offsetDays: number,
	timeZone: string
): string | null {
	if (!DAY_SHAPE.test(startDate)) {
		return null;
	}

	const closingDay = addDays(startDate, offsetDays);

	return instantFromLocalDateTime(`${closingDay}T${CLOSING_TIME}`, timeZone);
}

/** Whether a deadline has already gone by at `now`. A missing deadline never has. */
export function isDeadlinePast(deadline: string | null, now: Date): boolean {
	if (deadline === null) {
		return false;
	}

	return new Date(deadline).getTime() <= now.getTime();
}

/**
 * A closing offset that still lies ahead of `now` for a conference starting
 * on `startDate`: the offset asked for when it does, otherwise the nearest
 * shorter one, down to the day before the conference. `null` when even that
 * day has gone, which means the conference itself is about to start or has.
 *
 * The step never silently saves a deadline in the past: when the asked-for
 * one is, it says so and offers what this suggests.
 */
export function nearestFutureOffset(
	startDate: string,
	offsetDays: number,
	timeZone: string,
	now: Date
): number | null {
	const candidates = [offsetDays, -7, -3, -1].filter(
		(candidate, index, list) => candidate <= 0 && list.indexOf(candidate) === index
	);

	for (const candidate of candidates.sort((first, second) => first - second)) {
		const moment = relativeDeadlineInstant(startDate, candidate, timeZone);

		if (moment !== null && !isDeadlinePast(moment, now)) {
			return candidate;
		}
	}

	return null;
}

/** The whole number of days a form sent, or the default when it sent nonsense or a positive number. */
export function readCloseOffsetDays(text: string): number {
	const offset = Number(text);

	if (!Number.isInteger(offset) || offset > 0) {
		return DEFAULT_CLOSE_OFFSET_DAYS;
	}

	return offset;
}
