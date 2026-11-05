import { describe, expect, it } from 'vitest';
import {
	CLEARED_TIMER,
	callableSpeakers,
	clockState,
	countPresent,
	dueBackAt,
	formatClock,
	formatDuration,
	nextSpeaker,
	ordinal,
	quorum,
	rankMotions,
	pausedTimer,
	readyTimer,
	remainingSeconds,
	resetTimer,
	resumedTimer,
	secondsLeftOrOver,
	simpleMajority,
	startedTimer,
	spokeSeconds,
	timerTone,
	timerWithAddedSeconds,
	twoThirds,
	voteResult,
	votesNeeded,
	type RoomMotion,
	type SpeakerEntry,
	type SpeakerEntryWithSeat
} from './committee-room';

describe('countPresent', () => {
	it('counts present and present-and-voting seats, not absent ones', () => {
		const attendance = {
			'seat-fr': 'present',
			'seat-br': 'present_and_voting',
			'seat-ke': 'absent'
		} as const;

		expect(countPresent(attendance)).toBe(2);
	});

	it('is zero before any roll call', () => {
		expect(countPresent({})).toBe(0);
	});
});

describe('quorum', () => {
	it('needs half of the available seats, rounded up', () => {
		expect(quorum(8, 15)).toEqual({ needed: 8, hasQuorum: true });
		expect(quorum(7, 15)).toEqual({ needed: 8, hasQuorum: false });
		expect(quorum(5, 10)).toEqual({ needed: 5, hasQuorum: true });
	});
});

describe('simpleMajority and twoThirds', () => {
	it('needs more than half', () => {
		expect(simpleMajority(14)).toBe(8);
		expect(simpleMajority(15)).toBe(8);
		expect(simpleMajority(0)).toBe(1);
	});

	it('needs two thirds, rounded up', () => {
		expect(twoThirds(15)).toBe(10);
		expect(twoThirds(8)).toBe(6);
		expect(twoThirds(9)).toBe(6);
	});
});

describe('voteResult', () => {
	it('passes a simple majority when more voted for than against', () => {
		expect(voteResult({ for: 6, against: 5, abstain: 3 }, 'simple')).toBe(true);
		expect(voteResult({ for: 5, against: 6, abstain: 0 }, 'simple')).toBe(false);
	});

	it('fails a tie under either majority', () => {
		expect(voteResult({ for: 5, against: 5, abstain: 0 }, 'simple')).toBe(false);
		expect(voteResult({ for: 5, against: 5, abstain: 0 }, 'two_thirds')).toBe(false);
	});

	it('leaves abstentions out of the count', () => {
		// 6 of the 8 who voted for or against is exactly two thirds.
		expect(voteResult({ for: 6, against: 2, abstain: 7 }, 'two_thirds')).toBe(true);
		expect(voteResult({ for: 6, against: 4, abstain: 0 }, 'two_thirds')).toBe(false);
	});

	it('fails a vote nobody took part in', () => {
		expect(voteResult({ for: 0, against: 0, abstain: 0 }, 'simple')).toBe(false);
		expect(voteResult({ for: 0, against: 0, abstain: 4 }, 'two_thirds')).toBe(false);
	});
});

describe('votesNeeded', () => {
	it('matches the voting page wireframe: 6 for, 2 against, two thirds needs 6', () => {
		expect(votesNeeded({ for: 6, against: 2, abstain: 1 }, 'two_thirds')).toBe(6);
		expect(votesNeeded({ for: 6, against: 2, abstain: 1 }, 'simple')).toBe(5);
	});

	it('never asks for fewer than one vote', () => {
		expect(votesNeeded({ for: 0, against: 0, abstain: 0 }, 'two_thirds')).toBe(1);
	});
});

