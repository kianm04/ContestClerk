/**
 * How the When & where step writes its dates and times, in the words of the
 * product owner's design: "16 April 2027", "16 – 18 April 2027" and
 * "10:00 (10:00 AM)". The rest of the site shortens the month ("Apr"); this
 * step spells it out because the design does.
 *
 * The form keeps the plain formats ("2027-04-16",
 * "10:00") in hidden fields; these strings are only what the buttons show.
 * Nothing here talks to Supabase or knows any Svelte.
 */

// Read in UTC, so that "2027-04-16" stays the 16th wherever the browser is.
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'UTC',
	day: 'numeric',
	month: 'long',
	year: 'numeric'
});
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'UTC',
	day: 'numeric',
	month: 'long'
});

/** The day in a date field ("2027-04-16"), or `null` for an empty or broken one. */
function readDay(date: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const day = new Date(`${date}T00:00:00Z`);
	return Number.isNaN(day.getTime()) ? null : day;
}

/** "2027-04-16" as "16 April 2027"; an empty or broken field as "". */
export function longDate(date: string): string {
	const day = readDay(date);
	return day === null ? '' : DAY_MONTH_YEAR.format(day);
}

/**
 * Two days as one range: "16 – 18 April 2027" inside a month,
 * "30 April – 2 May 2027" across months, and both in full across a new year.
 */
export function longDateRange(startDate: string, endDate: string): string {
	const start = readDay(startDate);
	const end = readDay(endDate);
	if (start === null || end === null) return '';
	if (startDate === endDate) return DAY_MONTH_YEAR.format(start);

	// The dash is an en dash (–) with a space each side, as the design writes it.
	if (startDate.slice(0, 7) === endDate.slice(0, 7)) {
		return `${start.getUTCDate()} – ${DAY_MONTH_YEAR.format(end)}`;
	}
	if (startDate.slice(0, 4) === endDate.slice(0, 4)) {
		return `${DAY_MONTH.format(start)} – ${DAY_MONTH_YEAR.format(end)}`;
	}
	return `${DAY_MONTH_YEAR.format(start)} – ${DAY_MONTH_YEAR.format(end)}`;
}

/** "17:00" as "17:00 (5:00 PM)": the 24-hour clock first, the 12-hour one after it. */
export function bothClocks(time: string): string {
	const match = /^(\d{2}):(\d{2})/.exec(time);
	if (match === null) return '';
	const hours = Number(match[1]);
	const minutes = match[2];
	const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
	const half = hours < 12 ? 'AM' : 'PM';
	return `${match[1]}:${minutes} (${twelveHour}:${minutes} ${half})`;
}

/** Minutes between two choices in a time dropdown. */
const TIME_STEP_MINUTES = 15;

/**
 * The choices of a time dropdown: every quarter of an hour from 00:00 to
 * 23:45, written as "10:00 (10:00 AM)". A saved time between them, such as
 * "10:10", is added in its place, so the dropdown can always show it.
 */
export function timeOptions(savedTime: string): { value: string; label: string }[] {
	const times: string[] = [];
	for (let minutes = 0; minutes < 24 * 60; minutes += TIME_STEP_MINUTES) {
		const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
		const minute = String(minutes % 60).padStart(2, '0');
		times.push(`${hour}:${minute}`);
	}
	if (/^\d{2}:\d{2}$/.test(savedTime) && !times.includes(savedTime)) {
		times.push(savedTime);
		times.sort();
	}
	return times.map((time) => ({ value: time, label: bothClocks(time) }));
}
