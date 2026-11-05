import { describe, expect, it } from 'vitest';
import type { CommitteeSession, CommitteeStateView } from './chair-room';
import type { RoomSeat, TimerSetting } from './committee-room';
import {
	attendanceText,
	millisecondsToNextMinute,
	nextScheduleLine,
	roomScreen,
	watchedRoomState,
	type WatchedRoom
} from './room-screen';
import type { ScheduleEvent } from './schedule';

// The tables under "What the display shows" (`05-pages/chair/display.md`) and
// "What delegates see" (`05-pages/delegate/committee-live.md`), one test per
// row and audience. The floor's and the vote's details are tested beside
// `watched-floor.ts` and `watched-vote.ts`.

// 11:02 and 14:58 UTC are 13:02 and 16:58 in Amsterdam in May.
const ENDED: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'ended',
	startedAt: '2020-05-06T11:02:00Z',
	endedAt: '2020-05-06T14:58:00Z'
};

const RUNNING: CommitteeSession = {
	id: 'session-2',
	name: 'Session 2',
	status: 'in_progress',
	startedAt: '2020-05-06T15:30:00Z',
	endedAt: null
};

// 7 May 2020 was a Thursday; 07:30 UTC is 09:30 in Amsterdam.
const NEXT_EVENT: ScheduleEvent = {
	id: 'event-1',
	conferenceId: 'conference-1',
	title: 'Committee session II',
	description: null,
	location: 'Room 4',
	startsAt: '2020-05-07T07:30:00Z',
	endsAt: '2020-05-07T10:00:00Z',
	audience: 'delegates',
	committeeId: null,
	committeeAbbreviation: null
};

const NO_TIMER: TimerSetting = { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null };

const IDLE_STATE: CommitteeStateView = {
	currentSessionId: null,
	mode: 'idle',
	currentMotionId: null,
	activeSpeakersListId: null,
	currentSpeakerEntryId: null,
	currentVoteId: null,
	agendaTopic: null,
	timer: NO_TIMER
};

const SEATS: RoomSeat[] = [
	{ id: 'seat-cn', name: 'China', countryCode: 'CN', delegateName: 'Wei Zhang' },
	{ id: 'seat-gb', name: 'United Kingdom', countryCode: 'GB', delegateName: null },
	{ id: 'seat-br', name: 'Brazil', countryCode: 'BR', delegateName: null },
	{ id: 'seat-ru', name: 'Russian Federation', countryCode: 'RU', delegateName: null },
	{ id: 'seat-ke', name: 'Kenya', countryCode: 'KE', delegateName: null },
	{ id: 'seat-jp', name: 'Japan', countryCode: 'JP', delegateName: null }
];

/** The room on 6 May, day 2 of a conference from 5 to 7 May 2020, with nothing held yet. */
const LOBBY: WatchedRoom = {
	committeeState: IDLE_STATE,
	currentSession: null,
	sessions: [],
	latestRollCallId: null,
	hasAnyoneSpoken: false,
	presentCount: null,
	seats: SEATS,
	currentVote: null,
	suspensionReason: null,
	committee: { name: 'Security Council', topics: ['Humanitarian access'] },
	conference: {
		name: 'THIMUN 2020',
		timezone: 'Europe/Amsterdam',
		endDate: '2020-05-07',
		isQuickSession: false
	},
	nextScheduleEvent: NEXT_EVENT,
	today: '2020-05-06'
};

/** Session 2 under way in formal debate, nobody called yet, roll call not taken. */
const OPENING: WatchedRoom = {
	...LOBBY,
	committeeState: { ...IDLE_STATE, currentSessionId: 'session-2', mode: 'formal_debate' },
	currentSession: RUNNING,
	sessions: [RUNNING, ENDED]
};

/** The same session once someone has spoken. */
const DEBATE: WatchedRoom = { ...OPENING, hasAnyoneSpoken: true };

/** The room in a mode, someone having spoken. */
function inMode(mode: CommitteeStateView['mode'], room: WatchedRoom = DEBATE): WatchedRoom {
	return { ...room, committeeState: { ...room.committeeState, mode } };
}

/** Session 1 ended today, with more on the schedule. */
const ENDED_ROOM: WatchedRoom = { ...LOBBY, sessions: [ENDED] };

const NOW = new Date('2020-05-06T11:19:00Z');