describe('remainingSeconds', () => {
	const now = new Date('2026-09-23T10:00:00.000Z');

	it('counts down to the end of a running timer', () => {
		const timer = { endsAt: '2026-09-23T10:00:47.000Z', pausedRemainingSeconds: null };

		expect(remainingSeconds(timer, now)).toBe(47);
	});

	it('counts a part-second as a whole one', () => {
		const timer = { endsAt: '2026-09-23T10:00:00.300Z', pausedRemainingSeconds: null };

		expect(remainingSeconds(timer, now)).toBe(1);
	});

	it('stops at zero once the time is up', () => {
		const timer = { endsAt: '2026-09-23T09:59:30.000Z', pausedRemainingSeconds: null };

		expect(remainingSeconds(timer, now)).toBe(0);
	});

	it('holds the seconds of a paused timer', () => {
		expect(remainingSeconds({ endsAt: null, pausedRemainingSeconds: 83 }, now)).toBe(83);
	});

	it('is null when no timer is set', () => {
		expect(remainingSeconds({ endsAt: null, pausedRemainingSeconds: null }, now)).toBeNull();
	});
});

describe('secondsLeftOrOver', () => {
	const now = new Date('2026-09-23T10:00:00.000Z');

	it('counts down like remainingSeconds while time is left', () => {
		const running = { endsAt: '2026-09-23T10:00:52.000Z', pausedRemainingSeconds: null };
		const partSecond = { endsAt: '2026-09-23T10:00:00.300Z', pausedRemainingSeconds: null };

		expect(secondsLeftOrOver(running, now)).toBe(52);
		expect(secondsLeftOrOver(partSecond, now)).toBe(1);
	});

	it('goes below zero once a running timer is over, a whole second at a time', () => {
		const sevenOver = { endsAt: '2026-09-23T09:59:53.000Z', pausedRemainingSeconds: null };
		const justOver = { endsAt: '2026-09-23T09:59:59.600Z', pausedRemainingSeconds: null };

		expect(secondsLeftOrOver(sevenOver, now)).toBe(-7);
		expect(secondsLeftOrOver(justOver, now)).toBe(0);
	});

	it('holds a paused timer, never below zero', () => {
		expect(secondsLeftOrOver({ endsAt: null, pausedRemainingSeconds: 38 }, now)).toBe(38);
		expect(secondsLeftOrOver({ endsAt: null, pausedRemainingSeconds: -3 }, now)).toBe(0);
	});

	it('is null when no timer is set', () => {
		expect(secondsLeftOrOver({ endsAt: null, pausedRemainingSeconds: null }, now)).toBeNull();
	});
});

describe('timerTone', () => {
	it('is normal from ten seconds up, amber under ten and red at zero', () => {
		expect(timerTone(10)).toBe('normal');
		expect(timerTone(9)).toBe('warning');
		expect(timerTone(1)).toBe('warning');
		expect(timerTone(0)).toBe('danger');
	});

	it('stays red while the clock is over', () => {
		expect(timerTone(-7)).toBe('danger');
	});
});

describe('formatClock and formatDuration', () => {
	it('writes a clock face with no leading zero on the minutes', () => {
		expect(formatClock(52)).toBe('0:52');
		expect(formatClock(90)).toBe('1:30');
		expect(formatClock(600)).toBe('10:00');
		expect(formatClock(0)).toBe('0:00');
		expect(formatClock(3600)).toBe('60:00');
	});

	it('writes a clock that has gone over with a plus, counting up', () => {
		expect(formatClock(-7)).toBe('+0:07');
		expect(formatClock(-75)).toBe('+1:15');
	});

	it('writes a length of time the same way', () => {
		expect(formatDuration(60)).toBe('1:00');
		expect(formatDuration(90)).toBe('1:30');
		expect(formatDuration(600)).toBe('10:00');
		expect(formatDuration(30)).toBe('0:30');
		expect(formatDuration(-7)).toBe('+0:07');
	});
});

