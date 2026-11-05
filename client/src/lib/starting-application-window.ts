/**
 * The application window a new conference starts with.
 *
 * `/create` fills the window in so that an organiser does not have to type one
 * before publishing (`specs/05-pages/organiser/create.md`, "Streamlining"). The
 * organiser can change either end later on the Application form page.
 */

import { instantFromLocalDateTime } from '$lib/dates';
import { addDays } from '$lib/schedule';

/** When applications open and close, as ISO timestamps, or `null` for "not set". */
export type ApplicationWindow = {
	opensAt: string | null;
	closesAt: string | null;
};

/** No window at all: the answer when every closing day the rule allows has passed. */
const NO_WINDOW: ApplicationWindow = { opensAt: null, closesAt: null };

/** How many days before the first day applications close, when there is still time. */
const PREFERRED_DAYS_BEFORE_START = 7;

/** The time of day applications close, on the conference's own clock. */
const CLOSING_TIME = '23:59';

/** `YYYY-MM-DD`: the shape of a conference's first day. */
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The moment applications close if they close `daysBefore` days before
 * `startDate`, at 23:59 in the conference's timezone.
 */
function closingMoment(startDate: string, daysBefore: number, timeZone: string): string | null {
	const closingDay = addDays(startDate, -daysBefore);

	return instantFromLocalDateTime(`${closingDay}T${CLOSING_TIME}`, timeZone);
}

/**
 * The window a conference starting on `startDate` gets when it is created at `now`.
 *
 * It opens at `now` and closes at 23:59 in `timeZone` seven days before the
 * first day. When that moment has already passed it closes at 23:59 the day
 * before the first day instead, and when that has passed too there is no window
 * at all, so both ends are `null`. A draft takes no applications, so in effect
 * the window opens when the conference is published.
 *
 * `now` is passed in rather than read from the clock, so a test can say which
 * moment it is asking about.
 */
export function startingApplicationWindow(
	startDate: string,
	timeZone: string,
	now: Date
): ApplicationWindow {
	// Not a day at all, so there is nothing to count back from.
	if (!DAY_SHAPE.test(startDate)) {
		return NO_WINDOW;
	}

	const opensAt = now.toISOString();
	const closingChoices = [
		closingMoment(startDate, PREFERRED_DAYS_BEFORE_START, timeZone),
		closingMoment(startDate, 1, timeZone)
	];

	// The first closing moment that is still ahead of `now`, if any is.
	const closesAt = closingChoices.find(
		(moment) => moment !== null && new Date(moment).getTime() > now.getTime()
	);

	if (closesAt === undefined || closesAt === null) {
		return NO_WINDOW;
	}

	return { opensAt, closesAt };
}
