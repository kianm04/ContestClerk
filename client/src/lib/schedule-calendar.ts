/**
 * The arithmetic behind the calendar on a schedule page: one column per day,
 * hours down the side, and each event a block whose top and height follow its
 * start and end, the way a desktop calendar draws a week.
 *
 * Everything here is pure: the moment, the events and the timezone are handed
 * in, and positions come back as minutes and hours, which the components turn
 * into pixels with the page's hour height. The delegate's schedule, the
 * organiser's editor and the tests all share these rules.
 *
 * Every time is read on the conference's own clock, for the reason the comment
 * at the top of `$lib/dates.ts` gives.
 */

import { daysBetween, formatTimeOfDay, localDateTimeInTimezone } from '$lib/dates';
import { formatEventTime, isHappeningNow, type ScheduleEvent } from '$lib/schedule';

/** The first hour every calendar shows, so a quiet morning still looks like a day. */
const DEFAULT_FIRST_HOUR = 8;

/** The last hour every calendar shows, which covers an evening social. */
const DEFAULT_LAST_HOUR = 23;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/**
 * The shortest an event is drawn. A five-minute roll call would otherwise be a
 * sliver nobody could read or press.
 */
const SHORTEST_DRAWN_MINUTES = 20;

/** An event this long or shorter is drawn on one line: title, time and badge side by side. */
const SHORT_EVENT_MINUTES = 45;

/** Whether an event is over, on now, or still to come, which decides its colours. */
export type EventState = 'past' | 'now' | 'upcoming';

/** The hours a calendar runs down its side, such as 08:00 to 23:00. */
export type CalendarHours = {
	firstHour: number;
	lastHour: number;
};

/** One event placed in its day's column. */
export type PlacedEvent<Event extends ScheduleEvent = ScheduleEvent> = {
	event: Event;
	/** Minutes after midnight that the block starts, on the conference's clock. */
	startMinute: number;
	/** Minutes after midnight that the block ends. An event running past midnight stops at 24:00. */
	endMinute: number;
	/** Which of the side-by-side columns it takes when it shares its time with others, from 0. */
	column: number;
	/** How many events share the width with it, itself included. 1 when it has the column alone. */
	columnCount: number;
};

/** The words above one day's column: "Friday", "2", and "Today · Day 2". */
export type CalendarDayLabels = {
	/** "Friday". */
	weekday: string;
	/** "Fri", for the narrow strip of days on a phone. */
	shortWeekday: string;
	/** The day of the month, "2", in its circle. */
	dayOfMonth: string;
	/** "Day 2", "Today · Day 2", or the month for a day outside the conference's dates. */
	note: string;
};

/** A `YYYY-MM-DD` day as a moment at midnight UTC, the way `$lib/dates.ts` reads one. */
function readDay(day: string): Date {
	return new Date(`${day}T00:00:00Z`);
}

/**
 * How many minutes after the start of `day` a moment falls, on the
 * conference's clock. A moment on a later day counts as the end of this one,
 * so an event that runs past midnight is drawn to the foot of its column.
 */
export function minuteOfDay(moment: string, day: string, timezone: string): number {
	const wallClock = localDateTimeInTimezone(new Date(moment), timezone);
	const momentDay = wallClock.slice(0, 10);

	if (momentDay > day) {
		return MINUTES_PER_DAY;
	}

	if (momentDay < day) {
		return 0;
	}

	const hours = Number(wallClock.slice(11, 13));
	const minutes = Number(wallClock.slice(14, 16));

	return hours * MINUTES_PER_HOUR + minutes;
}

/**
 * The hours the calendar runs down its side: 08:00 to 23:00, stretched to take
 * in any event that starts earlier or ends later, so nothing is cut off.
 */
export function calendarHours(events: ScheduleEvent[], timezone: string): CalendarHours {
	let firstHour = DEFAULT_FIRST_HOUR;
	let lastHour = DEFAULT_LAST_HOUR;

	for (const event of events) {
		const day = localDateTimeInTimezone(new Date(event.startsAt), timezone).slice(0, 10);
		const startMinute = minuteOfDay(event.startsAt, day, timezone);
		const endMinute = Math.max(
			minuteOfDay(event.endsAt, day, timezone),
			startMinute + SHORTEST_DRAWN_MINUTES
		);

		firstHour = Math.min(firstHour, Math.floor(startMinute / MINUTES_PER_HOUR));
		lastHour = Math.max(lastHour, Math.ceil(endMinute / MINUTES_PER_HOUR));
	}

	return { firstHour, lastHour: Math.min(lastHour, 24) };
}

