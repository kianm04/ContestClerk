/**
 * The conference dashboard's "Today" list on a conference day: every event of
 * today's programme, with the one in progress picked out
 * (`specs/05-pages/organiser/dashboard.md`, "Conference days").
 *
 * Nothing here talks to Supabase or knows any Svelte.
 * `$lib/server/dashboard-today.ts` reads the rows and hands them here.
 */

import { dayInTimezone, formatEventTime } from '$lib/dates';

/** One event of the conference's programme, as the dashboard reads it. */
export type TodayScheduleEvent = {
	id: string;
	title: string;
	/** An ISO timestamp. */
	startsAt: string;
	/** An ISO timestamp. Every event has an end in the schedule. */
	endsAt: string;
	/** Where it happens, such as "Front hall", or `null` when the organiser gave no place. */
	location: string | null;
	/** The committee's short name for a committee's own event, or `null` for the whole conference. */
	committeeName: string | null;
};

/** One line of the Today list, every word already written. */
export type TodayRow = {
	id: string;
	/** "13:30 – 15:00". */
	time: string;
	title: string;
	/** "UNSC · Council Chamber", or `null` when the event names neither. */
	place: string | null;
	/** Whether the event is going on right now, which the list draws in blue. */
	isCurrent: boolean;
};

/**
 * The events that start today where the conference is, soonest first.
 *
 * One that started yesterday and runs on is not "today's", so it is left out,
 * and so is anything that starts tomorrow.
 */
export function eventsOfToday(
	events: TodayScheduleEvent[],
	now: Date,
	timezone: string
): TodayScheduleEvent[] {
	const today = dayInTimezone(now, timezone);
	const eventsOfThisDay = events.filter(
		(event) => dayInTimezone(new Date(event.startsAt), timezone) === today
	);

	return [...eventsOfThisDay].sort(
		(first, second) => new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime()
	);
}

/** Whether the event has started and not yet ended at `now`. */
export function isEventGoingOn(event: TodayScheduleEvent, now: Date): boolean {
	const startsAt = new Date(event.startsAt).getTime();
	const endsAt = new Date(event.endsAt).getTime();

	return startsAt <= now.getTime() && now.getTime() < endsAt;
}

/** "UNSC · Council Chamber", "Front hall", "UNSC", or `null` when there is neither. */
function eventPlace(event: TodayScheduleEvent): string | null {
	const parts: string[] = [];

	if (event.committeeName !== null) {
		parts.push(event.committeeName);
	}

	if (event.location !== null) {
		parts.push(event.location);
	}

	if (parts.length === 0) {
		return null;
	}

	return parts.join(' · ');
}

/** Today's events as the list draws them, with the time and place written out. */
export function todayRows(events: TodayScheduleEvent[], now: Date, timezone: string): TodayRow[] {
	return events.map((event) => ({
		id: event.id,
		time: formatEventTime(event.startsAt, event.endsAt, timezone),
		title: event.title,
		place: eventPlace(event),
		isCurrent: isEventGoingOn(event, now)
	}));
}