describe('spokeSeconds', () => {
	it('is the speaking time less what was left', () => {
		expect(spokeSeconds(90, 43)).toBe(47);
		expect(spokeSeconds(90, 0)).toBe(90);
	});

	it('is never negative when seconds were added', () => {
		expect(spokeSeconds(60, 75)).toBe(0);
	});
});

describe('nextSpeaker', () => {
	it('is the first waiting entry by position', () => {
		const entries: SpeakerEntry[] = [
			{ id: 'spoke', position: 1, status: 'spoken' },
			{ id: 'later', position: 4, status: 'waiting' },
			{ id: 'removed', position: 2, status: 'removed' },
			{ id: 'next', position: 3, status: 'waiting' },
			{ id: 'speaking', position: 0, status: 'speaking' }
		];

		expect(nextSpeaker(entries)?.id).toBe('next');
	});

	it('is null when nobody is waiting', () => {
		expect(nextSpeaker([{ id: 'done', position: 1, status: 'spoken' }])).toBeNull();
	});

	it('skips a seat the latest roll call marked absent', () => {
		const entries: SpeakerEntryWithSeat[] = [
			{ id: 'kenya', position: 1, status: 'waiting', seat: { id: 'seat-ke' } },
			{ id: 'france', position: 2, status: 'waiting', seat: { id: 'seat-fr' } }
		];
		const attendance = { 'seat-ke': 'absent', 'seat-fr': 'present' } as const;

		expect(nextSpeaker(entries, attendance)?.id).toBe('france');
	});

	it('skips nobody before the first roll call, nor an entry with no seat', () => {
		const entries: SpeakerEntryWithSeat[] = [
			{ id: 'kenya', position: 1, status: 'waiting', seat: { id: 'seat-ke' } },
			{ id: 'guest', position: 0, status: 'waiting', seat: null }
		];

		expect(nextSpeaker(entries)?.id).toBe('guest');
		expect(nextSpeaker(entries, { 'seat-ke': 'absent' })?.id).toBe('guest');
	});

	it('is null when every waiting seat is absent', () => {
		const entries: SpeakerEntryWithSeat[] = [
			{ id: 'kenya', position: 1, status: 'waiting', seat: { id: 'seat-ke' } }
		];

		expect(nextSpeaker(entries, { 'seat-ke': 'absent' })).toBeNull();
	});
});

describe('callableSpeakers', () => {
	it('lists the waiting present entries in the order Next calls them', () => {
		const entries: SpeakerEntryWithSeat[] = [
			{ id: 'japan', position: 4, status: 'waiting', seat: { id: 'seat-jp' } },
			{ id: 'kenya', position: 2, status: 'waiting', seat: { id: 'seat-ke' } },
			{ id: 'brazil', position: 3, status: 'waiting', seat: { id: 'seat-br' } },
			{ id: 'china', position: 1, status: 'speaking', seat: { id: 'seat-cn' } },
			{ id: 'france', position: 0, status: 'spoken', seat: { id: 'seat-fr' } }
		];
		const callable = callableSpeakers(entries, { 'seat-br': 'absent' });

		expect(callable.map((entry) => entry.id)).toEqual(['kenya', 'japan']);
	});

	it('leaves the list it was given in its own order', () => {
		const entries: SpeakerEntry[] = [
			{ id: 'later', position: 2, status: 'waiting' },
			{ id: 'first', position: 1, status: 'waiting' }
		];

		callableSpeakers(entries);

		expect(entries.map((entry) => entry.id)).toEqual(['later', 'first']);
	});
});

