/**
 * Turning the dates and times in the database into the words on the screen.
 *
 * Two kinds of value arrive here. A `date` column is a plain `YYYY-MM-DD` with
 * no time and no timezone: the first day of a conference is the same day
 * wherever you read it from. A `timestamptz` column is an exact moment, and the
 * moment a session starts has to be shown in the conference's own timezone, not
 * in the reader's, or a delegate in another country turns up an hour late.
 *
 * So every function that deals with a moment asks for the timezone, and never
 * guesses it from the machine it happens to be running on. `Intl` does the
 * formatting; the project deliberately has no date library.
 *
 * The wording comes from `specs/03-design/writing-style.md`.
 */

/** How many milliseconds there are in a day, for counting days between two dates. */
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** One day's worth of something, ready to be shown under a heading. */
export type DayGroup<Item> = {
	/** The day itself, as `YYYY-MM-DD` in the timezone it was grouped by. */
	day: string;
	items: Item[];
};

/**
 * Pull the year, month and day out of a moment as they read in one timezone.
 *
 * `formatToParts` gives the pieces of a formatted date separately, which is the
 * only way to ask "what was the date in Amsterdam at this moment?" without
 * taking the formatted text apart again afterwards.
 */
function datePartsIn(moment: Date, timeZone: string): { year: string; month: string; day: string } {
	const formatter = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});

	const parts = formatter.formatToParts(moment);
	const valueOf = (type: 'year' | 'month' | 'day') =>
		parts.find((part) => part.type === type)?.value ?? '';

	return { year: valueOf('year'), month: valueOf('month'), day: valueOf('day') };
}

/** Which day a moment falls on in one timezone, as `YYYY-MM-DD`. */
export function dayInTimezone(moment: Date, timeZone: string): string {
	const { year, month, day } = datePartsIn(moment, timeZone);

	return `${year}-${month}-${day}`;
}

/**
 * Read a `YYYY-MM-DD` date as a moment.
 *
 * JavaScript reads a date written this way as midnight UTC, so everything built
 * from it is formatted with `timeZone: 'UTC'` further down. Formatting it in any
 * other zone would shift it to the day before or after.
 */
function readIsoDate(date: string): Date {
	return new Date(`${date}T00:00:00Z`);
}

/**
 * How many whole days later `date` is than `from`. Negative when it is earlier.
 *
 * Both are `YYYY-MM-DD` days, so the answer never depends on a timezone.
 */
export function daysBetween(from: string, date: string): number {
	const difference = readIsoDate(date).getTime() - readIsoDate(from).getTime();

	return Math.round(difference / MILLISECONDS_PER_DAY);
}

/**
 * The same day some months later, as `YYYY-MM-DD`: `2026-10-01` plus 3 is `2027-01-01`.
 *
 * A day the later month does not have becomes that month's last day, so
 * 31 August plus 6 months is the end of February rather than early March.
 */
export function addMonths(date: string, months: number): string {
	const start = readIsoDate(date);
	const year = start.getUTCFullYear();
	const month = start.getUTCMonth() + months;

	// Day 0 of the month after is the last day of this one.
	const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	const day = Math.min(start.getUTCDate(), lastDayOfMonth);

	return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/**
 * A conference's dates as one line: "12 – 15 Feb 2026".
 *
 * Whatever the two dates have in common is only written once, so a conference
 * inside one month reads "12 – 15 Feb 2026" and one that crosses a new year
 * reads "28 Dec 2026 – 2 Jan 2027". A one-day conference is just "12 Feb 2026".
 *
 * Both dates are `YYYY-MM-DD`.
 */
export function formatDateRange(startDate: string, endDate: string): string {
	const start = readIsoDate(startDate);
	const end = readIsoDate(endDate);

	const dayOnly = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric' });
	const dayAndMonth = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'UTC',
		day: 'numeric',
		month: 'short'
	});
	const full = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'UTC',
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});

	if (startDate === endDate) {
		return full.format(start);
	}

	// The dash is an en dash (–) with a space each side, as the style guide asks.
	const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
	const sameMonth = startDate.slice(0, 7) === endDate.slice(0, 7);

	if (sameMonth) {
		return `${dayOnly.format(start)} – ${full.format(end)}`;
	}

	if (sameYear) {
		return `${dayAndMonth.format(start)} – ${full.format(end)}`;
	}

	return `${full.format(start)} – ${full.format(end)}`;
}

