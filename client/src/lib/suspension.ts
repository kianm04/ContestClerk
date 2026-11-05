/**
 * A suspended room's words and its return time (`specs/05-pages/chair/committee-room.md`,
 * "Suspended"; `display.md`; `delegate/committee-live.md`): "12 min so far",
 * "Back at 14:00 · in 41 min", the return times the chair is offered, reading
 * a typed "13:30" in the conference's timezone, and what "Resume session"
 * brings back, "When the session resumes: GSL, China with 0:52 left".
 *
 * The suspension is stored on `committee_state` (D6): `suspended_at`, the
 * moment of the press, and `suspended_until`, when the room is due back, or
 * null while the chair has not said. Every screen counts them against the
 * server's clock (`02-architecture/realtime.md`), so `now` is always passed in.
 */

import { formatClock } from '$lib/committee-room';
import { dayInTimezone, formatTimeOfDay, instantFromLocalDateTime } from '$lib/dates';
import type { RoomMode } from '$lib/live-mode';

/** The suspension's two moments, as `committee_state` stores them. */
export type Suspension = {
	/** When the room was suspended. */
	suspendedAt: string;
	/** When the room is due back, or null while the chair has set no return time. */
	suspendedUntil: string | null;
};

/** What the return time form sent, read: the moment to store, or why it was refused. */
export type ReturnTimeReading = {
	/** The moment to write into `suspended_until`, or null when refused. */
	suspendedUntil: string | null;
	/** The refusal's sentence, or null when the time was read. */
	refusal: string | null;
};

/** What the suspended room will go back to, which "When the session resumes" names. */
export type ResumeFacts = {
	/** The mode "Resume session" puts back (`mode_before_suspension`); null reads as formal debate. */
	mode: RoomMode | null;
	/** Who has the floor: a seat's name or a typed name; null when nobody has. */
	speakerName: string | null;
	/** The seconds left on the room's timer: the speaker's clock, or an Unmod's one clock. */
	timerSecondsLeft: number | null;
	/** How many seats wait on the General Speakers' List. */
	waitingCount: number;
	/** The seconds left on a moderated caucus's own clock, or null. */
	caucusSecondsLeft: number | null;
	/** The subject of the vote the room is on, or null when none is open or on show. */
	voteSubject: string | null;
};

/** The return times the suspended screen offers as buttons, in minutes. */
export const RETURN_TIME_MINUTES = [10, 15, 30, 60];

/** The sentences the return time is refused with (`committee-room.md`, "`setReturnTime`"). */
export const RETURN_TIME_REFUSALS = {
	unreadable: 'Choose a return time such as 14:00.',
	notLater: 'Choose a time later than now.'
} as const;

/** The shortest and longest return time a `minutes` field may ask for: up to four hours. */
const MIN_RETURN_MINUTES = 1;
const MAX_RETURN_MINUTES = 240;

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MINUTES_PER_HOUR = 60;

/** A time of day as a chair types it, "13:30" or "9:30", with the hour and the minute in groups. */
const TIME_OF_DAY_SHAPE = /^(\d{1,2}):(\d{2})$/;

/** A length in whole minutes as the room writes it: "41 min", "1 h 5 min", "2 h". */
export function formatMinutes(minutes: number): string {
	const hours = Math.floor(minutes / MINUTES_PER_HOUR);
	const minutesPart = minutes % MINUTES_PER_HOUR;

	if (hours === 0) return `${minutesPart} min`;
	if (minutesPart === 0) return `${hours} h`;

	return `${hours} h ${minutesPart} min`;
}

/** "12 min so far": how long the room has been suspended, in whole minutes, counting up. */
export function suspendedForText(suspendedAt: string, now: Date): string {
	const elapsed = now.getTime() - new Date(suspendedAt).getTime();
	const minutes = Math.max(0, Math.floor(elapsed / MILLISECONDS_PER_MINUTE));

	return `${formatMinutes(minutes)} so far`;
}

/** The whole minutes until `moment`, rounded up, or 0 once it has come. */
function minutesUntil(moment: string, now: Date): number {
	const remaining = new Date(moment).getTime() - now.getTime();

	return Math.max(0, Math.ceil(remaining / MILLISECONDS_PER_MINUTE));
}

/**
 * The chair's line while a return time is set: "Back at 14:00 · in 41 min",
 * counting down; "Back at 14:00 · now" in the minute the time comes; then
 * "Back at 14:00 · 3 min ago". The time is the conference's own.
 */
export function backAtText(suspendedUntil: string, now: Date, timezone: string): string {
	const backAt = `Back at ${formatTimeOfDay(suspendedUntil, timezone)}`;
	const minutesLeft = minutesUntil(suspendedUntil, now);

	if (minutesLeft > 0) return `${backAt} · in ${formatMinutes(minutesLeft)}`;

	const overdue = now.getTime() - new Date(suspendedUntil).getTime();
	const minutesAgo = Math.floor(overdue / MILLISECONDS_PER_MINUTE);

	if (minutesAgo === 0) return `${backAt} · now`;

	return `${backAt} · ${formatMinutes(minutesAgo)} ago`;
}

/**
 * The projector's and the phones' line while a return time is set: "Back at
 * 14:00 · in 41 min", counting down in whole minutes, and "Back at 14:00 ·
 * any moment now" once the time has come, since the room is waiting for the
 * chair and nobody watching needs to know by how long.
 */
export function backAtCountdownText(suspendedUntil: string, now: Date, timezone: string): string {
	const backAt = `Back at ${formatTimeOfDay(suspendedUntil, timezone)}`;
	const minutesLeft = minutesUntil(suspendedUntil, now);

	if (minutesLeft === 0) return `${backAt} · any moment now`;

	return `${backAt} · in ${formatMinutes(minutesLeft)}`;
}

