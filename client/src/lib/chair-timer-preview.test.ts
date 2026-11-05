import { describe, expect, it } from 'vitest';
import { timerAfterPress } from './chair-timer-preview';
import type { TimerSetting } from './committee-room';

const NOW = new Date('2026-09-25T10:00:00.000Z');

/** A one-minute timer with fifty seconds left at `NOW`. */
const RUNNING: TimerSetting = {
	totalSeconds: 60,
	endsAt: '2026-09-25T10:00:50.000Z',
	pausedRemainingSeconds: null
};

const PAUSED: TimerSetting = { totalSeconds: 60, endsAt: null, pausedRemainingSeconds: 42 };

const NO_TIMER: TimerSetting = { totalSeconds: null, endsAt: null, pausedRemainingSeconds: null };

describe('timerAfterPress', () => {
	it('starts a timer of the given length from now', () => {
		expect(timerAfterPress('?/timerStart', NO_TIMER, 90, NOW)).toEqual({
			totalSeconds: 90,
			endsAt: '2026-09-25T10:01:30.000Z',
			pausedRemainingSeconds: null
		});
	});

	it('pauses a running timer with the seconds it has left', () => {
		expect(timerAfterPress('?/timerPause', RUNNING, 90, NOW)).toEqual({
			totalSeconds: 60,
			endsAt: null,
			pausedRemainingSeconds: 50
		});
	});

	it('resumes a paused timer from now', () => {
		expect(timerAfterPress('?/timerResume', PAUSED, 90, NOW)?.endsAt).toBe(
			'2026-09-25T10:00:42.000Z'
		);
	});

	it('adds fifteen seconds', () => {
		expect(timerAfterPress('?/timerAdd', PAUSED, 90, NOW)?.pausedRemainingSeconds).toBe(57);
	});

	it('resets to the full length, paused', () => {
		expect(timerAfterPress('?/timerReset', RUNNING, 90, NOW)).toEqual({
			totalSeconds: 60,
			endsAt: null,
			pausedRemainingSeconds: 60
		});
	});

	it('predicts nothing for a press that would change nothing', () => {
		expect(timerAfterPress('?/timerPause', PAUSED, 90, NOW)).toBeNull();
		expect(timerAfterPress('?/timerReset', NO_TIMER, 90, NOW)).toBeNull();
	});

	it('predicts nothing for a button that is not a timer button', () => {
		expect(timerAfterPress('?/nextSpeaker', RUNNING, 90, NOW)).toBeNull();
	});
});