describe('rankMotions', () => {
	function motion(overrides: Partial<RoomMotion> & Pick<RoomMotion, 'id' | 'kind'>): RoomMotion {
		return {
			topic: null,
			totalTimeSeconds: null,
			speakingTimeSeconds: null,
			createdAt: '2026-09-23T10:00:00.000Z',
			...overrides
		};
	}

	it('puts the most disruptive kind first', () => {
		const motions = [
			motion({ id: 'other', kind: 'other' }),
			motion({ id: 'close', kind: 'close_debate' }),
			motion({ id: 'moderated', kind: 'moderated_caucus', totalTimeSeconds: 600 }),
			motion({ id: 'extend', kind: 'extend_caucus' }),
			motion({ id: 'introduce', kind: 'introduce_document' }),
			motion({ id: 'unmoderated', kind: 'unmoderated_caucus', totalTimeSeconds: 600 }),
			motion({ id: 'suspend', kind: 'suspend_meeting' }),
			motion({ id: 'adjourn', kind: 'adjourn_meeting' })
		];

		expect(rankMotions(motions).map((ranked) => ranked.id)).toEqual([
			'adjourn',
			'suspend',
			'unmoderated',
			'moderated',
			'extend',
			'close',
			'introduce',
			'other'
		]);
	});

	it('puts the longest caucus first, then the shorter speeches, then the earliest', () => {
		const motions = [
			motion({
				id: 'ten-minutes-long-speeches',
				kind: 'moderated_caucus',
				totalTimeSeconds: 600,
				speakingTimeSeconds: 90
			}),
			motion({
				id: 'ten-minutes-later',
				kind: 'moderated_caucus',
				totalTimeSeconds: 600,
				speakingTimeSeconds: 60,
				createdAt: '2026-09-23T10:05:00.000Z'
			}),
			motion({
				id: 'ten-minutes-earlier',
				kind: 'moderated_caucus',
				totalTimeSeconds: 600,
				speakingTimeSeconds: 60,
				createdAt: '2026-09-23T10:01:00.000Z'
			}),
			motion({
				id: 'fifteen-minutes',
				kind: 'moderated_caucus',
				totalTimeSeconds: 900,
				speakingTimeSeconds: 60
			})
		];

		expect(rankMotions(motions).map((ranked) => ranked.id)).toEqual([
			'fifteen-minutes',
			'ten-minutes-earlier',
			'ten-minutes-later',
			'ten-minutes-long-speeches'
		]);
	});

	it('leaves the array it was given alone', () => {
		const motions = [
			motion({ id: 'other', kind: 'other' }),
			motion({ id: 'adjourn', kind: 'adjourn_meeting' })
		];

		rankMotions(motions);

		expect(motions[0].id).toBe('other');
	});
});

describe('the timer buttons', () => {
	const NOW = new Date('2026-09-23T10:00:00.000Z');

	/** A one-minute timer that started twenty seconds before `NOW`. */
	const RUNNING = startedTimer(60, new Date('2026-09-23T09:59:40.000Z'));

	it('starts a timer that ends that many seconds from now', () => {
		expect(startedTimer(60, NOW)).toEqual({
			totalSeconds: 60,
			endsAt: '2026-09-23T10:01:00.000Z',
			pausedRemainingSeconds: null
		});
	});

	it('pauses a running timer on the seconds it has left and clears its end', () => {
		expect(pausedTimer(RUNNING, NOW)).toEqual({
			totalSeconds: 60,
			endsAt: null,
			pausedRemainingSeconds: 40
		});
	});

	it('has nothing to pause when the timer is not running', () => {
		const paused = pausedTimer(RUNNING, NOW)!;

		expect(pausedTimer(paused, NOW)).toBeNull();
		expect(pausedTimer(CLEARED_TIMER, NOW)).toBeNull();
	});

	it('resumes a paused timer from now, with the seconds it held', () => {
		const paused = pausedTimer(RUNNING, NOW)!;
		const later = new Date('2026-09-23T10:05:00.000Z');

		expect(resumedTimer(paused, later)).toEqual({
			totalSeconds: 60,
			endsAt: '2026-09-23T10:05:40.000Z',
			pausedRemainingSeconds: null
		});
		expect(resumedTimer(RUNNING, later)).toBeNull();
	});

	it('adds seconds to a running timer without changing its length', () => {
		expect(timerWithAddedSeconds(RUNNING, 15, NOW)).toEqual({
			totalSeconds: 60,
			endsAt: '2026-09-23T10:00:55.000Z',
			pausedRemainingSeconds: null
		});
	});

	it('adds seconds to a paused timer', () => {
		const paused = pausedTimer(RUNNING, NOW)!;

		expect(timerWithAddedSeconds(paused, 15, NOW)?.pausedRemainingSeconds).toBe(55);
	});

	it('gives a timer that has run out the added seconds from now', () => {
		const muchLater = new Date('2026-09-23T10:10:00.000Z');

		expect(timerWithAddedSeconds(RUNNING, 15, muchLater)?.endsAt).toBe('2026-09-23T10:10:15.000Z');
	});

	it('has nothing to add to or reset when no timer is set', () => {
		expect(timerWithAddedSeconds(CLEARED_TIMER, 15, NOW)).toBeNull();
		expect(resetTimer(CLEARED_TIMER)).toBeNull();
	});

	it('resets to the full length, paused', () => {
		expect(resetTimer(RUNNING)).toEqual({
			totalSeconds: 60,
			endsAt: null,
			pausedRemainingSeconds: 60
		});
	});
});