/** The chair's line under "Suspended": the return time once set (`backAtText`), else "12 min so far". */
export function suspensionLine(suspension: Suspension, now: Date, timezone: string): string {
	if (suspension.suspendedUntil === null) return suspendedForText(suspension.suspendedAt, now);

	return backAtText(suspension.suspendedUntil, now, timezone);
}

/**
 * The projector's and the phones' line under "Suspended": the countdown once
 * a return time is set (`backAtCountdownText`), else "12 min so far".
 */
export function watcherSuspensionLine(suspension: Suspension, now: Date, timezone: string): string {
	if (suspension.suspendedUntil === null) return suspendedForText(suspension.suspendedAt, now);

	return backAtCountdownText(suspension.suspendedUntil, now, timezone);
}

/**
 * The return time `minutes` after the press, rounded up to the next whole
 * minute, so "Back at" never shows a time the room will already have passed.
 */
export function returnTimeAfter(minutes: number, now: Date): string {
	const moment = now.getTime() + minutes * MILLISECONDS_PER_MINUTE;
	const wholeMinute = Math.ceil(moment / MILLISECONDS_PER_MINUTE) * MILLISECONDS_PER_MINUTE;

	return new Date(wholeMinute).toISOString();
}

/** The `minutes` a return time button sent, or null when it is not a whole number from 1 to 240. */
export function readReturnMinutes(value: FormDataEntryValue | null): number | null {
	if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;

	const minutes = Number(value.trim());

	if (minutes < MIN_RETURN_MINUTES || minutes > MAX_RETURN_MINUTES) return null;

	return minutes;
}

/**
 * A typed time of day ("13:30", "9:30") as the moment it names today in the
 * conference's timezone, or null when it is not a time of day. Whether that
 * moment is still to come is `readReturnTime`'s to check.
 */
export function readBackAt(
	value: FormDataEntryValue | null,
	now: Date,
	timezone: string
): string | null {
	if (typeof value !== 'string') return null;

	const parts = TIME_OF_DAY_SHAPE.exec(value.trim());

	if (parts === null) return null;

	const hours = Number(parts[1]);
	const minutes = Number(parts[2]);

	if (hours > 23 || minutes > 59) return null;

	const today = dayInTimezone(now, timezone);
	const time = `${String(hours).padStart(2, '0')}:${parts[2]}`;

	return instantFromLocalDateTime(`${today}T${time}`, timezone);
}

/**
 * The return time the suspended screen's form sent. A minute button's
 * `minutes` wins over the time field, which the same form also sends: the
 * press plus those minutes, rounded up to the minute. Otherwise `backAt`, a
 * time today in the conference's timezone, which must be later than now.
 */
export function readReturnTime(
	minutes: FormDataEntryValue | null,
	backAt: FormDataEntryValue | null,
	now: Date,
	timezone: string
): ReturnTimeReading {
	const hasMinutes = typeof minutes === 'string' && minutes.trim() !== '';

	if (hasMinutes) {
		const returnMinutes = readReturnMinutes(minutes);

		if (returnMinutes === null) {
			return { suspendedUntil: null, refusal: RETURN_TIME_REFUSALS.unreadable };
		}

		return { suspendedUntil: returnTimeAfter(returnMinutes, now), refusal: null };
	}

	const backAtMoment = readBackAt(backAt, now, timezone);

	if (backAtMoment === null) {
		return { suspendedUntil: null, refusal: RETURN_TIME_REFUSALS.unreadable };
	}

	if (new Date(backAtMoment).getTime() <= now.getTime()) {
		return { suspendedUntil: null, refusal: RETURN_TIME_REFUSALS.notLater };
	}

	return { suspendedUntil: backAtMoment, refusal: null };
}

/** The GSL's part of the sentence: who has the floor and their time, or how many wait. */
function gslResumeWords(facts: ResumeFacts): string {
	if (facts.speakerName !== null && facts.timerSecondsLeft !== null) {
		return `GSL, ${facts.speakerName} with ${formatClock(facts.timerSecondsLeft)} left`;
	}

	if (facts.speakerName !== null) return `GSL, ${facts.speakerName}`;
	if (facts.waitingCount === 0) return 'GSL, nobody waiting to speak';

	return `GSL, ${facts.waitingCount} waiting to speak`;
}

/** What "Resume session" brings back, in the words the sentence uses. */
function resumeWords(facts: ResumeFacts): string {
	switch (facts.mode) {
		case 'moderated_caucus':
			if (facts.caucusSecondsLeft === null) return 'moderated caucus';
			return `moderated caucus, ${formatClock(facts.caucusSecondsLeft)} of the caucus left`;
		case 'unmoderated_caucus':
			if (facts.timerSecondsLeft === null) return 'unmoderated caucus';
			return `unmoderated caucus, ${formatClock(facts.timerSecondsLeft)} left`;
		case 'single_speaker':
			if (facts.speakerName === null) return 'single speaker';
			return `single speaker, ${facts.speakerName}`;
		case 'voting':
			if (facts.voteSubject === null) return 'voting, no vote open yet';
			return `the vote on ${facts.voteSubject}`;
		default:
			// Formal debate, and a suspension with no mode on record, which resumes into it.
			return gslResumeWords(facts);
	}
}

/**
 * The suspended screen's "When the session resumes: …", naming what "Resume
 * session" brings back: "GSL, China with 0:52 left", "GSL, 3 waiting to
 * speak", "moderated caucus, 6:12 of the caucus left", "unmoderated caucus,
 * 8:42 left", "single speaker, Kenya" or "the vote on Draft Resolution 1.1".
 */
export function resumeSentence(facts: ResumeFacts): string {
	return `When the session resumes: ${resumeWords(facts)}`;
}
