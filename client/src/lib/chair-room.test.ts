import { describe, expect, it } from 'vitest';
import {
	ROOM_REFUSALS,
	defaultSessionName,
	isPastTopicLimit,
	isSessionRunning,
	liveRoomScreen,
	presentSeats,
	readAgendaTopic,
	readNewTopic,
	readTimerSeconds,
	roomState,
	runningSinceText,
	speakingEntry,
	yieldCandidates,
	type CommitteeSession,
	type RoomStateFacts,
	type RoomSpeaker
} from './chair-room';
import type { RoomSeat } from './committee-room';

/** A session with the given id and status. */
function session(id: string, status: CommitteeSession['status']): CommitteeSession {
	return { id, name: `Session ${id}`, status, startedAt: null, endedAt: null };
}

const FRANCE: RoomSeat = { id: 'seat-france', name: 'France', countryCode: 'FR' };
const GHANA: RoomSeat = { id: 'seat-ghana', name: 'Ghana', countryCode: 'GH' };
const JAPAN: RoomSeat = { id: 'seat-japan', name: 'Japan', countryCode: 'JP' };
const SEATS = [FRANCE, GHANA, JAPAN];

/** A speakers list entry for `seat`. */
function speaker(
	id: string,
	seat: RoomSeat,
	position: number,
	status: RoomSpeaker['status']
): RoomSpeaker {
	return { id, seat, position, status };
}

describe('isSessionRunning', () => {
	it('is true only for a session in progress', () => {
		expect(isSessionRunning(session('1', 'in_progress'))).toBe(true);
		expect(isSessionRunning(session('1', 'scheduled'))).toBe(false);
		expect(isSessionRunning(session('1', 'ended'))).toBe(false);
		expect(isSessionRunning(null)).toBe(false);
	});
});

/** A session that started (and maybe ended) at the given moments. */
function datedSession(
	id: string,
	status: CommitteeSession['status'],
	startedAt: string,
	endedAt: string | null = null
): CommitteeSession {
	return { id, name: `Session ${id}`, status, startedAt, endedAt };
}

/** The conference the dated tests use: it opens on 5 May 2020 in Amsterdam. */
const AMSTERDAM_CONFERENCE = { startDate: '2020-05-05', timezone: 'Europe/Amsterdam' };

describe('defaultSessionName', () => {
	it('names the first session of a committee with none "Session 1" from the first day on', () => {
		expect(defaultSessionName([], AMSTERDAM_CONFERENCE, '2020-05-05')).toBe('Session 1');
		expect(defaultSessionName([], AMSTERDAM_CONFERENCE, '2020-05-07')).toBe('Session 1');
	});

	it('counts on from the sessions started on or after the first day', () => {
		const sessions = [
			datedSession('2', 'ended', '2020-05-06T08:00:00Z'),
			datedSession('1', 'ended', '2020-05-05T08:00:00Z')
		];

		expect(defaultSessionName(sessions, AMSTERDAM_CONFERENCE, '2020-05-06')).toBe('Session 3');
	});

	it('names sessions before the first day practice sessions', () => {
		const onePractice = [datedSession('p1', 'ended', '2020-05-01T08:00:00Z')];

		expect(defaultSessionName([], AMSTERDAM_CONFERENCE, '2020-05-01')).toBe('Practice session');
		expect(defaultSessionName(onePractice, AMSTERDAM_CONFERENCE, '2020-05-01')).toBe(
			'Practice session 2'
		);
	});

	it('still names the first session on the first day "Session 1" after practice sessions', () => {
		const practices = [
			datedSession('p2', 'ended', '2020-05-02T08:00:00Z'),
			datedSession('p1', 'ended', '2020-05-01T08:00:00Z')
		];

		expect(defaultSessionName(practices, AMSTERDAM_CONFERENCE, '2020-05-05')).toBe('Session 1');
	});

	it("counts a session by the day it started in the conference's timezone", () => {
		// 22:30 UTC on the 4th is already 00:30 on the 5th in Amsterdam: the first day.
		const justAfterMidnight = [datedSession('1', 'ended', '2020-05-04T22:30:00Z')];

		expect(defaultSessionName(justAfterMidnight, AMSTERDAM_CONFERENCE, '2020-05-05')).toBe(
			'Session 2'
		);
	});
});

/** The facts of a room with no session, on the conference's first day, to be changed per test. */
function roomFacts(changes: Partial<RoomStateFacts>): RoomStateFacts {
	return {
		mode: 'idle',
		currentSession: null,
		sessions: [],
		hasAnyoneSpoken: false,
		today: '2020-05-05',
		timezone: 'Europe/Amsterdam',
		...changes
	};
}

