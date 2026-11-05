/**
 * The rules of a conference's programme: which events somebody may see, which
 * days the programme has, and how an event's time is written.
 *
 * Everything here is pure, so the organiser's editor, the delegate's schedule
 * page and the tests all share one copy of each rule. The queries that fill
 * these shapes are in `$lib/server/schedule.ts`; the forms of the editor are in
 * `$lib/schedule-form.ts`.
 *
 * Every moment is an ISO timestamp as Postgres returns it, and every function
 * that turns one into a day or a time asks for the conference's timezone, for
 * the reason the comment at the top of `$lib/dates.ts` gives.
 */

import {
	dayInTimezone,
	formatEventTime as formatTimeRange,
	groupByDay,
	instantFromLocalDateTime,
	localDateTimeInTimezone,
	type DayGroup
} from '$lib/dates';
import type { Database } from '$lib/database.types';

/** Who an event is meant for. `delegation` is in the enum but never on an event. */
export type EventAudience = Exclude<Database['public']['Enums']['audience'], 'delegation'>;

/** One event on a conference's programme, as every schedule page holds it. */
export type ScheduleEvent = {
	/** The event's id. The `{#each}` blocks over events are keyed on it. */
	id: string;
	conferenceId: string;
	title: string;
	description: string | null;
	/** The room or address the organisers wrote, or `null` when they wrote none. */
	location: string | null;
	startsAt: string;
	endsAt: string;
	audience: EventAudience;
	/** Set exactly when `audience` is `committee`, which a check in the database insists on. */
	committeeId: string | null;
	/** The committee's short name, such as `UNSC`, for its badge. `null` for other audiences. */
	committeeAbbreviation: string | null;
};

/**
 * How one reader is involved in one conference, which decides the events they see.
 *
 * `isParticipant` is a seat or a delegation membership, the two ways
 * `05-pages/delegate/schedule.md` names. `committeeIds` holds the committees the
 * reader sits in or chairs, because a committee's events are for both.
 */
export type AudienceMembership = {
	/** Runs the conference, and so sees the whole programme. */
	isOrganiser: boolean;
	isParticipant: boolean;
	/** Has any `conference_staff` row here, whatever roles they hold. */
	isStaff: boolean;
	committeeIds: string[];
};

/**
 * Whether somebody is part of a conference at all: an organiser, a participant
 * or a member of staff. It is who may read the conference's announcements
 * (`05-pages/delegate/announcements.md`), so the announcements page asks it
 * before answering with a 404, and the conference page asks it before
 * offering a link there.
 */
export function isConferenceMember(membership: AudienceMembership): boolean {
	return membership.isOrganiser || membership.isParticipant || membership.isStaff;
}

/** Somebody with no role at a conference: a visitor reading its public programme. */
export const NO_MEMBERSHIP: AudienceMembership = {
	isOrganiser: false,
	isParticipant: false,
	isStaff: false,
	committeeIds: []
};

/** One tab of a programme: a day, and how many events it has. */
export type ScheduleDay = {
	/** `YYYY-MM-DD` in the conference's timezone. */
	day: string;
	count: number;
	/** True for a day before or after the conference's own dates that has events on it. */
	isOutsideDates: boolean;
};

/** How far ahead of an event a change to it notifies its audience. */
const NOTIFY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How many milliseconds there are in a day, for walking from one date to the next. */
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** The words on each audience's badge. A committee event shows its abbreviation instead. */
const AUDIENCE_LABELS: Record<EventAudience, string> = {
	everyone: 'Everyone',
	delegates: 'Delegates',
	staff: 'Staff',
	committee: 'Committee'
};

/**
 * Split a programme into one group per day in the conference's timezone.
 *
 * The events have to arrive in order of their start, which every query in
 * `$lib/server/schedule.ts` asks for. An event that runs past midnight belongs
 * to the day it starts on.
 */
export function groupEventsByDay(
	events: ScheduleEvent[],
	timezone: string
): DayGroup<ScheduleEvent>[] {
	return groupByDay(events, (event) => event.startsAt, timezone);
}

/** Whether one event is meant for somebody involved in the conference in this way. */
function isForMember(event: ScheduleEvent, membership: AudienceMembership): boolean {
	if (membership.isOrganiser) {
		return true;
	}

	if (event.audience === 'everyone') {
		return membership.isParticipant || membership.isStaff;
	}

	if (event.audience === 'delegates') {
		return membership.isParticipant;
	}

	if (event.audience === 'staff') {
		return membership.isStaff;
	}

	return event.committeeId !== null && membership.committeeIds.includes(event.committeeId);
}

/**
 * The events one reader is meant to see, in the order they arrived.
 *
 * A delegate sees `everyone`, `delegates` and their own committee's events. A
 * chair or volunteer sees `everyone`, `staff` and the committee they chair. An
 * organiser sees everything. Row Level Security already withholds most of what
 * this leaves out; this is what the page promises on top of it, and the one
 * place that says so in words a reviewer can check.
 */
