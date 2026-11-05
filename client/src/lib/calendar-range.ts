/**
 * Between the date fields of a form ("2027-04-16") and the calendar shadcn
 * draws (`RangeCalendar`), which works in `CalendarDate`s from
 * `@internationalized/date`: a day with no time and no timezone.
 *
 * The text fields stay the real form fields, so a form works without
 * JavaScript; the calendar only reads them and writes back into them.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { parseDate, type CalendarDate } from '@internationalized/date';

/** The day in `text`, or `undefined` for an empty or broken field. */
export function calendarDay(text: string): CalendarDate | undefined {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
		return undefined;
	}

	// `parseDate` throws for a day that does not exist, such as 31 February.
	try {
		return parseDate(text);
	} catch {
		return undefined;
	}
}

/** The two fields as the range the calendar shows, half empty while half picked. */
export function calendarRange(
	startDate: string,
	endDate: string
): { start: CalendarDate | undefined; end: CalendarDate | undefined } {
	return { start: calendarDay(startDate), end: calendarDay(endDate) };
}

/**
 * The month the calendar opens on: the first day picked, else the suggested
 * one, else today's (`today` as "2026-10-04").
 */
export function calendarOpeningDay(
	startDate: string,
	suggestedDate: string | null,
	today: string
): CalendarDate {
	return (
		calendarDay(startDate) ??
		calendarDay(suggestedDate ?? '') ??
		calendarDay(today) ??
		parseDate('2000-01-01')
	);
}
