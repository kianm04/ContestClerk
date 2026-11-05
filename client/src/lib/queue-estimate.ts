/**
 * How long a speakers list will take, and how long a delegate has to wait for
 * their turn: the queue column's "3 · ~4 min" (`specs/05-pages/chair/gsl.md`,
 * "Data") and the live view's "You are 2nd · about 3 min"
 * (`05-pages/delegate/committee-live.md`, "The details").
 *
 * Both count only the seats "Next" would call: waiting, and not marked absent
 * at the latest roll call (`callableSpeakers` in `$lib/committee-room.ts`).
 * Both are in whole minutes and never under one, since "about 0 min" tells
 * nobody anything.
 */

import {
	callableSpeakers,
	ordinal,
	type AttendanceStatus,
	type SpeakerEntryWithSeat
} from '$lib/committee-room';

/** What the reader's wait is worked out from. */
export type ReaderWaitFacts = {
	/** Every entry of the live list, whatever its status. */
	entries: SpeakerEntryWithSeat[];
	/** The latest roll call of the session, keyed by seat id; empty before the first. */
	attendance: Record<string, AttendanceStatus>;
	/** The reader's own seat. */
	seatId: string;
	/** The list's speaking time, which each seat ahead of the reader is given. */
	speakingTimeSeconds: number;
	/**
	 * The seconds left on the speech in progress, or null when nobody has the
	 * floor. A speaker just called whose clock has not started has their full
	 * time left; a speech over time has none (`remainingSeconds` answers both).
	 */
	speechSecondsLeft: number | null;
};

/** Where the reader waits and about how long until they speak. */
export type ReaderWait = {
	/** 1 when they speak next. */
	place: number;
	minutes: number;
};

const SECONDS_PER_MINUTE = 60;

/**
 * The queue column's header: "3 · ~4 min", how many seats "Next" would call
 * and that many speeches at the list's speaking time, rounded to whole
 * minutes and never under one. Null when nobody waits, and the header then
 * shows nothing.
 */
export function listEstimate(
	entries: SpeakerEntryWithSeat[],
	attendance: Record<string, AttendanceStatus>,
	speakingTimeSeconds: number
): string | null {
	const waitingCount = callableSpeakers(entries, attendance).length;

	if (waitingCount === 0) return null;

	const totalSeconds = waitingCount * speakingTimeSeconds;
	const minutes = Math.max(1, Math.round(totalSeconds / SECONDS_PER_MINUTE));

	return `${waitingCount} · ~${minutes} min`;
}

/**
 * The reader's place among the seats "Next" would call, and the minutes until
 * their turn: the time left on the speech in progress plus the speaking time
 * of every seat ahead, rounded up and never under one. Null while the reader's
 * seat is not waiting, or is waiting but marked absent, which "Next" skips.
 */
export function readerWait(facts: ReaderWaitFacts): ReaderWait | null {
	const callable = callableSpeakers(facts.entries, facts.attendance);
	const index = callable.findIndex((entry) => entry.seat?.id === facts.seatId);

	if (index === -1) return null;

	// A clock over time reads below zero on some screens; it adds no wait.
	const speechSeconds = Math.max(0, facts.speechSecondsLeft ?? 0);
	const secondsAhead = index * facts.speakingTimeSeconds;
	const minutes = Math.max(1, Math.ceil((speechSeconds + secondsAhead) / SECONDS_PER_MINUTE));

	return { place: index + 1, minutes };
}

/** The live view's line for a waiting reader, "You are 2nd · about 3 min", or null. */
export function readerWaitText(facts: ReaderWaitFacts): string | null {
	const wait = readerWait(facts);

	if (wait === null) return null;

	return `You are ${ordinal(wait.place)} · about ${wait.minutes} min`;
}