export function eventsForAudience<Event extends ScheduleEvent>(
	events: Event[],
	membership: AudienceMembership
): Event[] {
	return events.filter((event) => isForMember(event, membership));
}

/** The first event that has not started yet, or `null` when there is none. */
export function nextEvent<Event extends ScheduleEvent>(events: Event[], now: Date): Event | null {
	let soonest: Event | null = null;

	for (const event of events) {
		const startsAt = new Date(event.startsAt).getTime();

		if (startsAt <= now.getTime()) {
			continue;
		}

		if (soonest === null || startsAt < new Date(soonest.startsAt).getTime()) {
			soonest = event;
		}
	}

	return soonest;
}

/** A `YYYY-MM-DD` day as a moment at midnight UTC, the way `$lib/dates.ts` reads one. */
function readDay(day: string): Date {
	return new Date(`${day}T00:00:00Z`);
}

/** The day after (or before, for a negative count) a `YYYY-MM-DD` day. */
export function addDays(day: string, count: number): string {
	const moved = new Date(readDay(day).getTime() + count * MILLISECONDS_PER_DAY);

	return moved.toISOString().slice(0, 10);
}

/**
 * When an event is, in its conference's timezone: "13:30 – 15:00".
 *
 * An event that runs past midnight is listed on the day it starts, so its end
 * says which day it is on: "23:00 → 01:30 (next day)", or the date itself for
 * one that runs longer than that.
 */
export function formatEventTime(event: ScheduleEvent, timezone: string): string {
	const startDay = dayInTimezone(new Date(event.startsAt), timezone);
	const endDay = dayInTimezone(new Date(event.endsAt), timezone);

	if (startDay === endDay) {
		return formatTimeRange(event.startsAt, event.endsAt, timezone);
	}

	const startTime = formatTimeRange(event.startsAt, null, timezone);
	const endTime = formatTimeRange(event.endsAt, null, timezone);

	if (endDay === addDays(startDay, 1)) {
		return `${startTime} → ${endTime} (next day)`;
	}

	return `${startTime} → ${endTime} (${dayTabLabel(endDay)})`;
}

/** The words on an event's audience badge: the committee's abbreviation, or "Staff". */
export function audienceBadgeLabel(event: ScheduleEvent): string {
	if (event.audience === 'committee') {
		return event.committeeAbbreviation ?? AUDIENCE_LABELS.committee;
	}

	return AUDIENCE_LABELS[event.audience];
}

/**
 * Whether a delegate-facing card shows an audience badge.
 *
 * A delegate sees a badge on the events that are not for everybody: their
 * committee's, and for staff the staff ones. Staff and organisers, whose
 * programme mixes every audience, see one on every event.
 */
export function showsAudienceBadge(event: ScheduleEvent, showsEveryAudience: boolean): boolean {
	if (showsEveryAudience) {
		return true;
	}

	return event.audience === 'committee' || event.audience === 'staff';
}

/** The words on a day tab: "Fri 12 Feb". */
export function dayTabLabel(day: string): string {
	// The day is a date with no time, read at midnight UTC, so it is formatted in
	// UTC too; any other zone could name the day before.
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: 'UTC',
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	}).format(readDay(day));
}

/**
 * Every day a programme has a tab for: each day from `startDate` to `endDate`,
 * plus any other day an event starts on, in order, each with its count.
 */
export function scheduleDays(
	startDate: string,
	endDate: string,
	events: ScheduleEvent[],
	timezone: string
): ScheduleDay[] {
	const counts = new Map<string, number>();

	for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
		counts.set(day, 0);
	}

	for (const event of events) {
		const day = dayInTimezone(new Date(event.startsAt), timezone);
		counts.set(day, (counts.get(day) ?? 0) + 1);
	}

	const days = [...counts.keys()].sort();

	return days.map((day) => ({
		day,
		count: counts.get(day) ?? 0,
		isOutsideDates: day < startDate || day > endDate
	}));
}

/**
 * Which day tab is open.
 *
 * The one `?day=` names when it is one of the tabs; otherwise today while the
 * conference is on, and its first day before or after it.
 */
export function pickScheduleDay(
	requestedDay: string | null,
	days: ScheduleDay[],
	today: string,
	startDate: string,
	endDate: string
): string {
	const isTab = (day: string | null) => days.some((tab) => tab.day === day);

	if (requestedDay !== null && isTab(requestedDay)) {
		return requestedDay;
	}

	if (today >= startDate && today <= endDate) {
		return today;
	}

	return startDate;
}

/** The events that start on one day in the conference's timezone. */
export function eventsOnDay<Event extends ScheduleEvent>(
	events: Event[],
	day: string,
	timezone: string
): Event[] {
	return events.filter((event) => dayInTimezone(new Date(event.startsAt), timezone) === day);
}

