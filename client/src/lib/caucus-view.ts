/**
 * The words the Mod and Unmod views draw about the caucus they run
 * (`specs/05-pages/chair/mod.md` and `unmod.md`, "Layout"): its title and
 * the line under it, the caucus clock line above the speaker, "back at 14:32"
 * under the Unmod clock with its clock button, and the caucus's part of the
 * live strip.
 *
 * Plain functions with no Svelte in them, so the components hold no sums and
 * the tests read them without a browser.
 */

import type { ChairMotion } from '$lib/chair-room';
import {
	caucusClock,
	caucusSecondsLeft,
	isCaucusTimeUp,
	type CaucusClock,
	type CaucusClockSetting
} from '$lib/caucus-clock';
import {
	clockState,
	dueBackAt,
	formatClock,
	formatDuration,
	type ClockState,
	type TimerSetting
} from '$lib/committee-room';
import { formatTimeOfDay } from '$lib/dates';
import { clockButton, type ClockButton } from '$lib/floor-clock';
import type { GslList } from '$lib/gsl-floor';

/** The caucus a Mod or Unmod view runs, as its title names it. */
export type CaucusMotion = {
	id: string;
	kind: 'moderated_caucus' | 'unmoderated_caucus';
	topic: string | null;
	totalTimeSeconds: number | null;
	speakingTimeSeconds: number | null;
	/** The seat that raised it, or null when the chair did. */
	raisedByName: string | null;
	/** Started from its own view rather than passed in Motions (D3). */
	startedWithoutVote: boolean;
};

/**
 * What the Mod view draws while a moderated caucus runs, as
 * `readModView` in `$lib/server/caucus-view.ts` reads it.
 */
export type ModViewData = {
	/** The caucus's own list, or null in the moment before the database has made it. */
	list: GslList | null;
	motion: CaucusMotion | null;
};

/** What the Unmod view draws, as `readUnmodView` reads it. */
export type UnmodViewData = {
	/** The General Speakers' List, shown as "After the caucus". */
	gsl: GslList | null;
	/** The caucus, while one runs. */
	motion: CaucusMotion | null;
};

/**
 * What the caucus clock line draws at one moment. Its bar is the floor's
 * `ProgressLine`, drawn thin, so it is coloured the way the speaker's bar is.
 */
export type CaucusLine = {
	/** "6:12": the time left, never below zero. */
	timeLeft: string;
	/** "left of 10:00". */
	ofTotal: string;
	isTimeUp: boolean;
	/** The caucus time used so far, which fills the bar. */
	usedSeconds: number;
	totalSeconds: number;
	/** Running while the speaker's clock runs, otherwise paused (or ready before the first speech). */
	clockState: ClockState;
};

/** The name each kind of caucus is called at the start of its title. */
const CAUCUS_NAMES: Record<CaucusMotion['kind'], string> = {
	moderated_caucus: 'Moderated caucus',
	unmoderated_caucus: 'Unmoderated caucus'
};

/**
 * The view's title: "Moderated caucus · Opening humanitarian corridors", or
 * the kind alone when the caucus has no topic.
 */
export function caucusTitle(kind: CaucusMotion['kind'], topic: string | null): string {
	const name = CAUCUS_NAMES[kind];

	if (topic === null || topic === '') return name;

	return `${name} · ${topic}`;
}

/**
 * The quieter line under the title: "raised by Brazil", or "raised by the
 * chair", with "· started without a vote" for a caucus started from its own
 * view. That mark is enough; there is no badge.
 */
export function raisedByLine(
	motion: Pick<CaucusMotion, 'raisedByName' | 'startedWithoutVote'>
): string {
	const raisedBy = `raised by ${motion.raisedByName ?? 'the chair'}`;

	return motion.startedWithoutVote ? `${raisedBy} · started without a vote` : raisedBy;
}

/**
 * The caucus the view names, while a press may still be on its way. The
 * server's reading wins once it is about the room's own motion; a motion only
 * this browser knows yet is the caucus the chair has just started from the
 * view, so it was started without a vote. Null while the room runs none.
 */
export function shownCaucusMotion(
	fromServer: CaucusMotion | null,
	roomMotion: ChairMotion | null
): CaucusMotion | null {
	if (roomMotion === null) return null;
	if (fromServer !== null && fromServer.id === roomMotion.id) return fromServer;
	if (roomMotion.kind !== 'moderated_caucus' && roomMotion.kind !== 'unmoderated_caucus') {
		return null;
	}

	return {
		id: roomMotion.id,
		kind: roomMotion.kind,
		topic: roomMotion.topic,
		totalTimeSeconds: roomMotion.totalTimeSeconds,
		speakingTimeSeconds: roomMotion.speakingTimeSeconds,
		raisedByName: roomMotion.proposedBySeatName,
		startedWithoutVote: true
	};
}

/**
 * The caucus clock line at the moment `now`: "Caucus 6:12 left of 10:00" with
 * its bar, or "Caucus time is up" with the bar full.
 */
export function caucusLine(clock: CaucusClock, now: Date): CaucusLine {
	const secondsLeft = caucusSecondsLeft(clock, now);

	return {
		timeLeft: formatClock(secondsLeft),
		ofTotal: `left of ${formatDuration(clock.totalSeconds)}`,
		isTimeUp: isCaucusTimeUp(clock, now),
		usedSeconds: Math.max(0, clock.totalSeconds - secondsLeft),
		totalSeconds: clock.totalSeconds,
		clockState: clockState(clock)
	};
}

/**
 * The caucus's part of the live strip's line, after the speaker:
 * "caucus 6:12 left", or "caucus time is up". Null outside a moderated
 * caucus.
 */
export function caucusStripText(setting: CaucusClockSetting | undefined, now: Date): string | null {
	const clock = setting === undefined ? null : caucusClock(setting);

	if (clock === null) return null;
	if (isCaucusTimeUp(clock, now)) return 'caucus time is up';

	return `caucus ${formatClock(caucusSecondsLeft(clock, now))} left`;
}

/**
 * The line under the Unmod clock: "back at 14:32" in the conference's time
 * zone, or "Paused · back at 14:41" while the clock is paused, the time moving
 * on with the wall clock (`dueBackAt`). Null with no clock set.
 */
export function backAtText(timer: TimerSetting, now: Date, timeZone: string): string | null {
	const due = dueBackAt(timer, now);

	if (due === null) return null;

	const backAt = `back at ${formatTimeOfDay(due.toISOString(), timeZone)}`;

	return clockState(timer) === 'running' ? backAt : `Paused · ${backAt}`;
}

/**
 * The Unmod clock's one button. The caucus's clock starts running with the
 * caucus, so the button reads only "Pause" or "Resume" (`unmod.md`, "The
 * controls"). A clock paused within its first second still holds its full
 * length, which the GSL's button (`clockButton`) reads as "Start"; here it is
 * paused like any other, as the "Paused · back at" line under it says.
 */
export function unmodClockButton(timer: TimerSetting): ClockButton {
	const button = clockButton(timer);
	const isPausedAtFullLength = button.label === 'Start' && timer.pausedRemainingSeconds !== null;

	if (!isPausedAtFullLength) return button;

	return { label: 'Resume', formAction: '?/timerResume' };
}
