import { describe, expect, it } from 'vitest';
import {
	RETURN_TIME_MINUTES,
	backAtCountdownText,
	backAtText,
	formatMinutes,
	readBackAt,
	readReturnMinutes,
	readReturnTime,
	resumeSentence,
	returnTimeAfter,
	suspendedForText,
	suspensionLine,
	watcherSuspensionLine,
	type ResumeFacts
} from './suspension';

/** Amsterdam is two hours ahead of UTC in October 2026, until the clocks go back on the 25th. */
const AMSTERDAM = 'Europe/Amsterdam';

/** 13:19 in Amsterdam. */
const NOW = new Date('2026-10-01T11:19:00.000Z');

/** 14:00 in Amsterdam. */
const BACK_AT_TWO = '2026-10-01T12:00:00.000Z';

describe('RETURN_TIME_MINUTES', () => {
	it('offers 10, 15, 30 and 60 minutes', () => {
		expect(RETURN_TIME_MINUTES).toEqual([10, 15, 30, 60]);
	});
});

describe('formatMinutes', () => {
	it('writes minutes, and hours with minutes from an hour on', () => {
		expect(formatMinutes(0)).toBe('0 min');
		expect(formatMinutes(41)).toBe('41 min');
		expect(formatMinutes(60)).toBe('1 h');
		expect(formatMinutes(65)).toBe('1 h 5 min');
		expect(formatMinutes(134)).toBe('2 h 14 min');
	});
});

describe('suspendedForText', () => {
	it('counts the whole minutes since the room was suspended', () => {
		expect(suspendedForText('2026-10-01T11:07:00.000Z', NOW)).toBe('12 min so far');
		expect(suspendedForText('2026-10-01T11:06:01.000Z', NOW)).toBe('12 min so far');
		expect(suspendedForText('2026-10-01T10:14:00.000Z', NOW)).toBe('1 h 5 min so far');
	});

	it('starts at none, and never below', () => {
		expect(suspendedForText('2026-10-01T11:18:30.000Z', NOW)).toBe('0 min so far');
		expect(suspendedForText('2026-10-01T11:20:00.000Z', NOW)).toBe('0 min so far');
	});
});

describe('backAtText', () => {
	it('counts down to the return time in whole minutes, rounded up', () => {
		expect(backAtText(BACK_AT_TWO, NOW, AMSTERDAM)).toBe('Back at 14:00 · in 41 min');

		const halfAMinuteBefore = new Date('2026-10-01T11:59:30.000Z');

		expect(backAtText(BACK_AT_TWO, halfAMinuteBefore, AMSTERDAM)).toBe('Back at 14:00 · in 1 min');
	});

	it('says "now" in the minute the time comes, then how long ago it was', () => {
		const atTwo = new Date(BACK_AT_TWO);
		const justAfter = new Date('2026-10-01T12:00:59.000Z');
		const later = new Date('2026-10-01T12:03:10.000Z');
		const muchLater = new Date('2026-10-01T13:05:00.000Z');

		expect(backAtText(BACK_AT_TWO, atTwo, AMSTERDAM)).toBe('Back at 14:00 · now');
		expect(backAtText(BACK_AT_TWO, justAfter, AMSTERDAM)).toBe('Back at 14:00 · now');
		expect(backAtText(BACK_AT_TWO, later, AMSTERDAM)).toBe('Back at 14:00 · 3 min ago');
		expect(backAtText(BACK_AT_TWO, muchLater, AMSTERDAM)).toBe('Back at 14:00 · 1 h 5 min ago');
	});

	it("writes the time in the conference's timezone", () => {
		expect(backAtText(BACK_AT_TWO, NOW, 'Europe/London')).toBe('Back at 13:00 · in 41 min');
	});
});