/** Whether an event is on at this moment: it has started and has not ended yet. */
export function isHappeningNow(event: ScheduleEvent, now: Date): boolean {
	const hasStarted = new Date(event.startsAt).getTime() <= now.getTime();
	const hasEnded = new Date(event.endsAt).getTime() <= now.getTime();

	return hasStarted && !hasEnded;
}

/**
 * The same moment a number of days later on the conference's own clock.
 *
 * "Duplicate to next day" keeps 09:00 at 09:00 across a clock change, which
 * adding 24 hours would not: the wall clock is moved and read back as a moment.
 */
export function shiftByDays(moment: string, days: number, timezone: string): string {
	const wallClock = localDateTimeInTimezone(new Date(moment), timezone);
	const shiftedDay = addDays(wallClock.slice(0, 10), days);
	const shifted = instantFromLocalDateTime(`${shiftedDay}${wallClock.slice(10)}`, timezone);

	// `localDateTimeInTimezone` always writes the shape the other reads, so a
	// `null` here would be a bug in `$lib/dates.ts` rather than bad input.
	if (shifted === null) {
		throw new Error(`Could not move ${moment} by ${days} days in ${timezone}.`);
	}

	return shifted;
}

/** What `willNotifyAudience` compares: the three fields `notify_schedule_changed` watches. */
export type EventTiming = Pick<ScheduleEvent, 'startsAt' | 'endsAt' | 'location'>;

/** Whether a moment falls within the next 24 hours. */
function isWithinNotifyWindow(moment: string, now: Date): boolean {
	const time = new Date(moment).getTime();

	return time >= now.getTime() && time <= now.getTime() + NOTIFY_WINDOW_MS;
}

/**
 * Whether saving this change makes the database tell the event's audience.
 *
 * The same rule as the `notify_schedule_changed` trigger, so that the flash
 * after a save can say "Its audience has been notified." only when it was: the
 * start, the end or the place changed, and the event started, or now starts,
 * within the next 24 hours.
 */
export function willNotifyAudience(before: EventTiming, after: EventTiming, now: Date): boolean {
	const hasMoved =
		new Date(before.startsAt).getTime() !== new Date(after.startsAt).getTime() ||
		new Date(before.endsAt).getTime() !== new Date(after.endsAt).getTime() ||
		before.location !== after.location;

	if (!hasMoved) {
		return false;
	}

	return isWithinNotifyWindow(before.startsAt, now) || isWithinNotifyWindow(after.startsAt, now);
}

/** A committee as the schedule editor offers it: to pick for an event, or to tick for sessions. */
export type ScheduleCommittee = {
	id: string;
	name: string;
	abbreviation: string | null;
	/** Its room, which `{room}` in a session's location becomes. `null` when none is set. */
	room: string | null;
};

/** One committee somebody sits in or chairs, with the conference it belongs to. */
export type CommitteePlace = { conferenceId: string; committeeId: string };

/** The four ways somebody is part of a conference, as `$lib/server/schedule.ts` reads them. */
export type MembershipFacts = {
	/** The committees of the seats they hold. */
	seats: CommitteePlace[];
	/** The conferences of the delegations they belong to. */
	delegationConferenceIds: string[];
	/**
	 * Their `conference_staff` rows, each saying whether one of the roles they
	 * hold there is everything (`administrator`), which is what an organiser is.
	 */
	staffRows: { conferenceId: string; isAdministrator: boolean }[];
	/** The committees they chair. */
	chairedCommittees: CommitteePlace[];
};

/** The membership of one conference out of a map, starting an empty one when it is new. */
function membershipOf(
	memberships: Map<string, AudienceMembership>,
	conferenceId: string
): AudienceMembership {
	const existing = memberships.get(conferenceId);

	if (existing) {
		return existing;
	}

	const created: AudienceMembership = { ...NO_MEMBERSHIP, committeeIds: [] };
	memberships.set(conferenceId, created);

	return created;
}

/**
 * Turn the four lists of `MembershipFacts` into one membership per conference.
 *
 * A seat or a delegation makes somebody a participant, any staff row makes
 * them staff, and a seat or a chair puts its committee in `committeeIds`.
 */
export function collectMemberships(facts: MembershipFacts): Map<string, AudienceMembership> {
	const memberships = new Map<string, AudienceMembership>();

	for (const seat of facts.seats) {
		const membership = membershipOf(memberships, seat.conferenceId);
		membership.isParticipant = true;
		membership.committeeIds.push(seat.committeeId);
	}

	for (const conferenceId of facts.delegationConferenceIds) {
		membershipOf(memberships, conferenceId).isParticipant = true;
	}

	for (const staff of facts.staffRows) {
		const membership = membershipOf(memberships, staff.conferenceId);
		membership.isStaff = true;
		membership.isOrganiser = membership.isOrganiser || staff.isAdministrator;
	}

	for (const chair of facts.chairedCommittees) {
		membershipOf(memberships, chair.conferenceId).committeeIds.push(chair.committeeId);
	}

	return memberships;
}
