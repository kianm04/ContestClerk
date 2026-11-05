/**
 * What the committee room shows to the people watching it: the projector
 * (`specs/05-pages/chair/display.md`) and a delegate's phone
 * (`05-pages/delegate/committee-live.md`). Both follow the room, never the
 * tab a chair has open, so both tell the same truth: which screen each room
 * state and mode draws, and the words of the screens that are only a title
 * and a line.
 *
 * What the floor and its list say is `$lib/watched-floor.ts`'s, and what the
 * vote says `$lib/watched-vote.ts`'s.
 *
 * Plain functions with no Svelte in them, so they can be read and tested on
 * their own. The room's state is the chair's own (`roomState` and
 * `liveRoomScreen` in `$lib/chair-room.ts`), so the console, the projector
 * and the phones never disagree about which moment it is.
 */

import {
	liveRoomScreen,
	roomState,
	type CommitteeSession,
	type CommitteeStateView,
	type RoomState
} from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import { formatWeekdayAndTime } from '$lib/dates';
import { isLastSessionOfConference } from '$lib/room-ended';
import { latestEndedSession } from '$lib/room-ready';
import { suspendedTitle, suspensionOf } from '$lib/room-suspended';
import type { ScheduleEvent } from '$lib/schedule';
import { watcherSuspensionLine } from '$lib/suspension';
import type { OpenVote } from '$lib/votes';

/** Who is watching: the projector, read from the back of the room, or a delegate's phone. */
export type ScreenAudience = 'display' | 'phone';

/** The three modes whose screen is a speaker, a clock and a list. */
export type FloorView = 'gsl' | 'mod' | 'single';

/** What `roomScreen` reads to choose the screen and word its messages. */
export type WatchedRoom = {
	committeeState: CommitteeStateView;
	currentSession: CommitteeSession | null;
	/** Every session of the committee, newest first. */
	sessions: CommitteeSession[];
	/** The current session's latest roll call, or null before one. */
	latestRollCallId: string | null;
	/** Whether anyone has been called to speak in the current session, on any of its lists. */
	hasAnyoneSpoken: boolean;
	/** Seats present at the latest roll call of the session, or null before one. */
	presentCount: number | null;
	/** Every seat the committee offers; their number is the "of 6" in "5 of 6 present". */
	seats: RoomSeat[];
	/** The vote the room is on, open or closed, or null. */
	currentVote: Pick<OpenVote, 'status'> | null;
	/** "for lunch", from a passed suspend motion, or null. */
	suspensionReason: string | null;
	committee: { name: string; topics: string[] };
	conference: { name: string; timezone: string; endDate: string; isQuickSession: boolean };
	/** The next event on the schedule the committee can see, or null. */
	nextScheduleEvent: ScheduleEvent | null;
	/** The conference's own date, `YYYY-MM-DD`. */
	today: string;
};

/**
 * The one screen a watcher sees: a title and its lines (the lobby, the
 * opening, a suspension, the end of a session, a vote not yet open), the
 * floor of the GSL, a moderated caucus or a single speaker, the Unmod clock,
 * or the vote.
 */
export type RoomScreen =
	| { kind: 'message'; title: string; lines: string[] }
	| { kind: 'floor'; view: FloorView }
	| { kind: 'unmod' }
	| { kind: 'vote' };

/** The screen while the room is voting and no vote has been opened yet. */
const VOTE_NOT_OPEN: RoomScreen = {
	kind: 'message',
	title: 'Voting procedure',
	lines: ['The vote will open shortly']
};

/**
 * "Next: Committee session II · Thu 1 Oct, 13:00 · Room 4": the next event on
 * the schedule, without the room when the organisers named none.
 */
export function nextScheduleLine(event: ScheduleEvent, timezone: string): string {
	const parts = [event.title, formatWeekdayAndTime(event.startsAt, timezone)];

	if (event.location !== null) parts.push(event.location);

	return `Next: ${parts.join(' · ')}`;
}

/**
 * Which of the room's five states it is in, as the chair's frame decides it:
 * someone with the floor counts as someone having spoken, so the opening
 * ends the moment the first speaker is called.
 */
export function watchedRoomState(room: WatchedRoom): RoomState {
	const hasSpeakerNow = room.committeeState.currentSpeakerEntryId !== null;

	return roomState({
		mode: room.committeeState.mode,
		currentSession: room.currentSession,
		sessions: room.sessions,
		hasAnyoneSpoken: room.hasAnyoneSpoken || hasSpeakerNow,
		today: room.today,
		timezone: room.conference.timezone
	});
}