describe('ordinal', () => {
	it('writes a place in the list the English way', () => {
		expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
			'1st',
			'2nd',
			'3rd',
			'4th',
			'11th',
			'12th',
			'13th',
			'21st',
			'22nd',
			'23rd',
			'101st',
			'111th'
		]);
	});
});

describe('readyTimer', () => {
	it('holds the full length, paused, for the chair to start', () => {
		expect(readyTimer(90)).toEqual({
			totalSeconds: 90,
			endsAt: null,
			pausedRemainingSeconds: 90
		});
	});
});

describe('clockState', () => {
	const NOW = new Date('2026-09-23T10:00:00.000Z');

	it('is running while the clock counts down', () => {
		expect(clockState(startedTimer(60, NOW))).toBe('running');
	});

	it('is ready before the clock has run, and with no timer at all', () => {
		expect(clockState(readyTimer(60))).toBe('ready');
		expect(clockState(CLEARED_TIMER)).toBe('ready');
	});

	it('is paused once "+15 s" has taken a stopped clock past its length', () => {
		expect(clockState({ totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 74 })).toBe(
			'paused'
		);
	});

	it('is paused once the clock has run and stopped', () => {
		expect(clockState({ totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 52 })).toBe(
			'paused'
		);
		expect(clockState({ totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 0 })).toBe(
			'paused'
		);
	});
});

describe('dueBackAt', () => {
	const NOW = new Date('2026-10-01T14:20:00.000Z');

	it('is the moment a running clock reaches zero', () => {
		const running = { endsAt: '2026-10-01T14:32:00.000Z', pausedRemainingSeconds: null };

		expect(dueBackAt(running, NOW)?.toISOString()).toBe('2026-10-01T14:32:00.000Z');
	});

	it('keeps the moment the room was due once the clock has gone over', () => {
		const over = { endsAt: '2026-10-01T14:19:18.000Z', pausedRemainingSeconds: null };

		expect(dueBackAt(over, NOW)?.toISOString()).toBe('2026-10-01T14:19:18.000Z');
	});

	it('is now plus the time left while paused, so it moves on with the wall clock', () => {
		const paused = { endsAt: null, pausedRemainingSeconds: 21 * 60 };
		const later = new Date(NOW.getTime() + 5 * 60 * 1000);

		expect(dueBackAt(paused, NOW)?.toISOString()).toBe('2026-10-01T14:41:00.000Z');
		expect(dueBackAt(paused, later)?.toISOString()).toBe('2026-10-01T14:46:00.000Z');
	});

	it('is null with no clock set', () => {
		expect(dueBackAt(CLEARED_TIMER, NOW)).toBeNull();
	});
});