/**
 * The time of an event in the conference's timezone: "13:30 – 15:00", or just
 * "13:30" when nothing says when it ends.
 *
 * `startsAt` and `endsAt` are ISO timestamps as Postgres returns them.
 */
export function formatEventTime(startsAt: string, endsAt: string | null, timeZone: string): string {
	// `hourCycle: 'h23'` is the 24-hour clock with a leading zero, so times line
	// up in a column and 13:30 never comes out as "1:30 pm".
	const time = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	});

	const start = time.format(new Date(startsAt));

	if (endsAt === null) {
		return start;
	}

	return `${start} – ${time.format(new Date(endsAt))}`;
}

/**
 * How long there is left until a deadline, for the task list on the dashboard:
 * "Overdue", "Today", "Tomorrow", or "In 5 days".
 *
 * `dueDate` is a `YYYY-MM-DD` deadline. `now` and `timeZone` are given rather
 * than read from the machine, because a pure function may not read the clock and
 * because "today" is a different day in different places.
 */
export function formatDueIn(dueDate: string, now: Date, timeZone: string): string {
	const today = dayInTimezone(now, timeZone);
	const days = daysBetween(today, dueDate);

	if (days < 0) {
		return 'Overdue';
	}

	if (days === 0) {
		return 'Today';
	}

	if (days === 1) {
		return 'Tomorrow';
	}

	return `In ${days} days`;
}

/**
 * How long ago something happened, for a notification: "Just now",
 * "2 minutes ago", "3 hours ago", "5 days ago", or the date itself once it is a
 * week old.
 *
 * `moment` is an ISO timestamp as Postgres returns it. `now` and `timeZone` are
 * given rather than read from the machine, because a pure function may not read
 * the clock and because the date it falls back to reads differently in
 * different places.
 *
 * A moment in the future reads "Just now". Notifications may be dated ahead of
 * time (an award announcement waits for the moment the organiser chose), and
 * although the database hides those until they are due, a clock a second out of
 * step should not produce "in -1 minutes".
 */
export function formatRelativeTime(moment: string, now: Date, timeZone: string): string {
	const secondsAgo = Math.round((now.getTime() - new Date(moment).getTime()) / 1000);
	const minutesAgo = Math.floor(secondsAgo / 60);
	const hoursAgo = Math.floor(minutesAgo / 60);
	const daysAgo = Math.floor(hoursAgo / 24);

	if (minutesAgo < 1) {
		return 'Just now';
	}

	if (minutesAgo < 60) {
		return countedAgo(minutesAgo, 'minute');
	}

	if (hoursAgo < 24) {
		return countedAgo(hoursAgo, 'hour');
	}

	if (daysAgo < 7) {
		return countedAgo(daysAgo, 'day');
	}

	return new Intl.DateTimeFormat('en-GB', {
		timeZone,
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(new Date(moment));
}

/** "1 hour ago" or "4 hours ago": the plural is the only thing that changes. */
function countedAgo(count: number, unit: 'minute' | 'hour' | 'day'): string {
	if (count === 1) {
		return `1 ${unit} ago`;
	}

	return `${count} ${unit}s ago`;
}

/**
 * A moment as the day and month it fell on in one timezone: "4 Oct".
 *
 * The members page of a delegation writes a join date this way. It leaves the
 * year out because everybody in one delegation joins it over a few weeks, and a
 * year repeated down every row of a list says nothing.
 *
 * `moment` is an ISO timestamp as Postgres returns it. The timezone is asked for
 * rather than read from the machine, for the reason the comment at the top of
 * this file gives: which day a moment falls on depends on where you read it.
 * `formatRelativeTime` above is the other way this file shortens a moment; that
 * one counts backwards from now, and this one only names the day.
 */
export function formatDayAndMonth(moment: string, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone,
		day: 'numeric',
		month: 'short'
	}).format(new Date(moment));
}

