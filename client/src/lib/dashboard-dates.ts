/**
 * The long dates the conference dashboard writes in its sentences: "Sunday
 * 25 October" and "25 October" (`specs/05-pages/organiser/dashboard.md`).
 *
 * `$lib/dates` writes the short forms the rest of the app uses ("Sun 25 Oct");
 * a sentence under the page title has the room for the words in full.
 */

/** "Sunday 25 October": a moment's day, read in `timeZone`, with the weekday and month in full. */
export function formatLongDay(moment: string, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone,
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	}).format(new Date(moment));
}

/** "25 October": a moment's day, read in `timeZone`, with the month in full. */
export function formatDayAndLongMonth(moment: string, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone,
		day: 'numeric',
		month: 'long'
	}).format(new Date(moment));
}

/**
 * A `YYYY-MM-DD` day as a moment both functions above can read with `'UTC'`.
 * Noon in UTC is the same day as the date it is written from, wherever the
 * conference is.
 */
export function noonOfDay(day: string): string {
	return `${day}T12:00:00Z`;
}

/** "later today", "tomorrow" or "in 12 days": how far off a day is, counted in days. */
export function countdownText(daysToGo: number): string {
	if (daysToGo <= 0) {
		return 'later today';
	}

	if (daysToGo === 1) {
		return 'tomorrow';
	}

	return `in ${daysToGo} days`;
}
