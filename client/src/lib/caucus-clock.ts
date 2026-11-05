/**
 * A moderated caucus's own clock: the time left of its total, drawn as a line
 * above the speaker (`specs/05-pages/chair/mod.md`, "What changes which clock"
 * and "`caucus-clock.ts`"; `02-architecture/data-model.md`, "The caucus
 * clock").
 *
 * It is stored the way the speaker's timer is, in three columns of
 * `committee_state` (D4): `caucus_total_seconds`, `caucus_ends_at` while it
 * runs, and `caucus_paused_remaining_seconds` while it is paused. It runs
 * exactly while the speaker's clock runs, so the time between speakers is not
 * lost. It stops at zero and never counts up: "Caucus time is up" ends
 * nothing by itself, and the speaker may finish.
 *
 * The arithmetic is the speaker's timer's (`pausedTimer`, `resumedTimer` and
 * `timerWithAddedSeconds` in `$lib/committee-room.ts`), since the two clocks
 * are stored alike.
 */

import {
	pausedTimer,
	remainingSeconds,
	resumedTimer,
	timerWithAddedSeconds
} from '$lib/committee-room';

/**
 * The caucus clock's three columns as one value. `totalSeconds` is null
 * outside a moderated caucus, and while it is set exactly one of `endsAt`
 * (running) and `pausedRemainingSeconds` (paused) is.
 */
export type CaucusClockSetting = {
	totalSeconds: number | null;
	endsAt: string | null;
	pausedRemainingSeconds: number | null;
};

/** A caucus clock that is set, as the caucus line draws it. */
export type CaucusClock = {
	totalSeconds: number;
	endsAt: string | null;
	pausedRemainingSeconds: number | null;
};

/** The same three columns under the names `committee_state` gives them. */
export type CaucusClockColumns = {
	caucus_total_seconds: number | null;
	caucus_ends_at: string | null;
	caucus_paused_remaining_seconds: number | null;
};

/**
 * A press that changes the speaker's clock in a moderated caucus, and so may
 * change the caucus clock in the same update (`mod.md`, "What changes which
 * clock"). "Next" also stands for "Call", and "suspend" for the mode bar's
 * Suspend, which pauses both clocks and keeps them.
 */
export type SpeakerClockPress =
	'start' | 'resume' | 'pause' | 'addTime' | 'reset' | 'endSpeech' | 'next' | 'suspend';

/** No caucus clock, which ending the caucus, the session or any other mode writes. */
export const CLEARED_CAUCUS_CLOCK: CaucusClockSetting = {
	totalSeconds: null,
	endsAt: null,
	pausedRemainingSeconds: null
};

/** The presses that start the speaker's clock, and the caucus clock with it. */
const STARTING_PRESSES: SpeakerClockPress[] = ['start', 'resume'];

/** The presses that leave the speaker's clock stopped, which pauses the caucus clock. */
const STOPPING_PRESSES: SpeakerClockPress[] = ['pause', 'reset', 'endSpeech', 'next', 'suspend'];

/** The caucus clock as the columns of a `committee_state` update. */
export function caucusClockColumns(setting: CaucusClockSetting): CaucusClockColumns {
	return {
		caucus_total_seconds: setting.totalSeconds,
		caucus_ends_at: setting.endsAt,
		caucus_paused_remaining_seconds: setting.pausedRemainingSeconds
	};
}

/** The caucus clock for the caucus line, or null when none is set (no moderated caucus runs). */
export function caucusClock(setting: CaucusClockSetting): CaucusClock | null {
	if (setting.totalSeconds === null) return null;

	return {
		totalSeconds: setting.totalSeconds,
		endsAt: setting.endsAt,
		pausedRemainingSeconds: setting.pausedRemainingSeconds
	};
}

/**
 * The caucus's seconds left at the moment `now`, never below zero. A clock
 * neither running nor paused has not started, so all of its total is left.
 */
export function caucusSecondsLeft(clock: CaucusClock, now: Date): number {
	return remainingSeconds(clock, now) ?? clock.totalSeconds;
}

/** Whether the caucus's time has run out, which makes "End caucus" the primary. */
export function isCaucusTimeUp(clock: CaucusClock, now: Date): boolean {
	return caucusSecondsLeft(clock, now) === 0;
}

/**
 * A new caucus clock of `totalSeconds`, paused at its whole total: what
 * passing a moderated caucus, or starting one directly, writes, since nobody
 * has the floor yet.
 */
export function caucusClockForTotal(totalSeconds: number): CaucusClockSetting {
	return { totalSeconds, endsAt: null, pausedRemainingSeconds: totalSeconds };
}

/**
 * The caucus clock after a press on the speaker's clock. Start and Resume
 * start it; Pause, Reset, End speech, Next and Suspend pause it where it is;
 * +15 s leaves it alone. Once its time is up it stays at zero, paused, even
 * when the speaker's clock starts again. With no caucus clock set, nothing
 * changes.
 */
export function caucusClockAfterPress(
	setting: CaucusClockSetting,
	press: SpeakerClockPress,
	now: Date
): CaucusClockSetting {
	if (setting.totalSeconds === null) return setting;

	if (STARTING_PRESSES.includes(press)) {
		const isTimeUp = setting.pausedRemainingSeconds !== null && setting.pausedRemainingSeconds <= 0;

		if (isTimeUp) return setting;

		// `resumedTimer` answers null for a clock that is already running.
		return resumedTimer(setting, now) ?? setting;
	}

	if (STOPPING_PRESSES.includes(press)) {
		// `pausedTimer` answers null for a clock that is already paused.
		return pausedTimer(setting, now) ?? setting;
	}

	return setting;
}

/**
 * The caucus clock with `seconds` more, running or paused: "Extend +5:00", or
 * a passed extension. Its total grows by as much, so the line reads "left of
 * 15:00" after extending a 10:00 caucus. A caucus whose time was up gets the
 * seconds from now. With no caucus clock set, nothing changes.
 */
export function extendedCaucusClock(
	setting: CaucusClockSetting,
	seconds: number,
	now: Date
): CaucusClockSetting {
	if (setting.totalSeconds === null) return setting;

	const longer = timerWithAddedSeconds(setting, seconds, now) ?? setting;

	return { ...longer, totalSeconds: setting.totalSeconds + seconds };
}
