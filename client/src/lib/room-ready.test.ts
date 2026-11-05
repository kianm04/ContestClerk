import { describe, expect, it } from 'vitest';
import type { CommitteeSession } from './chair-room';
import type { SessionRecord } from './room-record';
import {
	conferenceDayText,
	isBeforeConferenceStart,
	latestEndedSession,
	lobbyView,
	nextCommitteeEvent,
	nextSessionName,
	NO_SEATS_SENTENCE,
	scheduleLineText,
	type LobbyFacts,
	type LobbyRoom
} from './room-ready';
import type { ScheduleEvent } from './schedule';

/** An event on the programme, starting at `startsAt`, for `audience`. */
function event(
	id: string,
	startsAt: string,
	audience: ScheduleEvent['audience'],
	committeeId: string | null = null
): ScheduleEvent {
	return {
		id,
		conferenceId: 'conference-1',
		title: `Event ${id}`,
		description: null,
		location: null,
		startsAt,
		endsAt: startsAt,
		audience,
		committeeId,
		committeeAbbreviation: null
	};
}

describe('isBeforeConferenceStart', () => {
	it('is true only before the first day', () => {
		expect(isBeforeConferenceStart('2020-05-01', '2020-05-05')).toBe(true);
		expect(isBeforeConferenceStart('2020-05-05', '2020-05-05')).toBe(false);
		expect(isBeforeConferenceStart('2020-05-06', '2020-05-05')).toBe(false);
	});
});

describe('nextCommitteeEvent', () => {
	const NOW = new Date('2020-05-05T08:00:00Z');

	it('takes the soonest event that has not started, for everyone, delegates or this committee', () => {
		const events = [
			event('past', '2020-05-05T07:00:00Z', 'everyone'),
			event('staff', '2020-05-05T08:10:00Z', 'staff'),
			event('other-committee', '2020-05-05T08:20:00Z', 'committee', 'committee-2'),
			event('ours', '2020-05-05T08:30:00Z', 'committee', 'committee-1'),
			event('delegates', '2020-05-05T09:00:00Z', 'delegates')
		];

		expect(nextCommitteeEvent(events, 'committee-1', NOW)?.id).toBe('ours');
	});

	it('is null when nothing visible is left', () => {
		const events = [event('staff', '2020-05-05T09:00:00Z', 'staff')];

		expect(nextCommitteeEvent(events, 'committee-1', NOW)).toBeNull();
	});
});

describe('latestEndedSession', () => {
	it('finds the newest session that has ended', () => {
		const sessions: CommitteeSession[] = [
			{ id: '3', name: 'Session 3', status: 'in_progress', startedAt: null, endedAt: null },
			{
				id: '2',
				name: 'Session 2',
				status: 'ended',
				startedAt: null,
				endedAt: '2020-05-05T15:00:00Z'
			},
			{
				id: '1',
				name: 'Session 1',
				status: 'ended',
				startedAt: null,
				endedAt: '2020-05-05T11:00:00Z'
			}
		];

		expect(latestEndedSession(sessions)?.id).toBe('2');
		expect(latestEndedSession([])).toBeNull();
	});
});

describe('nextSessionName', () => {
	const CONFERENCE = { startDate: '2020-05-05', timezone: 'Europe/Amsterdam' };
	const STARTED: CommitteeSession = {
		id: 'session-1',
		name: 'Session 1',
		status: 'ended',
		startedAt: '2020-05-05T07:00:00Z',
		endedAt: '2020-05-05T09:00:00Z'
	};

	it("is the conference's own next name: a practice session before the first day", () => {
		expect(nextSessionName([], CONFERENCE, '2020-05-01', false)).toBe('Practice session');
		expect(nextSessionName([STARTED], CONFERENCE, '2020-05-06', false)).toBe('Session 2');
	});

	it('never names a practice session in a quick session, counting every session started', () => {
		expect(nextSessionName([], CONFERENCE, '2020-05-01', true)).toBe('Session 1');
		expect(nextSessionName([STARTED], CONFERENCE, '2020-05-01', true)).toBe('Session 2');
	});
});

describe('scheduleLineText', () => {
	// 07:30 UTC is 09:30 in Amsterdam in May.
	const SESSION_TWO = {
		...event('session-2', '2020-05-06T07:30:00Z', 'committee', 'committee-1'),
		title: 'Session 2',
		location: 'Council Chamber'
	};

	it('writes the event, its time today and where it is', () => {
		expect(scheduleLineText(SESSION_TWO, '2020-05-06', 'Europe/Amsterdam')).toBe(
			'Session 2 · 09:30, Council Chamber'
		);
	});

	it('says "tomorrow" the day before, and the weekday further ahead', () => {
		expect(scheduleLineText(SESSION_TWO, '2020-05-05', 'Europe/Amsterdam')).toBe(
			'Session 2 · tomorrow 09:30, Council Chamber'
		);
		expect(
			scheduleLineText({ ...SESSION_TWO, location: null }, '2020-05-03', 'Europe/Amsterdam')
		).toBe('Session 2 · Wed 6 May, 09:30');
	});
});

describe('conferenceDayText', () => {
	it('counts the days while the conference runs', () => {
		expect(conferenceDayText('2020-05-05', '2020-05-07', '2020-05-06')).toBe('day 2 of 3');
		expect(conferenceDayText('2020-05-05', '2020-05-05', '2020-05-05')).toBe('day 1 of 1');
	});

	it('gives the dates before it starts, and nothing once it is over', () => {
		expect(conferenceDayText('2020-05-05', '2020-05-07', '2020-05-01')).toBe('5 – 7 May 2020');
		expect(conferenceDayText('2020-05-05', '2020-05-07', '2020-05-08')).toBeNull();
	});
});