/** The schedule's next event as a line of its own, or no line without one. */
function nextLines(room: WatchedRoom): string[] {
	if (room.nextScheduleEvent === null) return [];

	return [nextScheduleLine(room.nextScheduleEvent, room.conference.timezone)];
}

/** The lobby: the committee and its conference on the projector, "No session is running" on a phone. */
function lobbyMessage(room: WatchedRoom, audience: ScreenAudience): RoomScreen {
	if (audience === 'phone') {
		return { kind: 'message', title: 'No session is running', lines: nextLines(room) };
	}

	// A quick session has no conference around it worth naming.
	const conferenceLines = room.conference.isQuickSession ? [] : [room.conference.name];

	return {
		kind: 'message',
		title: room.committee.name,
		lines: [...conferenceLines, ...nextLines(room)]
	};
}

/** The opening, until the first speaker is called: the session, the agenda and who is here. */
function openingMessage(room: WatchedRoom, audience: ScreenAudience): RoomScreen {
	const sessionName = room.currentSession?.name ?? 'The session';
	const agenda = room.committeeState.agendaTopic ?? 'Agenda to be set';

	// The phone names the attendance in its context line instead.
	if (audience === 'phone') {
		return { kind: 'message', title: 'The session has started', lines: [agenda] };
	}

	const attendance =
		room.presentCount === null
			? 'Roll call to be taken'
			: `${room.presentCount} of ${room.seats.length} present`;

	return {
		kind: 'message',
		title: `${sessionName} has started`,
		lines: [`${agenda} · ${attendance}`]
	};
}

/** A suspension: why, and when the room is back or how long it has been away, at `now`. */
function suspendedMessage(room: WatchedRoom, now: Date): RoomScreen {
	const suspension = suspensionOf(room.committeeState, now);

	return {
		kind: 'message',
		title: suspendedTitle(room.suspensionReason),
		lines: [watcherSuspensionLine(suspension, now, room.conference.timezone)]
	};
}

/** The end of a session: what comes next, or that it was the conference's last. */
function endedMessage(room: WatchedRoom, audience: ScreenAudience): RoomScreen {
	const sessionName = latestEndedSession(room.sessions)?.name ?? 'The session';
	const title = `${sessionName} has ended`;

	// A quick session has no schedule and no awards, so it says nothing more.
	if (room.conference.isQuickSession) return { kind: 'message', title, lines: [] };

	const isLast = isLastSessionOfConference(
		room.today,
		room.conference.endDate,
		room.nextScheduleEvent
	);

	if (!isLast) return { kind: 'message', title, lines: nextLines(room) };

	const lastLines =
		audience === 'phone'
			? ['That was the last session.', 'Awards are announced by the organisers.']
			: ['That was the last session.'];

	return { kind: 'message', title, lines: lastLines };
}

/**
 * The screen a watcher sees now, from the room's state and its live mode
 * (the tables under "What the display shows" and "What delegates see").
 * `now` is on the server's clock; only a suspension's line reads it.
 */
export function roomScreen(room: WatchedRoom, audience: ScreenAudience, now: Date): RoomScreen {
	const screen = liveRoomScreen(watchedRoomState(room), room.committeeState.mode);

	switch (screen) {
		case 'lobby':
			return lobbyMessage(room, audience);
		case 'opening':
			return openingMessage(room, audience);
		case 'suspended':
			return suspendedMessage(room, now);
		case 'ended':
			return endedMessage(room, audience);
		case 'unmod':
			return { kind: 'unmod' };
		case 'voting':
			return room.currentVote === null ? VOTE_NOT_OPEN : { kind: 'vote' };
		default:
			return { kind: 'floor', view: screen };
	}
}

/**
 * "5/6 present" in the projector's top line and the phone's context line,
 * while a session runs or is suspended and has had a roll call; else null.
 */
export function attendanceText(room: WatchedRoom): string | null {
	const state = watchedRoomState(room);
	const isSessionUnderWay = state === 'opening' || state === 'debate' || state === 'suspended';

	if (!isSessionUnderWay || room.presentCount === null) return null;

	return `${room.presentCount}/${room.seats.length} present`;
}

const MILLISECONDS_PER_MINUTE = 60 * 1000;

/**
 * How long until the wall clock's minute turns over at `now`, so the
 * projector's clock moves exactly on the minute rather than up to a minute late.
 */
export function millisecondsToNextMinute(now: Date): number {
	return MILLISECONDS_PER_MINUTE - (now.getTime() % MILLISECONDS_PER_MINUTE);
}
