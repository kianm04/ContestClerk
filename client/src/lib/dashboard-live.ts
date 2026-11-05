/**
 * The panel at the top of the dashboard on a conference day: how many rooms
 * are sitting, what is on the programme now, and what comes next
 * (`specs/05-pages/organiser/dashboard.md`, "Conference days").
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import { countRoomsInSession, type DashboardRoom } from '$lib/dashboard-rooms';
import { isEventGoingOn, type TodayScheduleEvent } from '$lib/dashboard-today';
import { formatTimeOfDay } from '$lib/dates';
import type { StatusDotTone } from '$lib/manage-status';

/** Everything the panel says, already written. */
export type LivePanel = {
	/** "2 of 3 committees in session", or "No committee in session". */
	dotText: string;
	/** Blue while any room sits, grey otherwise. */
	dotTone: StatusDotTone;
	/** "Committee session III, until 12:30", or what the programme says instead. */
	headline: string;
	/** "Next: Lunch in Front hall at 12:30", or `null` when nothing else is on today. */
	nextLine: string | null;
};

/** "2 of 3 committees in session", or "No committee in session". */
function roomsInSessionText(rooms: DashboardRoom[]): string {
	const sitting = countRoomsInSession(rooms);

	if (sitting === 0) {
		return 'No committee in session';
	}

	const committees = rooms.length === 1 ? 'committee' : 'committees';

	return `${sitting} of ${rooms.length} ${committees} in session`;
}

/** The first event of today that has not started yet at `now`, if any. */
function nextEvent(events: TodayScheduleEvent[], now: Date): TodayScheduleEvent | null {
	const upcoming = events.find((event) => new Date(event.startsAt).getTime() > now.getTime());

	return upcoming ?? null;
}

/** "Next: Lunch in Front hall at 12:30", or "Next: Lunch at 12:30" without a place. */
function nextEventText(event: TodayScheduleEvent, timezone: string): string {
	const startsAt = formatTimeOfDay(event.startsAt, timezone);

	if (event.location === null) {
		return `Next: ${event.title} at ${startsAt}`;
	}

	return `Next: ${event.title} in ${event.location} at ${startsAt}`;
}

/**
 * What the programme says now: the event going on and when it ends, or how
 * long until the next one, or that nothing more is on today.
 */
function programmeHeadline(
	current: TodayScheduleEvent | null,
	next: TodayScheduleEvent | null,
	timezone: string
): string {
	if (current !== null) {
		return `${current.title}, until ${formatTimeOfDay(current.endsAt, timezone)}`;
	}

	if (next !== null) {
		return `Nothing on the programme until ${formatTimeOfDay(next.startsAt, timezone)}`;
	}

	return 'Nothing more on the programme today';
}

/**
 * The panel for `now`. `todayEvents` are today's events soonest first, as
 * `loadTodaySchedule` gives them. When two events overlap, the one that
 * started first is the one named as going on.
 */
export function livePanel(
	rooms: DashboardRoom[],
	todayEvents: TodayScheduleEvent[],
	now: Date,
	timezone: string
): LivePanel {
	const current = todayEvents.find((event) => isEventGoingOn(event, now)) ?? null;
	const next = nextEvent(todayEvents, now);
	const isAnyRoomSitting = countRoomsInSession(rooms) > 0;

	return {
		dotText: roomsInSessionText(rooms),
		dotTone: isAnyRoomSitting ? 'brand' : 'neutral',
		headline: programmeHeadline(current, next, timezone),
		nextLine: next === null ? null : nextEventText(next, timezone)
	};
}
