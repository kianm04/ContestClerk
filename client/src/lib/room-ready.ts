/**
 * What the live room's lobby shows before a session starts
 * (`05-pages/chair/committee-room.md`, "Lobby", S11, and a quick session's
 * lobby, S14): the committee and where and when it meets, the next session
 * and its button, the agenda carried over, the seats, the last session's
 * record and the next event on the schedule. The ended screen shares the
 * next session's name and the schedule's line.
 *
 * Plain functions with no Svelte in them, so they can be read and tested on
 * their own. The rows they read are loaded by the chair layout and the live
 * room's `load`.
 */

import type { ResolvedPathname } from '$app/types';
import { defaultSessionName, type CommitteeSession, type ConferenceDays } from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import {
	dayInTimezone,
	daysBetween,
	formatDateRange,
	formatDayAndMonth,
	formatTimeOfDay,
	formatWeekdayAndTime
} from '$lib/dates';
import {
	sessionLengthText,
	sessionRecordLine,
	recordOfSession,
	type SessionRecord
} from '$lib/room-record';
import { nextEvent, type ScheduleEvent } from '$lib/schedule';
import { chairMotionsSessionUrl, manageCommitteeUrl, quickSessionDelegationsUrl } from '$lib/urls';

/** Whether `today` falls before the conference's first day. Both are `YYYY-MM-DD`. */
export function isBeforeConferenceStart(today: string, startDate: string): boolean {
	// `YYYY-MM-DD` days sort as text in date order, so `<` compares them as dates.
	return today < startDate;
}

/**
 * The next event on the programme that this committee's room should mention:
 * one for everyone, for delegates, or for this committee, that has not started
 * yet. Null when there is none.
 */
export function nextCommitteeEvent(
	events: ScheduleEvent[],
	committeeId: string,
	now: Date
): ScheduleEvent | null {
	const visible = events.filter(
		(event) =>
			event.audience === 'everyone' ||
			event.audience === 'delegates' ||
			(event.audience === 'committee' && event.committeeId === committeeId)
	);

	return nextEvent(visible, now);
}

/** The committee's most recent ended session, or null. `sessions` is newest first. */
export function latestEndedSession(sessions: CommitteeSession[]): CommitteeSession | null {
	return sessions.find((session) => session.status === 'ended' && session.endedAt !== null) ?? null;
}

/**
 * The name the next session gets unless the chair renames it: "Session 2",
 * or "Practice session" before the conference's first day
 * (`defaultSessionName`). A quick session has no practice sessions, so it
 * always counts every session it has started (`chair/quick-session.md`).
 */
export function nextSessionName(
	sessions: CommitteeSession[],
	conference: ConferenceDays,
	today: string,
	isQuickSession: boolean
): string {
	if (!isQuickSession) return defaultSessionName(sessions, conference, today);

	const startedCount = sessions.filter((session) => session.startedAt !== null).length;

	return `Session ${startedCount + 1}`;
}

/**
 * When an event on the schedule starts, as the room's screens write it: its
 * time today, "tomorrow 09:30", or its weekday and day further ahead.
 */
function eventTimeText(event: ScheduleEvent, today: string, timezone: string): string {
	const eventDay = dayInTimezone(new Date(event.startsAt), timezone);
	const daysAhead = daysBetween(today, eventDay);
	const time = formatTimeOfDay(event.startsAt, timezone);

	if (daysAhead === 0) return time;
	if (daysAhead === 1) return `tomorrow ${time}`;

	return formatWeekdayAndTime(event.startsAt, timezone);
}

/** "Session 2 · 09:30, Council Chamber": the next event, as the lobby and the ended screen write it. */
export function scheduleLineText(event: ScheduleEvent, today: string, timezone: string): string {
	const line = `${event.title} · ${eventTimeText(event, today, timezone)}`;

	return event.location === null ? line : `${line}, ${event.location}`;
}

/**
 * Where the conference is in its days: "day 2 of 3" while it runs, its dates
 * before it starts, and nothing once it is over. All days are `YYYY-MM-DD`.
 */
export function conferenceDayText(
	startDate: string,
	endDate: string,
	today: string
): string | null {
	if (today < startDate) return formatDateRange(startDate, endDate);
	if (today > endDate) return null;

	const dayNumber = daysBetween(startDate, today) + 1;
	const dayCount = daysBetween(startDate, endDate) + 1;

	return `day ${dayNumber} of ${dayCount}`;
}

/** "ended yesterday at 17:40", "ended today at 17:40" or "ended 14 Feb at 17:40". */
function endedWhenText(endedAt: string, today: string, timezone: string): string {
	const endedDay = dayInTimezone(new Date(endedAt), timezone);
	const daysAgo = daysBetween(endedDay, today);
	const time = formatTimeOfDay(endedAt, timezone);

	if (daysAgo === 0) return `ended today at ${time}`;
	if (daysAgo === 1) return `ended yesterday at ${time}`;

	return `ended ${formatDayAndMonth(endedAt, timezone)} at ${time}`;
}

/** What the lobby says about the last session that ended. */
export type LastSessionView = {
	/** "Session 1 · ended yesterday at 17:40 · 2 h 14 min". */
	summary: string;
	/** "23 speeches · 4 motions, 3 passed · no votes", or null while it is not read. */
	recordLine: string | null;
	/** The Motions page's record of that session. */
	recordHref: ResolvedPathname;
};