describe('backAtCountdownText', () => {
	it('counts down, in hours and minutes for a long wait', () => {
		const backAtHalfPastThree = '2026-10-01T13:34:00.000Z';

		expect(backAtCountdownText(BACK_AT_TWO, NOW, AMSTERDAM)).toBe('Back at 14:00 · in 41 min');
		expect(backAtCountdownText(backAtHalfPastThree, NOW, AMSTERDAM)).toBe(
			'Back at 15:34 · in 2 h 15 min'
		);
	});

	it('says "any moment now" once the time has come', () => {
		const later = new Date('2026-10-01T12:30:00.000Z');

		expect(backAtCountdownText(BACK_AT_TWO, new Date(BACK_AT_TWO), AMSTERDAM)).toBe(
			'Back at 14:00 · any moment now'
		);
		expect(backAtCountdownText(BACK_AT_TWO, later, AMSTERDAM)).toBe(
			'Back at 14:00 · any moment now'
		);
	});
});

describe('suspensionLine and watcherSuspensionLine', () => {
	const suspendedAt = '2026-10-01T11:07:00.000Z';
	const afterTwo = new Date('2026-10-01T12:03:00.000Z');

	it('count up while no return time is set', () => {
		const suspension = { suspendedAt, suspendedUntil: null };

		expect(suspensionLine(suspension, NOW, AMSTERDAM)).toBe('12 min so far');
		expect(watcherSuspensionLine(suspension, NOW, AMSTERDAM)).toBe('12 min so far');
	});

	it('count down to a return time, and differ only once it has passed', () => {
		const suspension = { suspendedAt, suspendedUntil: BACK_AT_TWO };

		expect(suspensionLine(suspension, NOW, AMSTERDAM)).toBe('Back at 14:00 · in 41 min');
		expect(watcherSuspensionLine(suspension, NOW, AMSTERDAM)).toBe('Back at 14:00 · in 41 min');
		expect(suspensionLine(suspension, afterTwo, AMSTERDAM)).toBe('Back at 14:00 · 3 min ago');
		expect(watcherSuspensionLine(suspension, afterTwo, AMSTERDAM)).toBe(
			'Back at 14:00 · any moment now'
		);
	});
});

describe('returnTimeAfter', () => {
	it('adds the minutes to the press, rounded up to the next whole minute', () => {
		const pressed = new Date('2026-10-01T11:47:30.000Z');

		expect(returnTimeAfter(10, pressed)).toBe('2026-10-01T11:58:00.000Z');
	});

	it('keeps a press made on the minute', () => {
		expect(returnTimeAfter(15, NOW)).toBe('2026-10-01T11:34:00.000Z');
	});
});

describe('readReturnMinutes', () => {
	it('reads a whole number of minutes from 1 to 240', () => {
		expect(readReturnMinutes('10')).toBe(10);
		expect(readReturnMinutes(' 60 ')).toBe(60);
		expect(readReturnMinutes('1')).toBe(1);
		expect(readReturnMinutes('240')).toBe(240);
	});

	it('refuses anything else', () => {
		for (const value of ['0', '241', '1.5', '-5', 'ten', '', null]) {
			expect(readReturnMinutes(value)).toBeNull();
		}
	});
});

describe('readBackAt', () => {
	it("reads a time today in the conference's timezone", () => {
		expect(readBackAt('14:00', NOW, AMSTERDAM)).toBe(BACK_AT_TWO);
		expect(readBackAt(' 9:30 ', NOW, AMSTERDAM)).toBe('2026-10-01T07:30:00.000Z');
	});

	it("takes today as the conference's own date, not the server's", () => {
		// 23:30 UTC on 1 October is already 01:30 on 2 October in Amsterdam.
		const lateAtNight = new Date('2026-10-01T23:30:00.000Z');

		expect(readBackAt('02:00', lateAtNight, AMSTERDAM)).toBe('2026-10-02T00:00:00.000Z');
	});

	it('refuses what is not a time of day', () => {
		for (const value of ['24:00', '13:60', '1330', '13:3', 'lunch', '', null]) {
			expect(readBackAt(value, NOW, AMSTERDAM)).toBeNull();
		}
	});
});