describe('nextScheduleLine', () => {
	it('names the event, its weekday and time, and its room', () => {
		expect(nextScheduleLine(NEXT_EVENT, 'Europe/Amsterdam')).toBe(
			'Next: Committee session II · Thu 7 May, 09:30 · Room 4'
		);
	});

	it('leaves the room out when the organisers named none', () => {
		expect(nextScheduleLine({ ...NEXT_EVENT, location: null }, 'Europe/Amsterdam')).toBe(
			'Next: Committee session II · Thu 7 May, 09:30'
		);
	});
});

describe('watchedRoomState', () => {
	it("follows the chair's state: a started session nobody has spoken in is opening", () => {
		expect(watchedRoomState(OPENING)).toBe('opening');
		expect(watchedRoomState(DEBATE)).toBe('debate');
	});

	it('ends the opening the moment a speaker is called, as the chair frame does', () => {
		const called = {
			...OPENING,
			committeeState: { ...OPENING.committeeState, currentSpeakerEntryId: 'entry-1' }
		};

		expect(watchedRoomState(called)).toBe('debate');
	});
});

describe('roomScreen: Lobby', () => {
	it('shows the projector the committee, its conference and the next event', () => {
		expect(roomScreen(LOBBY, 'display', NOW)).toEqual({
			kind: 'message',
			title: 'Security Council',
			lines: ['THIMUN 2020', 'Next: Committee session II · Thu 7 May, 09:30 · Room 4']
		});
	});

	it('leaves the next line out when the schedule has nothing later', () => {
		const screen = roomScreen({ ...LOBBY, nextScheduleEvent: null }, 'display', NOW);

		expect(screen).toEqual({ kind: 'message', title: 'Security Council', lines: ['THIMUN 2020'] });
	});

	it('names no conference for a quick session', () => {
		const quick = { ...LOBBY, nextScheduleEvent: null };
		quick.conference = { ...LOBBY.conference, isQuickSession: true };

		expect(roomScreen(quick, 'display', NOW)).toEqual({
			kind: 'message',
			title: 'Security Council',
			lines: []
		});
	});

	it('tells a delegate no session is running, and what is next', () => {
		expect(roomScreen(LOBBY, 'phone', NOW)).toEqual({
			kind: 'message',
			title: 'No session is running',
			lines: ['Next: Committee session II · Thu 7 May, 09:30 · Room 4']
		});
	});
});

describe('roomScreen: Opening', () => {
	it('shows the projector the session, the agenda to be set and the roll call to be taken', () => {
		expect(roomScreen(OPENING, 'display', NOW)).toEqual({
			kind: 'message',
			title: 'Session 2 has started',
			lines: ['Agenda to be set · Roll call to be taken']
		});
	});

	it('shows the agenda and the attendance once both are there', () => {
		const ready = {
			...OPENING,
			committeeState: { ...OPENING.committeeState, agendaTopic: 'Humanitarian access' },
			latestRollCallId: 'roll-call-1',
			presentCount: 5
		};

		expect(roomScreen(ready, 'display', NOW)).toEqual({
			kind: 'message',
			title: 'Session 2 has started',
			lines: ['Humanitarian access · 5 of 6 present']
		});
		expect(roomScreen(ready, 'phone', NOW)).toEqual({
			kind: 'message',
			title: 'The session has started',
			lines: ['Humanitarian access']
		});
	});

	it('tells a delegate the session has started and the agenda is to be set', () => {
		expect(roomScreen(OPENING, 'phone', NOW)).toEqual({
			kind: 'message',
			title: 'The session has started',
			lines: ['Agenda to be set']
		});
	});

	it('draws the mode instead once the chair starts another mode before anyone has spoken', () => {
		expect(roomScreen(inMode('moderated_caucus', OPENING), 'display', NOW)).toEqual({
			kind: 'floor',
			view: 'mod'
		});
	});
});

describe('roomScreen: the live modes', () => {
	it('draws the floor of the GSL, a moderated caucus and a single speaker', () => {
		expect(roomScreen(DEBATE, 'display', NOW)).toEqual({ kind: 'floor', view: 'gsl' });
		expect(roomScreen(inMode('moderated_caucus'), 'phone', NOW)).toEqual({
			kind: 'floor',
			view: 'mod'
		});
		expect(roomScreen(inMode('single_speaker'), 'display', NOW)).toEqual({
			kind: 'floor',
			view: 'single'
		});
	});

	it('draws the Unmod clock', () => {
		expect(roomScreen(inMode('unmoderated_caucus'), 'phone', NOW)).toEqual({ kind: 'unmod' });
	});

	it('says the vote will open shortly while voting has no vote open yet', () => {
		const expected = {
			kind: 'message',
			title: 'Voting procedure',
			lines: ['The vote will open shortly']
		};

		expect(roomScreen(inMode('voting'), 'display', NOW)).toEqual(expected);
		expect(roomScreen(inMode('voting'), 'phone', NOW)).toEqual(expected);
	});

	it('draws the vote once one is open, and its result once closed', () => {
		const open = { ...inMode('voting'), currentVote: { status: 'open' as const } };
		const closed = { ...inMode('voting'), currentVote: { status: 'closed' as const } };

		expect(roomScreen(open, 'display', NOW)).toEqual({ kind: 'vote' });
		expect(roomScreen(closed, 'phone', NOW)).toEqual({ kind: 'vote' });
	});
});