/**
 * A moment as the day and the time it falls on in one timezone:
 * "20 Jan 2027, 23:59". Used for a deadline, where the hour matters as much as
 * the day because a paper uploaded at midnight is a minute late.
 *
 * The 24-hour clock with a leading zero, like `formatEventTime` above.
 */
export function formatDayAndTime(moment: string, timeZone: string): string {
	const date = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(new Date(moment));
	const time = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(new Date(moment));

	return `${date}, ${time}`;
}

/**
 * A moment as the weekday, day and time it falls on in one timezone:
 * "Thu 1 Oct, 13:00". Used for an event coming up in the next few days, where
 * the weekday says more to a reader than the year does.
 */
export function formatWeekdayAndTime(moment: string, timeZone: string): string {
	const day = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	}).format(new Date(moment));

	return `${day}, ${formatTimeOfDay(moment, timeZone)}`;
}

/**
 * A moment as the weekday and the day it falls on in one timezone: "Tue 24 Sep".
 * Used by the conference dashboard's status card, where the year is plain from
 * the conference around it (T173).
 *
 * A `YYYY-MM-DD` day such as a conference's last day is written with
 * `formatWeekdayAndDay(`${day}T12:00:00Z`, 'UTC')`: noon in UTC is that same day.
 */
export function formatWeekdayAndDay(moment: string, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone,
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	}).format(new Date(moment));
}

/**
 * A moment as the time it falls on in one timezone: "09:02". Used where the day
 * is already known from around it, such as the roll calls of one session.
 *
 * The 24-hour clock with a leading zero, like `formatDayAndTime` above.
 */
export function formatTimeOfDay(moment: string, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(new Date(moment));
}

/**
 * Split a list into one group per day, keeping the order it arrived in.
 *
 * Used by the schedule and the notifications page, which both show a list under
 * a heading for each day. `momentOf` says which field holds the moment, so the
 * same function works for a schedule event and for a notification.
 */
export function groupByDay<Item>(
	items: Item[],
	momentOf: (item: Item) => string,
	timeZone: string
): DayGroup<Item>[] {
	const groups: DayGroup<Item>[] = [];

	for (const item of items) {
		const day = dayInTimezone(new Date(momentOf(item)), timeZone);
		const lastGroup = groups.at(-1);

		// The list is already in order, so a new day only ever starts a new group.
		if (lastGroup?.day === day) {
			lastGroup.items.push(item);
		} else {
			groups.push({ day, items: [item] });
		}
	}

	return groups;
}

/**
 * The heading above one of those groups: "Today", "Yesterday", or the date
 * itself, such as "12 Feb 2026".
 */
