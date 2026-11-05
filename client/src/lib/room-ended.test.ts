import { describe, expect, it } from 'vitest';
import type { CommitteeSession } from './chair-room';
import { endedSummaryView, isLastSessionOfConference } from './room-ended';
import type { LobbyFacts, LobbyRoom } from './room-ready';
import type { ScheduleEvent } from './schedule';

// 11:02 and 14:58 UTC are 13:02 and 16:58 in Amsterdam in May.
const ENDED: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'ended',
	startedAt: '2020-05-06T11:02:00Z',
	endedAt: '2020-05-06T14:58:00Z'
};

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

/** The chair layout's rows on `today`, for a conference from 5 to 7 May 2020. */
function roomOn(today: string): LobbyRoom {
	return {
		conference: {
			id: 'conference-1',
			slug: 'thimun',
			name: 'THIMUN',
			startDate: '2020-05-05',
			endDate: '2020-05-07',
			timezone: 'Europe/Amsterdam'
		},
		committee: {
			id: 'committee-1',
			slug: 'unsc',
			name: 'Security Council',
			room: null,
			topics: []
		},
		today,
		sessions: [ENDED],
		seats: [],
		isOrganiser: false
	};
}

/** The live room's facts, with the next event and the session's record. */
function factsWith(nextScheduleEvent: ScheduleEvent | null, isQuickSession = false): LobbyFacts {
	return {
		filledSeatCount: 0,
		lastSessionRecord: {
			sessionId: 'session-1',
			speechCount: 23,
			decidedMotionCount: 4,
			passedMotionCount: 3,
			votes: [{ subject: 'Draft Resolution 1.1', passed: true }]
		},
		nextScheduleEvent,
		isQuickSession
	};
}

const ROOM_PATH = '/conferences/thimun/committees/unsc/chair';

describe('isLastSessionOfConference', () => {
	it('is false before the last day, whatever the schedule holds', () => {
		expect(isLastSessionOfConference('2020-05-06', '2020-05-07', null)).toBe(false);
	});

	it('is true on the last day with nothing later on the schedule', () => {
		expect(isLastSessionOfConference('2020-05-07', '2020-05-07', null)).toBe(true);
	});

	it('is false on the last day while a later event is still to come', () => {
		expect(isLastSessionOfConference('2020-05-07', '2020-05-07', NEXT_EVENT)).toBe(false);
	});

	it('is true once the conference is over', () => {
		expect(isLastSessionOfConference('2020-05-08', '2020-05-07', NEXT_EVENT)).toBe(true);
	});
});

describe('endedSummaryView', () => {
	it('on an earlier day, starts the next session, with the record, the notes and awards beside it', () => {
		const view = endedSummaryView(roomOn('2020-05-06'), factsWith(NEXT_EVENT));

		expect(view).toEqual({
			title: 'Session 1 has ended',
			summaryLine:
				'3 h 56 min · 23 speeches · 4 motions, 3 passed · 1 vote: Draft Resolution 1.1 passed',
			primary: 'start',
			startLabel: 'Start Session 2',
			awardsHref: `${ROOM_PATH}/awards`,
			recordHref: `${ROOM_PATH}/motions?session=session-1`,
			notesHref: `${ROOM_PATH}/notes/sessions/session-1`,
			editDelegationsHref: null,
			nextOnSchedule: 'Committee session II · tomorrow 09:30, Room 4'
		});
	});

	it('makes awards the step on the last day, or after it, and another session a plain link', () => {
		const lastDay = endedSummaryView(roomOn('2020-05-07'), factsWith(null));
		const over = endedSummaryView(roomOn('2020-05-09'), factsWith(null));

		expect(lastDay).toMatchObject({ primary: 'awards', startLabel: 'Start another session' });
		expect(over?.primary).toBe('awards');
	});

	it('after a practice session has no primary and no awards (R19)', () => {
		const practice: CommitteeSession = {
			...ENDED,
			name: 'Practice session',
			startedAt: '2020-05-01T11:02:00Z',
			endedAt: '2020-05-01T14:58:00Z'
		};
		const room = { ...roomOn('2020-05-01'), sessions: [practice] };
		const view = endedSummaryView(room, factsWith(NEXT_EVENT));

		expect(view).toMatchObject({
			title: 'Practice session has ended',
			primary: 'none',
			startLabel: 'Start another practice session',
			awardsHref: null
		});
	});

	it('in a quick session starts the next session on every day, with the record only', () => {
		const view = endedSummaryView(roomOn('2020-05-09'), factsWith(NEXT_EVENT, true));

		expect(view).toMatchObject({
			primary: 'start',
			startLabel: 'Start Session 2',
			awardsHref: null,
			notesHref: null,
			nextOnSchedule: null
		});
		expect(view?.recordHref).toBe(`${ROOM_PATH}/motions?session=session-1`);
		expect(view?.editDelegationsHref).toBe('/quick/thimun/delegations');
	});

	it('offers "Edit delegations" in a quick session only', () => {
		expect(endedSummaryView(roomOn('2020-05-06'), factsWith(null))?.editDelegationsHref).toBeNull();
	});

	it('shows the length alone while the record read belongs to an earlier session', () => {
		const facts = { ...factsWith(null), lastSessionRecord: null };

		expect(endedSummaryView(roomOn('2020-05-06'), facts)?.summaryLine).toBe('3 h 56 min');
	});

	it('is null while no session has ended', () => {
		expect(endedSummaryView({ ...roomOn('2020-05-06'), sessions: [] }, factsWith(null))).toBeNull();
	});
});