/** The labels down the calendar's side, one per hour: "08:00", "09:00" and on to the last. */
export function hourLabels(hours: CalendarHours): string[] {
	const labels: string[] = [];

	for (let hour = hours.firstHour; hour <= hours.lastHour; hour += 1) {
		labels.push(`${String(hour).padStart(2, '0')}:00`);
	}

	return labels;
}

/**
 * Place one day's events in its column.
 *
 * Events whose times overlap share the width, side by side, the way a desktop
 * calendar shows two committee sessions at once. Each event takes the first
 * column that is free when it starts; a group of events that overlap one
 * another all split the width by the most columns any of them needed.
 */
export function placeEventsOnDay<Event extends ScheduleEvent>(
	events: Event[],
	day: string,
	timezone: string
): PlacedEvent<Event>[] {
	const placed = events
		.map((event) => {
			const startMinute = minuteOfDay(event.startsAt, day, timezone);
			const endMinute = Math.min(
				Math.max(minuteOfDay(event.endsAt, day, timezone), startMinute + SHORTEST_DRAWN_MINUTES),
				MINUTES_PER_DAY
			);

			return { event, startMinute, endMinute, column: 0, columnCount: 1 };
		})
		// Earliest first, and the longer of two that start together on the left.
		.sort(
			(first, second) =>
				first.startMinute - second.startMinute || second.endMinute - first.endMinute
		);

	// The events that overlap one another, directly or through a third, and the
	// minute each of their columns is free again.
	let group: PlacedEvent<Event>[] = [];
	let columnEnds: number[] = [];
	let groupEnd = 0;

	const closeGroup = () => {
		for (const member of group) {
			member.columnCount = columnEnds.length;
		}

		group = [];
		columnEnds = [];
	};

	for (const entry of placed) {
		if (entry.startMinute >= groupEnd) {
			closeGroup();
		}

		const freeColumn = columnEnds.findIndex((columnEnd) => columnEnd <= entry.startMinute);
		entry.column = freeColumn === -1 ? columnEnds.length : freeColumn;
		columnEnds[entry.column] = entry.endMinute;
		group.push(entry);
		groupEnd = Math.max(groupEnd, entry.endMinute);
	}

	closeGroup();

	return placed;
}

/** Whether a placed event is drawn on a single line rather than as a tall block. */
export function isShortEvent(placed: PlacedEvent): boolean {
	return placed.endMinute - placed.startMinute <= SHORT_EVENT_MINUTES;
}

/**
 * How far down the calendar a minute of the day sits, in hours from the top.
 * A component multiplies it by its hour height to get pixels.
 */
export function hoursFromTop(minute: number, hours: CalendarHours): number {
	return (minute - hours.firstHour * MINUTES_PER_HOUR) / MINUTES_PER_HOUR;
}

/** Whether an event is over, on now, or still to come. */
export function eventState(event: ScheduleEvent, now: Date): EventState {
	if (isHappeningNow(event, now)) {
		return 'now';
	}

	return new Date(event.endsAt).getTime() <= now.getTime() ? 'past' : 'upcoming';
}

/**
 * Where the line that marks now sits: minutes after midnight on the
 * conference's clock, or `null` when now is not on this day or falls outside
 * the hours the calendar shows.
 */
export function nowMinute(
	day: string,
	now: Date,
	timezone: string,
	hours: CalendarHours
): number | null {
	const wallClock = localDateTimeInTimezone(now, timezone);

	if (wallClock.slice(0, 10) !== day) {
		return null;
	}

	const minute = minuteOfDay(now.toISOString(), day, timezone);
	const isShown =
		minute >= hours.firstHour * MINUTES_PER_HOUR && minute <= hours.lastHour * MINUTES_PER_HOUR;

	return isShown ? minute : null;
}

