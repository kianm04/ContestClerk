/**
 * The speaker's clock as the floor of the GSL, Mod and Single speaker views
 * draws it (`specs/05-pages/chair/gsl.md`, "Floor"): the digits, the bar of
 * time spoken under them, and the one clock button that reads "Start",
 * "Pause" or "Resume".
 *
 * The timer's own arithmetic is in `$lib/committee-room.ts`; this file only
 * turns a stored timer and a moment into what the floor shows, so the
 * components hold no sums of their own.
 */

import {
	clockState,
	secondsLeftOrOver,
	timerTone,
	type ClockState,
	type TimerSetting
} from '$lib/committee-room';

/** What the floor's clock and bar show at one moment. */
export type ClockFace = {
	/** The seconds left, below zero once the speaker has gone over: -7 reads "+0:07". */
	secondsLeft: number;
	clockState: ClockState;
	/** The seconds spoken so far, more than `totalSeconds` once over time. */
	spokenSeconds: number;
	/** The length the clock is shown against: "of 1:30". */
	totalSeconds: number;
};

/**
 * The clock at the moment `now`. A speaker with no timer at all shows the
 * list's speaking time in full, ready to start.
 */
export function clockFace(timer: TimerSetting, now: Date, speakingTimeSeconds: number): ClockFace {
	const totalSeconds = timer.totalSeconds ?? speakingTimeSeconds;
	const secondsLeft = secondsLeftOrOver(timer, now) ?? totalSeconds;

	return {
		secondsLeft,
		clockState: clockState(timer),
		// "+15 s" can leave more on the clock than its length; nothing is spoken then.
		spokenSeconds: Math.max(0, totalSeconds - secondsLeft),
		totalSeconds
	};
}

/** The colour of the bar: light blue running, grey paused, then warning and danger. */
export type ProgressTone = 'running' | 'paused' | 'warning' | 'danger';

/**
 * The bar's colour: warning in the last ten seconds and danger once the time
 * is up, whatever the clock is doing; otherwise light blue while it runs and
 * grey while it waits.
 */
export function progressTone(
	spokenSeconds: number,
	totalSeconds: number,
	state: ClockState
): ProgressTone {
	const tone = timerTone(totalSeconds - spokenSeconds);

	if (tone !== 'normal') return tone;

	return state === 'running' ? 'running' : 'paused';
}

/** How much of the bar is filled, from 0 to 100: the time spoken against the speaking time. */
export function progressPercent(spokenSeconds: number, totalSeconds: number): number {
	if (totalSeconds <= 0) return 100;

	const percent = (spokenSeconds / totalSeconds) * 100;

	return Math.min(100, Math.max(0, percent));
}

/** The clock button's words and the action it posts to. */
export type ClockButton = {
	label: 'Start' | 'Pause' | 'Resume';
	formAction: '?/timerStart' | '?/timerPause' | '?/timerResume';
};

/**
 * The clock button: "Pause" while the clock runs, "Resume" once it has run
 * and stopped, "Start" before it has run. A ready clock already holds its
 * seconds, so "Start" resumes it; only a speaker with no timer at all needs
 * `timerStart`, which sends the list's speaking time.
 */
export function clockButton(timer: TimerSetting): ClockButton {
	const state = clockState(timer);

	if (state === 'running') return { label: 'Pause', formAction: '?/timerPause' };
	if (state === 'paused') return { label: 'Resume', formAction: '?/timerResume' };

	const hasNoTimer = timer.pausedRemainingSeconds === null;

	return { label: 'Start', formAction: hasNoTimer ? '?/timerStart' : '?/timerResume' };
}