/** Everything `Lobby.svelte` draws, worked out by `lobbyView`. */
export type LobbyView = {
	/** The page's heading, "Security Council". */
	committeeName: string;
	/** "Northbridge MUN · Council Chamber · day 2 of 3", or null for a quick session. */
	whereLine: string | null;
	/** "Session 2", or "Practice session" before the conference's first day. */
	sessionName: string;
	/** "Start Session 2", or "Start a practice session". */
	startLabel: string;
	/** Whether the next session is a practice session, which says why its numbering waits. */
	isPracticeSession: boolean;
	/** "Agenda carries over: …" or "No agenda yet"; null for a committee with no topics. */
	agendaLine: string | null;
	/** "6 seats · 6 delegates assigned", "12 delegations", or the sentence for no seats. */
	seatsLine: string;
	/** Whether the committee has seats; without any, nothing can start. */
	hasSeats: boolean;
	/** The committee's page in the organiser area, for an organiser while it has no seats. */
	addSeatsHref: ResolvedPathname | null;
	lastSession: LastSessionView | null;
	/** "Session 2 · 09:30, Council Chamber", or null. */
	nextOnSchedule: string | null;
	/** "Edit delegations", in a quick session only. */
	editDelegationsHref: ResolvedPathname | null;
};

/** The chair layout's rows that `lobbyView` reads; the layout's `data` has them all. */
export type LobbyRoom = {
	conference: ConferenceDays & { id: string; slug: string; name: string; endDate: string };
	committee: { id: string; slug: string; name: string; room: string | null; topics: string[] };
	/** The conference's own date, `YYYY-MM-DD`. */
	today: string;
	/** Every session of the committee, newest first. */
	sessions: CommitteeSession[];
	seats: RoomSeat[];
	/** Whether the reader organises the conference, who may add seats. */
	isOrganiser: boolean;
};

/** What the live room's `load` reads for the lobby and the ended screen besides the layout's rows. */
export type LobbyFacts = {
	/** How many of the committee's seats have a delegate. */
	filledSeatCount: number;
	/** The latest ended session's record, or null before the first. */
	lastSessionRecord: SessionRecord | null;
	nextScheduleEvent: ScheduleEvent | null;
	/** Whether the committee is a quick session's (D7, S14). */
	isQuickSession: boolean;
};

/** The sentence the lobby shows in place of the seats line while the committee has none. */
export const NO_SEATS_SENTENCE = 'This committee has no seats yet.';

/** "6 seats · 6 delegates assigned", a quick session's "12 delegations", or `NO_SEATS_SENTENCE`. */
function seatsLineText(seatCount: number, filledCount: number, isQuickSession: boolean): string {
	if (seatCount === 0) return NO_SEATS_SENTENCE;
	if (isQuickSession) return seatCount === 1 ? '1 delegation' : `${seatCount} delegations`;

	const seats = seatCount === 1 ? '1 seat' : `${seatCount} seats`;
	const delegates = filledCount === 1 ? '1 delegate' : `${filledCount} delegates`;

	return `${seats} · ${delegates} assigned`;
}

/** The lobby's "Last session" lines, or null before any session has ended. */
function lastSessionView(room: LobbyRoom, record: SessionRecord | null): LastSessionView | null {
	const session = latestEndedSession(room.sessions);

	if (session === null || session.endedAt === null) return null;

	const timezone = room.conference.timezone;
	const length = sessionLengthText(session);
	const parts = [session.name, endedWhenText(session.endedAt, room.today, timezone), length];
	const shownRecord = recordOfSession(record, session);

	return {
		summary: parts.filter((part) => part !== null).join(' · '),
		recordLine: shownRecord === null ? null : sessionRecordLine(shownRecord),
		recordHref: chairMotionsSessionUrl(room.conference.slug, room.committee.slug, session.id)
	};
}

/** "Agenda carries over: …", "No agenda yet", or null for a committee with no topics. */
function agendaLineText(topics: string[], agendaTopic: string | null): string | null {
	if (topics.length === 0) return null;
	if (agendaTopic === null) return 'No agenda yet';

	return `Agenda carries over: ${agendaTopic}`;
}

/** The lobby's lines, button and links, from the chair layout's rows and the live room's facts. */
export function lobbyView(
	room: LobbyRoom,
	facts: LobbyFacts,
	agendaTopic: string | null
): LobbyView {
	const { conference, committee, today, sessions, seats } = room;
	const isQuick = facts.isQuickSession;
	const sessionName = nextSessionName(sessions, conference, today, isQuick);
	const isPracticeSession = !isQuick && isBeforeConferenceStart(today, conference.startDate);
	const dayText = conferenceDayText(conference.startDate, conference.endDate, today);
	const whereParts = [conference.name, committee.room, dayText].filter((part) => part !== null);
	const hasSeats = seats.length > 0;
	const nextEventText =
		facts.nextScheduleEvent === null
			? null
			: scheduleLineText(facts.nextScheduleEvent, today, conference.timezone);

	return {
		committeeName: committee.name,
		whereLine: isQuick ? null : whereParts.join(' · '),
		sessionName,
		startLabel: isPracticeSession ? 'Start a practice session' : `Start ${sessionName}`,
		isPracticeSession,
		agendaLine: agendaLineText(committee.topics, agendaTopic),
		seatsLine: seatsLineText(seats.length, facts.filledSeatCount, isQuick),
		hasSeats,
		addSeatsHref:
			!hasSeats && room.isOrganiser ? manageCommitteeUrl(conference.slug, committee.id) : null,
		lastSession: lastSessionView(room, facts.lastSessionRecord),
		nextOnSchedule: isQuick ? null : nextEventText,
		editDelegationsHref: isQuick ? quickSessionDelegationsUrl(conference.slug) : null
	};
}