describe('readReturnTime', () => {
	it("takes a minute button's minutes over the time field beside it", () => {
		expect(readReturnTime('15', '14:00', NOW, AMSTERDAM)).toEqual({
			suspendedUntil: '2026-10-01T11:34:00.000Z',
			refusal: null
		});
	});

	it('refuses minutes it cannot read', () => {
		expect(readReturnTime('500', null, NOW, AMSTERDAM)).toEqual({
			suspendedUntil: null,
			refusal: 'Choose a return time such as 14:00.'
		});
	});

	it('takes a typed time later than now', () => {
		expect(readReturnTime(null, '14:00', NOW, AMSTERDAM)).toEqual({
			suspendedUntil: BACK_AT_TWO,
			refusal: null
		});
		expect(readReturnTime(' ', '14:00', NOW, AMSTERDAM).suspendedUntil).toBe(BACK_AT_TWO);
	});

	it('refuses a typed time that is not later than now', () => {
		const refused = { suspendedUntil: null, refusal: 'Choose a time later than now.' };

		expect(readReturnTime(null, '13:00', NOW, AMSTERDAM)).toEqual(refused);
		expect(readReturnTime(null, '13:19', NOW, AMSTERDAM)).toEqual(refused);
	});

	it('refuses a form with neither, or a time it cannot read', () => {
		const refused = { suspendedUntil: null, refusal: 'Choose a return time such as 14:00.' };

		expect(readReturnTime(null, null, NOW, AMSTERDAM)).toEqual(refused);
		expect(readReturnTime('', '', NOW, AMSTERDAM)).toEqual(refused);
		expect(readReturnTime(null, 'after lunch', NOW, AMSTERDAM)).toEqual(refused);
	});
});

describe('resumeSentence', () => {
	const gsl: ResumeFacts = {
		mode: 'formal_debate',
		speakerName: 'China',
		timerSecondsLeft: 52,
		waitingCount: 3,
		caucusSecondsLeft: null,
		voteSubject: null
	};

	it('names the GSL speaker and the time they have left', () => {
		expect(resumeSentence(gsl)).toBe('When the session resumes: GSL, China with 0:52 left');
	});

	it('names a GSL speaker without a clock alone', () => {
		expect(resumeSentence({ ...gsl, timerSecondsLeft: null })).toBe(
			'When the session resumes: GSL, China'
		);
	});

	it('counts the seats waiting when nobody has the floor', () => {
		const empty = { ...gsl, speakerName: null, timerSecondsLeft: null };

		expect(resumeSentence(empty)).toBe('When the session resumes: GSL, 3 waiting to speak');
		expect(resumeSentence({ ...empty, waitingCount: 0 })).toBe(
			'When the session resumes: GSL, nobody waiting to speak'
		);
	});

	it('reads no mode on record as formal debate', () => {
		expect(resumeSentence({ ...gsl, mode: null })).toBe(
			'When the session resumes: GSL, China with 0:52 left'
		);
	});

	it("names a moderated caucus by its own clock's time left", () => {
		const caucus = { ...gsl, mode: 'moderated_caucus', caucusSecondsLeft: 372 } as const;

		expect(resumeSentence(caucus)).toBe(
			'When the session resumes: moderated caucus, 6:12 of the caucus left'
		);
		expect(resumeSentence({ ...caucus, caucusSecondsLeft: null })).toBe(
			'When the session resumes: moderated caucus'
		);
	});

	it("names an unmoderated caucus by its clock's time left", () => {
		const caucus = { ...gsl, mode: 'unmoderated_caucus', timerSecondsLeft: 522 } as const;

		expect(resumeSentence(caucus)).toBe('When the session resumes: unmoderated caucus, 8:42 left');
		expect(resumeSentence({ ...caucus, timerSecondsLeft: null })).toBe(
			'When the session resumes: unmoderated caucus'
		);
	});

	it('names the single speaker', () => {
		const single = { ...gsl, mode: 'single_speaker', speakerName: 'Kenya' } as const;

		expect(resumeSentence(single)).toBe('When the session resumes: single speaker, Kenya');
		expect(resumeSentence({ ...single, speakerName: null })).toBe(
			'When the session resumes: single speaker'
		);
	});

	it('names the vote, or says none is open yet', () => {
		const voting = { ...gsl, mode: 'voting', voteSubject: 'Draft Resolution 1.1' } as const;

		expect(resumeSentence(voting)).toBe(
			'When the session resumes: the vote on Draft Resolution 1.1'
		);
		expect(resumeSentence({ ...voting, voteSubject: null })).toBe(
			'When the session resumes: voting, no vote open yet'
		);
	});
});