/** The words above one day's column, such as "Friday", "2" and "Today · Day 2". */
export function calendarDayLabels(
	day: string,
	today: string,
	startDate: string,
	endDate: string
): CalendarDayLabels {
	// The day is a date with no time, read at midnight UTC, so it is formatted in
	// UTC too; any other zone could name the day before.
	const format = (options: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(readDay(day));

	const isConferenceDay = day >= startDate && day <= endDate;
	const dayName = isConferenceDay
		? `Day ${daysBetween(startDate, day) + 1}`
		: format({ month: 'long' });

	return {
		weekday: format({ weekday: 'long' }),
		shortWeekday: format({ weekday: 'short' }),
		dayOfMonth: format({ day: 'numeric' }),
		note: day === today ? `Today · ${dayName}` : dayName
	};
}

/** When an event is, written out in full for its details: "Friday 2 October · 20:00 – 23:00". */
export function eventDetailDate(event: ScheduleEvent, timezone: string): string {
	const date = new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	}).format(new Date(event.startsAt));

	return `${date} · ${formatEventTime(event, timezone)}`;
}

/** "Now, until 12:30", in the time column of the event that is on. */
export function nowUntilText(event: ScheduleEvent, timezone: string): string {
	return `Now, until ${formatTimeOfDay(event.endsAt, timezone)}`;
}

/**
 * The words beside "Your room: UNSC": what that committee has on today. The
 * session that is on, "Committee session II is on until 12:30", or else the
 * next one, "Committee session III starts at 14:00". `null` when the committee
 * has nothing more today.
 */
export function roomStatusText(
	committeeId: string,
	events: ScheduleEvent[],
	now: Date,
	timezone: string
): string | null {
	const today = localDateTimeInTimezone(now, timezone).slice(0, 10);
	const committeeEvents = events.filter((event) => event.committeeId === committeeId);

	const current = committeeEvents.find((event) => isHappeningNow(event, now));

	if (current) {
		return `${current.title} is on until ${formatTimeOfDay(current.endsAt, timezone)}`;
	}

	const next = committeeEvents.find((event) => {
		const startsAt = new Date(event.startsAt);
		const startDay = localDateTimeInTimezone(startsAt, timezone).slice(0, 10);

		return startsAt.getTime() > now.getTime() && startDay === today;
	});

	if (next) {
		return `${next.title} starts at ${formatTimeOfDay(next.startsAt, timezone)}`;
	}

	return null;
}

/** One day's column of the calendar, with its events already placed. */
export type CalendarColumn<Event extends ScheduleEvent = ScheduleEvent> = {
	/** `YYYY-MM-DD`. The `{#each}` over columns is keyed on it. */
	day: string;
	labels: CalendarDayLabels;
	isToday: boolean;
	/** The day a phone shows, which the `?day=` in the address chose. */
	isActive: boolean;
	events: PlacedEvent<Event>[];
	/** Where the line that marks now sits, or `null` on any other day. */
	nowMinute: number | null;
};

/** What `calendarColumns` needs to know about the programme and the moment. */
export type CalendarSetting = {
	timezone: string;
	/** Today on the conference's clock, `YYYY-MM-DD`. */
	today: string;
	/** The day a phone shows. */
	activeDay: string;
	/** The conference's own first and last days, for "Day 2". */
	startDate: string;
	endDate: string;
	now: Date;
	hours: CalendarHours;
};

/** One column for each day of the programme, each holding the events that start on it. */
export function calendarColumns<Event extends ScheduleEvent>(
	days: string[],
	events: Event[],
	setting: CalendarSetting
): CalendarColumn<Event>[] {
	const { timezone, today, activeDay, startDate, endDate, now, hours } = setting;

	return days.map((day) => {
		const dayEvents = events.filter(
			(event) => localDateTimeInTimezone(new Date(event.startsAt), timezone).slice(0, 10) === day
		);

		return {
			day,
			labels: calendarDayLabels(day, today, startDate, endDate),
			isToday: day === today,
			isActive: day === activeDay,
			events: placeEventsOnDay(dayEvents, day, timezone),
			nowMinute: nowMinute(day, now, timezone, hours)
		};
	});
}

/** Whether `?view=` in the address asks for the list rather than the calendar. */
export function isListView(view: string | null): boolean {
	return view === 'list';
}

/** The words for each audience in an event's details. A committee event names its committee. */
const AUDIENCE_DETAIL_TEXT: Record<ScheduleEvent['audience'], string> = {
	everyone: 'For everyone',
	delegates: 'For delegates',
	staff: 'For staff',
	committee: 'For one committee'
};

/** Who an event is for, in its details: "For everyone", or "For UNSC" for one committee's. */
export function eventAudienceText(event: ScheduleEvent): string {
	if (event.audience === 'committee' && event.committeeAbbreviation) {
		return `For ${event.committeeAbbreviation}`;
	}

	return AUDIENCE_DETAIL_TEXT[event.audience];
}