describe('roomState', () => {
	const RUNNING = datedSession('1', 'in_progress', '2020-05-05T07:00:00Z');

	it('is ready with no session at all', () => {
		expect(roomState(roomFacts({}))).toBe('lobby');
	});

	it('is ready before the first day, when the next session is a practice one', () => {
		expect(roomState(roomFacts({ today: '2020-05-01' }))).toBe('lobby');
	});

	it('is opening while nobody has been called to speak, whatever roll call and agenda say', () => {
		const running = {
			currentSession: RUNNING,
			sessions: [RUNNING],
			mode: 'formal_debate' as const
		};

		// Roll call and the agenda are not among the facts at all: the band
		// stays after both steps, so the chair can still correct them (S5).
		expect(roomState(roomFacts(running))).toBe('opening');
	});

	it('is in debate once someone has been called to speak', () => {
		const running = {
			currentSession: RUNNING,
			sessions: [RUNNING],
			mode: 'formal_debate' as const
		};

		expect(roomState(roomFacts({ ...running, hasAnyoneSpoken: true }))).toBe('debate');
	});

	it('is suspended while a session is in progress in the suspended mode', () => {
		const suspended = { currentSession: RUNNING, sessions: [RUNNING], mode: 'suspended' as const };

		expect(roomState(roomFacts(suspended))).toBe('suspended');
		expect(roomState(roomFacts({ ...suspended, hasAnyoneSpoken: true }))).toBe('suspended');
	});

	it('is ended when the latest session ended today, and ready again the next morning', () => {
		const ended = datedSession('1', 'ended', '2020-05-05T07:00:00Z', '2020-05-05T14:58:00Z');

		expect(roomState(roomFacts({ sessions: [ended] }))).toBe('ended');
		expect(roomState(roomFacts({ sessions: [ended], today: '2020-05-06' }))).toBe('lobby');
	});

	it("reads the day a session ended in the conference's timezone", () => {
		// 22:30 UTC on the 5th is 00:30 on the 6th in Amsterdam.
		const endedLate = datedSession('1', 'ended', '2020-05-05T07:00:00Z', '2020-05-05T22:30:00Z');

		expect(roomState(roomFacts({ sessions: [endedLate], today: '2020-05-06' }))).toBe('ended');
		expect(roomState(roomFacts({ sessions: [endedLate], today: '2020-05-05' }))).toBe('lobby');
	});

	it('is ended after a practice session that ended today', () => {
		const practice = datedSession('p1', 'ended', '2020-05-01T07:00:00Z', '2020-05-01T09:00:00Z');

		expect(roomState(roomFacts({ sessions: [practice], today: '2020-05-01' }))).toBe('ended');
	});

	it('is running, not ready, when a session was left in progress overnight', () => {
		const overnight = datedSession('1', 'in_progress', '2020-05-04T07:00:00Z');
		const facts = roomFacts({
			currentSession: overnight,
			sessions: [overnight],
			mode: 'formal_debate',
			hasAnyoneSpoken: true
		});

		expect(roomState(facts)).toBe('debate');
	});
});

describe('readNewTopic', () => {
	it('takes the typed topic without the spaces around it', () => {
		expect(readNewTopic('  Sanctions ')).toEqual({ topic: 'Sanctions' });
	});

	it('refuses an empty topic and one over 200 characters', () => {
		expect(readNewTopic('   ')).toEqual({ refusal: ROOM_REFUSALS.newTopicEmpty });
		expect(readNewTopic(null)).toEqual({ refusal: ROOM_REFUSALS.newTopicEmpty });
		expect(readNewTopic('x'.repeat(201))).toEqual({ refusal: ROOM_REFUSALS.newTopicTooLong });
		expect(readNewTopic('x'.repeat(200))).toEqual({ topic: 'x'.repeat(200) });
	});
});

describe('isPastTopicLimit', () => {
	const fortyNine = Array.from({ length: 49 }, (_, index) => `Topic ${index + 1}`);
	const fifty = [...fortyNine, 'Topic 50'];

	it('lets a committee reach fifty topics and refuses a fifty-first', () => {
		expect(isPastTopicLimit(fortyNine, 'Sanctions')).toBe(false);
		expect(isPastTopicLimit(fifty, 'Sanctions')).toBe(true);
	});

	it('never refuses a topic the committee already has, which adds nothing', () => {
		expect(isPastTopicLimit(fifty, 'Topic 50')).toBe(false);
	});
});

describe('readAgendaTopic', () => {
	const TOPICS = ['Climate finance', 'Protection of civilians'];

	it("accepts one of the committee's topics exactly as it is written", () => {
		expect(readAgendaTopic('Protection of civilians', TOPICS)).toBe('Protection of civilians');
	});

	it('refuses a topic the committee does not have, however close', () => {
		expect(readAgendaTopic('climate finance', TOPICS)).toBeNull();
		expect(readAgendaTopic(' Climate finance', TOPICS)).toBeNull();
		expect(readAgendaTopic('Sanctions', TOPICS)).toBeNull();
		expect(readAgendaTopic('', TOPICS)).toBeNull();
	});

	it('refuses a missing field and a file', () => {
		expect(readAgendaTopic(null, TOPICS)).toBeNull();
		expect(readAgendaTopic(new File([], 'Climate finance'), TOPICS)).toBeNull();
	});
});