describe('roomScreen: Suspended', () => {
	const SUSPENDED: WatchedRoom = {
		...DEBATE,
		committeeState: {
			...DEBATE.committeeState,
			mode: 'suspended',
			suspendedAt: '2020-05-06T11:07:00Z',
			suspendedUntil: null,
			modeBeforeSuspension: 'formal_debate'
		}
	};

	it('says how long the room has been away without a return time', () => {
		expect(roomScreen(SUSPENDED, 'display', NOW)).toEqual({
			kind: 'message',
			title: 'Suspended',
			lines: ['12 min so far']
		});
	});

	it("names the motion's reason and counts down to the return time in whole minutes", () => {
		// 12:00 UTC is 14:00 in Amsterdam; 41 minutes after 11:19.
		const forLunch = {
			...SUSPENDED,
			suspensionReason: 'for lunch',
			committeeState: { ...SUSPENDED.committeeState, suspendedUntil: '2020-05-06T12:00:00Z' }
		};

		expect(roomScreen(forLunch, 'phone', NOW)).toEqual({
			kind: 'message',
			title: 'Suspended for lunch',
			lines: ['Back at 14:00 · in 41 min']
		});
		expect(roomScreen(forLunch, 'display', new Date('2020-05-06T12:01:00Z'))).toEqual({
			kind: 'message',
			title: 'Suspended for lunch',
			lines: ['Back at 14:00 · any moment now']
		});
	});
});

describe('roomScreen: Ended', () => {
	it('names the session that ended and the next event', () => {
		const expected = {
			kind: 'message',
			title: 'Session 1 has ended',
			lines: ['Next: Committee session II · Thu 7 May, 09:30 · Room 4']
		};

		expect(roomScreen(ENDED_ROOM, 'display', NOW)).toEqual(expected);
		expect(roomScreen(ENDED_ROOM, 'phone', NOW)).toEqual(expected);
	});

	it("says it was the last session on the conference's last day with nothing later", () => {
		const last = { ...ENDED_ROOM, nextScheduleEvent: null, today: '2020-05-07' };
		last.sessions = [{ ...ENDED, endedAt: '2020-05-07T14:58:00Z' }];

		expect(roomScreen(last, 'display', NOW)).toEqual({
			kind: 'message',
			title: 'Session 1 has ended',
			lines: ['That was the last session.']
		});
		expect(roomScreen(last, 'phone', NOW)).toEqual({
			kind: 'message',
			title: 'Session 1 has ended',
			lines: ['That was the last session.', 'Awards are announced by the organisers.']
		});
	});

	it('says nothing more for a quick session', () => {
		const quick = { ...ENDED_ROOM };
		quick.conference = { ...LOBBY.conference, isQuickSession: true };

		expect(roomScreen(quick, 'phone', NOW)).toEqual({
			kind: 'message',
			title: 'Session 1 has ended',
			lines: []
		});
	});
});

describe('attendanceText', () => {
	it('counts who is present once the session has had a roll call', () => {
		const withRollCall = { ...DEBATE, latestRollCallId: 'roll-call-1', presentCount: 5 };

		expect(attendanceText(withRollCall)).toBe('5/6 present');
		expect(attendanceText(inMode('suspended', withRollCall))).toBe('5/6 present');
	});

	it('says nothing before the roll call, in the lobby or after the session', () => {
		expect(attendanceText(DEBATE)).toBeNull();
		expect(attendanceText({ ...ENDED_ROOM, presentCount: 5 })).toBeNull();
	});
});

describe('millisecondsToNextMinute', () => {
	it('is the time left in the current minute', () => {
		expect(millisecondsToNextMinute(new Date('2020-05-06T11:19:45.500Z'))).toBe(14_500);
		expect(millisecondsToNextMinute(new Date('2020-05-06T11:19:00.000Z'))).toBe(60_000);
	});
});