describe('lobbyView', () => {
	// 07:00 to 15:40 UTC on 5 May is 09:00 to 17:40 in Amsterdam.
	const ENDED: CommitteeSession = {
		id: 'session-1',
		name: 'Session 1',
		status: 'ended',
		startedAt: '2020-05-05T07:00:00Z',
		endedAt: '2020-05-05T09:14:00Z'
	};
	const RECORD: SessionRecord = {
		sessionId: 'session-1',
		speechCount: 23,
		decidedMotionCount: 4,
		passedMotionCount: 3,
		votes: [{ subject: 'Draft Resolution 1.1', passed: true }]
	};
	const NEXT_SESSION = {
		...event('session-2', '2020-05-06T07:30:00Z', 'committee', 'committee-1'),
		title: 'Session 2',
		location: 'Council Chamber'
	};
	const ROOM: LobbyRoom = {
		conference: {
			id: 'conference-1',
			slug: 'northbridge',
			name: 'Northbridge MUN',
			startDate: '2020-05-05',
			endDate: '2020-05-07',
			timezone: 'Europe/Amsterdam'
		},
		committee: {
			id: 'committee-1',
			slug: 'unsc',
			name: 'Security Council',
			room: 'Council Chamber',
			topics: ['Humanitarian access', 'Maritime security']
		},
		today: '2020-05-06',
		sessions: [ENDED],
		seats: [
			{ id: 'seat-1', name: 'France', countryCode: 'FR' },
			{ id: 'seat-2', name: 'Chad', countryCode: 'TD' }
		],
		isOrganiser: false
	};
	const FACTS: LobbyFacts = {
		filledSeatCount: 1,
		lastSessionRecord: RECORD,
		nextScheduleEvent: NEXT_SESSION,
		isQuickSession: false
	};

	it('gathers the committee, the next session, the last one and the schedule', () => {
		const view = lobbyView(ROOM, FACTS, 'Humanitarian access');

		expect(view).toEqual({
			committeeName: 'Security Council',
			whereLine: 'Northbridge MUN · Council Chamber · day 2 of 3',
			sessionName: 'Session 2',
			startLabel: 'Start Session 2',
			isPracticeSession: false,
			agendaLine: 'Agenda carries over: Humanitarian access',
			seatsLine: '2 seats · 1 delegate assigned',
			hasSeats: true,
			addSeatsHref: null,
			lastSession: {
				summary: 'Session 1 · ended yesterday at 11:14 · 2 h 14 min',
				recordLine: '23 speeches · 4 motions, 3 passed · 1 vote: Draft Resolution 1.1 passed',
				recordHref: '/conferences/northbridge/committees/unsc/chair/motions?session=session-1'
			},
			nextOnSchedule: 'Session 2 · 09:30, Council Chamber',
			editDelegationsHref: null
		});
	});

	it('offers a practice session before the first day, with the conference dates', () => {
		const view = lobbyView({ ...ROOM, today: '2020-05-01', sessions: [] }, FACTS, null);

		expect(view.sessionName).toBe('Practice session');
		expect(view.startLabel).toBe('Start a practice session');
		expect(view.isPracticeSession).toBe(true);
		expect(view.whereLine).toBe('Northbridge MUN · Council Chamber · 5 – 7 May 2020');
		expect(view.agendaLine).toBe('No agenda yet');
		expect(view.lastSession).toBeNull();
	});

	it('writes an earlier day by its date, and leaves out the agenda without topics', () => {
		const room = { ...ROOM, today: '2020-05-07', committee: { ...ROOM.committee, topics: [] } };
		const view = lobbyView(room, FACTS, null);

		expect(view.lastSession?.summary).toBe('Session 1 · ended 5 May at 11:14 · 2 h 14 min');
		expect(view.agendaLine).toBeNull();
	});

	it('shows no record line while the record read is not this session’s', () => {
		const otherRecord = { ...RECORD, sessionId: 'session-0' };
		const view = lobbyView(ROOM, { ...FACTS, lastSessionRecord: otherRecord }, null);

		expect(view.lastSession?.recordLine).toBeNull();
	});

	it('says a committee with no seats has none, and offers an organiser "Add seats"', () => {
		const empty = { ...ROOM, seats: [] };

		expect(lobbyView(empty, FACTS, null)).toMatchObject({
			seatsLine: NO_SEATS_SENTENCE,
			hasSeats: false,
			addSeatsHref: null
		});
		expect(lobbyView({ ...empty, isOrganiser: true }, FACTS, null).addSeatsHref).toBe(
			'/manage/northbridge/committees/committee-1'
		);
	});

	it('draws a quick session’s lobby: no practice, no conference line or schedule, delegations', () => {
		const quick = { ...FACTS, isQuickSession: true };
		const view = lobbyView({ ...ROOM, today: '2020-05-01' }, quick, null);

		expect(view).toMatchObject({
			startLabel: 'Start Session 2',
			isPracticeSession: false,
			whereLine: null,
			seatsLine: '2 delegations',
			nextOnSchedule: null,
			editDelegationsHref: '/quick/northbridge/delegations'
		});
	});
});