describe('readTimerSeconds', () => {
	it('accepts whole seconds from 1 to 3600', () => {
		expect(readTimerSeconds('1')).toBe(1);
		expect(readTimerSeconds('3600')).toBe(3600);
	});

	it('answers the fallback for an empty or missing field', () => {
		expect(readTimerSeconds('', 15)).toBe(15);
		expect(readTimerSeconds(null, 15)).toBe(15);
		expect(readTimerSeconds(null)).toBeNull();
	});

	it('refuses a number out of range or not a whole number', () => {
		expect(readTimerSeconds('0', 15)).toBeNull();
		expect(readTimerSeconds('3601')).toBeNull();
		expect(readTimerSeconds('-5')).toBeNull();
		expect(readTimerSeconds('1e3')).toBeNull();
	});
});

describe('presentSeats', () => {
	it('counts every seat as present before a roll call', () => {
		expect(presentSeats(SEATS, {})).toEqual(SEATS);
	});

	it('leaves out only the seats marked absent', () => {
		const attendance = {
			'seat-france': 'present',
			'seat-ghana': 'absent',
			'seat-japan': 'present_and_voting'
		} as const;

		expect(presentSeats(SEATS, attendance)).toEqual([FRANCE, JAPAN]);
	});
});

describe('yieldCandidates', () => {
	it('leaves out the speaker and the absent seats', () => {
		const attendance = { 'seat-ghana': 'absent' } as const;

		expect(yieldCandidates(SEATS, attendance, 'seat-france')).toEqual([JAPAN]);
	});

	it('offers every present seat when nobody is speaking', () => {
		expect(yieldCandidates(SEATS, {}, null)).toEqual(SEATS);
	});
});

describe('speakingEntry', () => {
	const speakers = [speaker('a', FRANCE, 1, 'speaking'), speaker('b', GHANA, 2, 'waiting')];

	it('finds the entry the room points at', () => {
		expect(speakingEntry(speakers, 'a')?.seat).toEqual(FRANCE);
	});

	it('is null when nobody has the floor or the entry is not on the list', () => {
		expect(speakingEntry(speakers, null)).toBeNull();
		expect(speakingEntry(speakers, 'missing')).toBeNull();
	});
});

describe('liveRoomScreen', () => {
	it("draws the room's own screen in the lobby, while suspended and once ended", () => {
		expect(liveRoomScreen('lobby', 'idle')).toBe('lobby');
		expect(liveRoomScreen('suspended', 'suspended')).toBe('suspended');
		expect(liveRoomScreen('ended', 'idle')).toBe('ended');
	});

	it('draws the GSL with the opening band during the opening, in formal debate', () => {
		expect(liveRoomScreen('opening', 'formal_debate')).toBe('opening');
	});

	it("draws the live mode's view in debate, and in an opening in another mode", () => {
		expect(liveRoomScreen('debate', 'formal_debate')).toBe('gsl');
		expect(liveRoomScreen('debate', 'moderated_caucus')).toBe('mod');
		expect(liveRoomScreen('debate', 'unmoderated_caucus')).toBe('unmod');
		expect(liveRoomScreen('debate', 'single_speaker')).toBe('single');
		expect(liveRoomScreen('debate', 'voting')).toBe('voting');
		expect(liveRoomScreen('opening', 'voting')).toBe('voting');
	});
});

describe('runningSinceText', () => {
	/** Session 2, in progress, started at 16:40 in Amsterdam on 5 May 2020. */
	const OVERNIGHT: CommitteeSession = {
		id: '2',
		name: 'Session 2',
		status: 'in_progress',
		startedAt: '2020-05-05T14:40:00Z',
		endedAt: null
	};

	it('says a session left running overnight has run since yesterday', () => {
		expect(runningSinceText(OVERNIGHT, '2020-05-06', 'Europe/Amsterdam')).toBe(
			'Session 2 has been running since yesterday, 16:40.'
		);
	});

	it('names the day of a session started earlier still', () => {
		expect(runningSinceText(OVERNIGHT, '2020-05-08', 'Europe/Amsterdam')).toBe(
			'Session 2 has been running since 5 May, 16:40.'
		);
	});

	it('says nothing of a session started today, or of none running', () => {
		expect(runningSinceText(OVERNIGHT, '2020-05-05', 'Europe/Amsterdam')).toBeNull();
		expect(runningSinceText(null, '2020-05-06', 'Europe/Amsterdam')).toBeNull();
		expect(runningSinceText({ ...OVERNIGHT, status: 'ended' }, '2020-05-06', 'UTC')).toBeNull();
	});
});
