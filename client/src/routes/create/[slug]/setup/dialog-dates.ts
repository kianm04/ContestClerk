/**
 * The days and times the applications dialog's pickers show and send. The
 * form sends a day as `YYYY-MM-DD` and a moment as `YYYY-MM-DDTHH:mm`, both on
 * the conference's own clock, so nothing here moves between time zones.
 */

/** "2 April 2027" for `2027-04-02`, or `''` for anything that is not a day. */
export function formatPickedDay(day: string): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
	// Read and written in UTC, so the day never slips by the reader's own zone.
	return new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${day}T00:00:00Z`));
}

/**
 * The times of day the opening time can be, every half hour: `00:00`, `00:30`
 * ... `23:30`. A saved time between them (`09:15`) is added in its place, so
 * opening the dialog never changes it.
 */
export function openingTimes(savedTime: string): { value: string; label: string }[] {
	const times: string[] = [];
	for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
		const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
		times.push(`${hours}:${minutes % 60 === 0 ? '00' : '30'}`);
	}
	if (/^\d{2}:\d{2}$/.test(savedTime) && !times.includes(savedTime)) {
		times.push(savedTime);
		times.sort();
	}
	return times.map((time) => ({ value: time, label: time }));
}
