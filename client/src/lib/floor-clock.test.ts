import { describe, expect, it } from 'vitest';
import { CLEARED_TIMER, readyTimer, startedTimer } from '$lib/committee-room';
import { clockButton, clockFace, progressPercent, progressTone } from './floor-clock';

const NOW = new Date('2026-10-01T10:00:00.000Z');

/** A ninety-second speech that started thirty-eight seconds before `NOW`. */
const RUNNING = startedTimer(90, new Date('2026-10-01T09:59:22.000Z'));

describe('clockFace', () => {
	it('shows the time left and the time spoken of a running clock', () => {
		expect(clockFace(RUNNING, NOW, 90)).toEqual({
			secondsLeft: 52,
			clockState: 'running',
			spokenSeconds: 38,
			totalSeconds: 90
		});
	});

	it('counts past zero once the speaker has gone over', () => {
		const over = startedTimer(90, new Date('2026-10-01T09:58:23.000Z'));

		expect(clockFace(over, NOW, 90)).toMatchObject({ secondsLeft: -7, spokenSeconds: 97 });
	});

	it('shows a speaker just called in full, with nothing spoken', () => {
		expect(clockFace(readyTimer(90), NOW, 60)).toEqual({
			secondsLeft: 90,
			clockState: 'ready',
			spokenSeconds: 0,
			totalSeconds: 90
		});
	});

	it("shows the list's speaking time when the speaker has no timer at all", () => {
		expect(clockFace(CLEARED_TIMER, NOW, 60)).toEqual({
			secondsLeft: 60,
			clockState: 'ready',
			spokenSeconds: 0,
			totalSeconds: 60
		});
	});

	it('spends nothing when "+15 s" left more on the clock than its length', () => {
		const longer = { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 105 };

		expect(clockFace(longer, NOW, 90).spokenSeconds).toBe(0);
	});
});

describe('progressTone', () => {
	it('is light blue while running and grey while waiting', () => {
		expect(progressTone(38, 90, 'running')).toBe('running');
		expect(progressTone(38, 90, 'paused')).toBe('paused');
		expect(progressTone(0, 90, 'ready')).toBe('paused');
	});

	it('warns in the last ten seconds and turns to danger at zero and over', () => {
		expect(progressTone(81, 90, 'running')).toBe('warning');
		expect(progressTone(80, 90, 'running')).toBe('running');
		expect(progressTone(90, 90, 'running')).toBe('danger');
		expect(progressTone(97, 90, 'paused')).toBe('danger');
	});
});

describe('progressPercent', () => {
	it('fills the bar with the share of the speaking time spoken', () => {
		expect(progressPercent(45, 90)).toBe(50);
		expect(progressPercent(0, 90)).toBe(0);
	});

	it('stops at a full bar once over time', () => {
		expect(progressPercent(97, 90)).toBe(100);
	});

	it('draws a clock with no length as full', () => {
		expect(progressPercent(0, 0)).toBe(100);
	});
});

describe('clockButton', () => {
	it('pauses a running clock', () => {
		expect(clockButton(RUNNING)).toEqual({ label: 'Pause', formAction: '?/timerPause' });
	});

	it('resumes a clock that has run and stopped', () => {
		const paused = { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 52 };

		expect(clockButton(paused)).toEqual({ label: 'Resume', formAction: '?/timerResume' });
	});

	it('starts a ready clock by resuming the seconds it holds', () => {
		expect(clockButton(readyTimer(90))).toEqual({ label: 'Start', formAction: '?/timerResume' });
	});

	it('starts a new timer for a speaker who has none', () => {
		expect(clockButton(CLEARED_TIMER)).toEqual({ label: 'Start', formAction: '?/timerStart' });
	});
});