export function dayLabel(day: string, now: Date, timeZone: string): string {
	const today = dayInTimezone(now, timeZone);
	const days = daysBetween(today, day);

	if (days === 0) {
		return 'Today';
	}

	if (days === -1) {
		return 'Yesterday';
	}

	if (days === 1) {
		return 'Tomorrow';
	}

	return new Intl.DateTimeFormat('en-GB', {
		timeZone: 'UTC',
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(readIsoDate(day));
}

/** How many milliseconds there are in a minute, for working with timezone offsets. */
const MILLISECONDS_PER_MINUTE = 60 * 1000;

/** `YYYY-MM-DDTHH:mm`: the shape an `<input type="datetime-local">` sends. */
const LOCAL_DATE_TIME_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * What the clock in one timezone reads at a moment, as `YYYY-MM-DDTHH:mm`.
 *
 * This is the shape an `<input type="datetime-local">` wants, so it is how a
 * stored moment is put back into one of those boxes for editing. Always
 * zero-padded, always to the minute, never with seconds.
 */
export function localDateTimeInTimezone(moment: Date, timeZone: string): string {
	const day = dayInTimezone(moment, timeZone);

	// `hourCycle: 'h23'` is the 24-hour clock with a leading zero, which is what
	// the input expects: midnight has to read "00:00" rather than "12 am".
	const time = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(moment);

	return `${day}T${time}`;
}

/**
 * How far ahead of UTC a timezone's clock is at one moment, in milliseconds.
 * Negative for a zone behind UTC, such as New York.
 *
 * There is no `Intl` question that answers an offset directly, so it is worked
 * out: read what the zone's clock says at this moment, read that back as if it
 * were a UTC clock, and the difference between the two is the offset. The
 * reading has no seconds in it, so the moment is compared at the start of its
 * own minute rather than at the moment itself.
 */
function timezoneOffsetMilliseconds(moment: Date, timeZone: string): number {
	const clockReading = new Date(`${localDateTimeInTimezone(moment, timeZone)}:00Z`).getTime();
	const startOfMinute =
		Math.floor(moment.getTime() / MILLISECONDS_PER_MINUTE) * MILLISECONDS_PER_MINUTE;

	return clockReading - startOfMinute;
}

/**
 * Turn what somebody typed into an `<input type="datetime-local">` into the
 * exact moment it names in one timezone, as an ISO timestamp the database can
 * store. "2026-11-01T00:00" in `Europe/Amsterdam` is "2026-10-31T23:00:00.000Z".
 *
 * Answers `null` for anything that is not a `YYYY-MM-DDTHH:mm`, an empty box
 * included, so that the caller stores a null rather than an `Invalid Date`.
 *
 * The work is done in two passes, because a zone's offset depends on the very
 * moment we are trying to find:
 *
 *   1. Read the wall clock as if it were already UTC. That is the answer shifted
 *      by the zone's offset, and nothing else is wrong with it.
 *   2. Ask what that zone's clock reads at that shifted instant. The difference
 *      is the offset, and taking it off gives a first guess at the real moment.
 *   3. Ask once more at the first guess. On the two days a year a zone's clocks
 *      change, the guess can land on the other side of the change and so be an
 *      hour out; the offset that belongs to the guess is the one that names the
 *      moment the person meant.
 *
 * On those two days there are wall clock times that happen twice and times that
 * never happen at all. This answers one of the two for the first and the nearest
 * real moment for the second, which is what a browser's own date parsing does.
 */
export function instantFromLocalDateTime(localDateTime: string, timeZone: string): string | null {
	if (!LOCAL_DATE_TIME_SHAPE.test(localDateTime)) {
		return null;
	}

	const asIfUtc = new Date(`${localDateTime}:00Z`);
	const firstOffset = timezoneOffsetMilliseconds(asIfUtc, timeZone);
	const firstGuess = new Date(asIfUtc.getTime() - firstOffset);
	const secondOffset = timezoneOffsetMilliseconds(firstGuess, timeZone);

	return new Date(asIfUtc.getTime() - secondOffset).toISOString();
}

/** A date of birth is stored as `YYYY-MM-DD`, the shape `ageInYears` below reads. */
const BIRTH_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How many whole years old somebody born on this date is, or `null` when the
 * date is missing or is not a date at all.
 *
 * The organiser's delegation review page shows a member's age beside their
 * dietary requirements, because both are facts a conference has to plan around
 * and a date of birth on its own makes the reader do the arithmetic.
 *
 * It counts in plain calendar parts rather than in milliseconds, so leap years
 * and daylight saving cannot move an answer by a day: a birthday that has not
 * come round yet this year takes one off the difference between the two years.
 * No timezone is involved, because a date of birth is a day and not a moment.
 *
 * `now` is passed in rather than read from the clock here so that a test can
 * say which day it is asking about.
 */
export function ageInYears(dateOfBirth: string | null, now: Date): number | null {
	if (dateOfBirth === null || !BIRTH_DATE_SHAPE.test(dateOfBirth)) {
		return null;
	}

	const [birthYear, birthMonth, birthDay] = dateOfBirth.split('-').map(Number);

	// `getUTCMonth` counts from zero, so one is added to compare it with the
	// month written in the date of birth.
	const thisYear = now.getUTCFullYear();
	const thisMonth = now.getUTCMonth() + 1;
	const thisDay = now.getUTCDate();

	let age = thisYear - birthYear;
	const birthdayHasPassed =
		thisMonth > birthMonth || (thisMonth === birthMonth && thisDay >= birthDay);

	if (!birthdayHasPassed) {
		age = age - 1;
	}

	// A date in the future is somebody's typo rather than an age.
	if (age < 0) {
		return null;
	}

	return age;
}
