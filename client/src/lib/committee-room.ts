/**
 * The rules of the committee room, without Svelte and without the database:
 * quorum and majorities, the timer's arithmetic, the order motions are put to
 * the vote and the next speaker.
 *
 * `specs/06-features/chairing.md` says what each rule is. The chair pages and
 * the delegate live view all ask this file, so every screen in the room counts
 * the same way.
 */

import type { Database } from '$lib/database.types';

type RoomEnums = Database['public']['Enums'];

/** What the room is doing now, such as `moderated_caucus`. */
export type CommitteeMode = RoomEnums['committee_mode'];

/** One seat's answer at roll call. */
export type AttendanceStatus = RoomEnums['attendance_status'];

/** What a motion asks for, such as `suspend_meeting`. */
export type MotionKind = RoomEnums['motion_kind'];

/** Where one entry of a speakers list has got to. */
export type SpeakerStatus = RoomEnums['speaker_status'];

/** Whether a vote needs more than half or two thirds. */
export type MajorityType = RoomEnums['majority_type'];

/** One seat as the room components draw it. */
export type RoomSeat = {
	id: string;
	/** The country, character or role, such as "France". */
	name: string;
	/** Two letters for the flag, or null for a seat that is not a country. */
	countryCode: string | null;
	/** The delegate sitting in the seat, when there is one. */
	delegateName?: string | null;
};

/**
 * The room's timer, from the three `timer_*` columns of `committee_state`.
 * Running when `endsAt` is set, paused when `pausedRemainingSeconds` is; the
 * database never lets both be set at once.
 */
export type RoomTimer = {
	endsAt: string | null;
	pausedRemainingSeconds: number | null;
	totalSeconds: number;
};

/** A motion, with only what ranking it and naming it in the mode banner need. */
export type RoomMotion = {
	id: string;
	kind: MotionKind;
	topic: string | null;
	totalTimeSeconds: number | null;
	speakingTimeSeconds: number | null;
	createdAt: string;
};

/** One entry of a speakers list. */
export type SpeakerEntry = {
	id: string;
	position: number;
	status: SpeakerStatus;
};

/** The counted hands of one vote. */
export type VoteCounts = {
	for: number;
	against: number;
	abstain: number;
};

/** How many seats a quorum needs, and whether the room has them. */
export type Quorum = {
	needed: number;
	hasQuorum: boolean;
};

/** The colour a timer is drawn in. */
export type TimerTone = 'normal' | 'warning' | 'danger';

/** Below this many seconds the timer turns amber. */
const TIMER_WARNING_SECONDS = 10;

/**
 * The order motions are put to the vote, most disruptive first. A lower number
 * goes first. Written out in `specs/05-pages/chair/motions.md`.
 */
const MOTION_KIND_RANK: Record<MotionKind, number> = {
	adjourn_meeting: 0,
	suspend_meeting: 1,
	unmoderated_caucus: 2,
	moderated_caucus: 3,
	extend_caucus: 4,
	close_debate: 5,
	introduce_document: 6,
	other: 7
};

/**
 * How many seats the latest roll call found in the room. `attendance` is keyed
 * by seat id; both kinds of "present" count.
 */
export function countPresent(attendance: Record<string, AttendanceStatus>): number {
	const statuses = Object.values(attendance);
	const presentStatuses = statuses.filter((status) => status !== 'absent');

	return presentStatuses.length;
}

/** Quorum is at least half of the available seats present, rounded up. */
export function quorum(presentCount: number, availableSeats: number): Quorum {
	const needed = Math.ceil(availableSeats / 2);

	return { needed, hasQuorum: presentCount >= needed };
}

/** The votes a simple majority needs: more than half of `count`. */
export function simpleMajority(count: number): number {
	return Math.floor(count / 2) + 1;
}

/** The votes a two-thirds majority needs: at least two thirds of `count`, rounded up. */
export function twoThirds(count: number): number {
	return Math.ceil((2 * count) / 3);
}

/**
 * How many votes in favour a substantive vote needs to pass. Abstentions do not
 * count: the majority is of the votes cast for and against. At least one vote
 * in favour is always needed, so a vote nobody took part in fails.
 */
export function votesNeeded(counts: VoteCounts, majority: MajorityType): number {
	const votesCast = counts.for + counts.against;
	const needed = majority === 'simple' ? simpleMajority(votesCast) : twoThirds(votesCast);

	return Math.max(1, needed);
}

/**
 * Whether a vote passed. Simple majority passes when more voted for than
 * against; two thirds when at least two thirds of those voting for or against
 * voted for. A tie fails either way.
 */
export function voteResult(counts: VoteCounts, majority: MajorityType): boolean {
	return counts.for >= votesNeeded(counts, majority);
}

/**
 * The seconds left on the room's timer at the moment `now`, or null when no
 * timer is set. A paused timer holds its seconds; a running one counts down to
 * `endsAt` and stops at zero. A part-second left counts as a whole one, so the
 * clock reaches 0:00 exactly when time is up.
 */
export function remainingSeconds(
	timer: Pick<RoomTimer, 'endsAt' | 'pausedRemainingSeconds'>,
	now: Date
): number | null {
	if (timer.pausedRemainingSeconds !== null) {
		return Math.max(0, timer.pausedRemainingSeconds);
	}

	if (timer.endsAt === null) return null;

	const millisecondsLeft = new Date(timer.endsAt).getTime() - now.getTime();

	return Math.max(0, Math.ceil(millisecondsLeft / 1000));
}

/**
 * The seconds on the room's timer at the moment `now`, below zero once a
 * running timer has gone over: 52 while 52 seconds are left, -7 seven seconds
 * after the time ran out. Null when no timer is set.
 *
 * `remainingSeconds` stops at zero, which is what the timer's arithmetic
 * needs. The floor's clock counts up past zero instead ("+0:07"), so a chair
 * sees how far over a speaker has gone; this is the number it draws.
 */
export function secondsLeftOrOver(
	timer: Pick<RoomTimer, 'endsAt' | 'pausedRemainingSeconds'>,
	now: Date
): number | null {
	if (timer.pausedRemainingSeconds !== null) {
		return Math.max(0, timer.pausedRemainingSeconds);
	}

	if (timer.endsAt === null) return null;

	const millisecondsLeft = new Date(timer.endsAt).getTime() - now.getTime();

	// While time is left, a part-second counts as a whole one, as in `remainingSeconds`.
	if (millisecondsLeft > 0) return Math.ceil(millisecondsLeft / 1000);

	// Once over, only whole seconds count, so the clock shows "0:00" for a
	// moment before "+0:01" rather than jumping straight past zero.
	const secondsOver = Math.floor(-millisecondsLeft / 1000);

	return secondsOver === 0 ? 0 : -secondsOver;
}

/** The timer turns amber under ten seconds and red at zero, and stays red when over. */
export function timerTone(seconds: number): TimerTone {
	if (seconds <= 0) return 'danger';
	if (seconds < TIMER_WARNING_SECONDS) return 'warning';

	return 'normal';
}

/**
 * Seconds as the clock face writes them, with no leading zero on the
 * minutes: 52 is "0:52", 90 is "1:30", 600 is "10:00". Below zero the clock
 * has gone over, and counts up with a plus: -7 is "+0:07".
 */
export function formatClock(seconds: number): string {
	if (seconds < 0) return `+${formatClock(-seconds)}`;

	const minutes = Math.floor(seconds / 60);

	return `${minutes}:${formatSecondsPart(seconds)}`;
}

/**
 * Seconds as a length of time, such as a speaking time: 60 is "1:00", 600 is
 * "10:00", 30 is "0:30". The same writing as the clock face (`formatClock`),
 * so "1:30 each" and a clock reading "1:30" always look alike.
 */
export function formatDuration(seconds: number): string {
	return formatClock(seconds);
}

/** The seconds past the minute, always two digits. */
function formatSecondsPart(seconds: number): string {
	return String(seconds % 60).padStart(2, '0');
}

/**
 * How long a speaker spoke: their speaking time less what was left on the
 * timer. Never below zero, because added seconds can leave more on the clock
 * than the list's speaking time.
 */
export function spokeSeconds(speakingTimeSeconds: number, secondsLeft: number): number {
	return Math.max(0, speakingTimeSeconds - secondsLeft);
}

/**
 * An entry of a speakers list with the seat it is for. The seat is optional
 * because an entry may name someone who holds no seat ("Secretary-General",
 * a single speaker's typed name), and such an entry is never absent.
 */
export type SpeakerEntryWithSeat = SpeakerEntry & {
	seat?: { id: string } | null;
};

/** Whether the latest roll call marked the entry's seat absent. Before any roll call nobody is. */
function isEntryAbsent(
	entry: SpeakerEntryWithSeat,
	attendance: Record<string, AttendanceStatus>
): boolean {
	const seatId = entry.seat?.id;

	if (seatId === undefined) return false;

	return attendance[seatId] === 'absent';
}

/**
 * The waiting entries "Next" would call, in the order it would call them: by
 * position, leaving out every seat the latest roll call marked absent. The
 * absent seats keep their places in the list; they are only skipped.
 */
export function callableSpeakers<Entry extends SpeakerEntryWithSeat>(
	entries: Entry[],
	attendance: Record<string, AttendanceStatus> = {}
): Entry[] {
	const waiting = entries.filter((entry) => entry.status === 'waiting');
	const present = waiting.filter((entry) => !isEntryAbsent(entry, attendance));

	// `sort` changes the array it is given; `filter` above already made a copy.
	return present.sort((first, second) => first.position - second.position);
}

/**
 * The first waiting entry of a speakers list by position, skipping seats the
 * latest roll call marked absent, or null when no present seat waits.
 * `attendance` is keyed by seat id; without it nobody counts as absent.
 */
export function nextSpeaker<Entry extends SpeakerEntryWithSeat>(
	entries: Entry[],
	attendance: Record<string, AttendanceStatus> = {}
): Entry | null {
	return callableSpeakers(entries, attendance)[0] ?? null;
}

/**
 * The motions on the floor in the order the chair puts them to the vote: by
 * kind, most disruptive first; caucuses with the longest total time first, and
 * of two moderated caucuses of the same length the one with shorter speeches;
 * then the one proposed first. Returns a new array.
 */
export function rankMotions<Motion extends RoomMotion>(motions: Motion[]): Motion[] {
	// `sort` changes the array it is given, so it sorts a copy.
	return [...motions].sort(compareMotions);
}

/** Negative when `first` goes to the vote before `second`. */
function compareMotions(first: RoomMotion, second: RoomMotion): number {
	const kindDifference = MOTION_KIND_RANK[first.kind] - MOTION_KIND_RANK[second.kind];
	if (kindDifference !== 0) return kindDifference;

	const isCaucus = first.kind === 'moderated_caucus' || first.kind === 'unmoderated_caucus';

	if (isCaucus) {
		const longerFirst = (second.totalTimeSeconds ?? 0) - (first.totalTimeSeconds ?? 0);
		if (longerFirst !== 0) return longerFirst;
	}

	if (first.kind === 'moderated_caucus') {
		const shorterSpeechesFirst =
			(first.speakingTimeSeconds ?? 0) - (second.speakingTimeSeconds ?? 0);
		if (shorterSpeechesFirst !== 0) return shorterSpeechesFirst;
	}

	return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
}

/**
 * The three `timer_*` columns of `committee_state` as one value, which is what
 * the chair's timer buttons write. Unlike `RoomTimer`, `totalSeconds` may be
 * null: that is a room with no timer set at all.
 */
export type TimerSetting = {
	totalSeconds: number | null;
	endsAt: string | null;
	pausedRemainingSeconds: number | null;
};

/** No timer at all, which is what ending a session or yielding to the chair writes. */
export const CLEARED_TIMER: TimerSetting = {
	totalSeconds: null,
	endsAt: null,
	pausedRemainingSeconds: null
};

/** The moment `seconds` after `now`, the way the database stores a moment. */
function momentAfter(now: Date, seconds: number): string {
	return new Date(now.getTime() + seconds * 1000).toISOString();
}

/** A timer of `seconds`, running from `now`. */
export function startedTimer(seconds: number, now: Date): TimerSetting {
	return { totalSeconds: seconds, endsAt: momentAfter(now, seconds), pausedRemainingSeconds: null };
}

/**
 * A timer of `seconds` that is ready but not running: paused at its full
 * length. "Next" and "Call" give a speaker this clock, and the chair starts it
 * when the speech really starts, since the walk to the podium is not speaking
 * time (`specs/05-pages/chair/gsl.md`; `call_next_speaker` in the database).
 */
export function readyTimer(seconds: number): TimerSetting {
	return { totalSeconds: seconds, endsAt: null, pausedRemainingSeconds: seconds };
}

/**
 * Where the speaker's clock is: `ready` before it has run, `running`, or
 * `paused` after it ran. The clock button reads "Start", "Pause" or "Resume"
 * from it, and the floor writes "Paused" beside a paused clock only.
 */
export type ClockState = 'ready' | 'running' | 'paused';

/**
 * The state of the speaker's clock. A clock holding exactly its full length
 * has not run yet (a speaker just called, or a clock reset), so it is ready;
 * no timer at all is ready too, waiting for "Start". A clock holding anything
 * else is paused, including one that "+15 s" took past its length after it
 * had run, which still reads "Resume".
 */
export function clockState(setting: TimerSetting): ClockState {
	if (setting.endsAt !== null) return 'running';
	if (setting.totalSeconds === null || setting.pausedRemainingSeconds === null) return 'ready';

	return setting.pausedRemainingSeconds === setting.totalSeconds ? 'ready' : 'paused';
}

/**
 * The running timer, paused: the seconds it has left are kept and the moment it
 * would have ended is cleared (`specs/02-architecture/realtime.md`). Null when
 * the timer is not running, because there is nothing to pause.
 */
export function pausedTimer(setting: TimerSetting, now: Date): TimerSetting | null {
	if (setting.endsAt === null) return null;

	const secondsLeft = remainingSeconds(setting, now) ?? 0;

	return { ...setting, endsAt: null, pausedRemainingSeconds: secondsLeft };
}

/** The paused timer, running again from `now`. Null when it is not paused. */
export function resumedTimer(setting: TimerSetting, now: Date): TimerSetting | null {
	if (setting.pausedRemainingSeconds === null) return null;

	return {
		...setting,
		endsAt: momentAfter(now, setting.pausedRemainingSeconds),
		pausedRemainingSeconds: null
	};
}

/**
 * The timer with `seconds` more on it, running or paused. A timer that has
 * already run out gets the seconds from `now`, so "+15s" at 0:00 gives fifteen
 * seconds. The length it is shown against stays the same. Null when no timer is
 * set.
 */
export function timerWithAddedSeconds(
	setting: TimerSetting,
	seconds: number,
	now: Date
): TimerSetting | null {
	if (setting.pausedRemainingSeconds !== null) {
		return { ...setting, pausedRemainingSeconds: setting.pausedRemainingSeconds + seconds };
	}

	if (setting.endsAt === null) return null;

	const secondsLeft = remainingSeconds(setting, now) ?? 0;

	return { ...setting, endsAt: momentAfter(now, secondsLeft + seconds) };
}

/**
 * The timer back at its full length and paused, waiting for the chair to start
 * it again. Null when no timer is set.
 */
export function resetTimer(setting: TimerSetting): TimerSetting | null {
	if (setting.totalSeconds === null) return null;

	return {
		totalSeconds: setting.totalSeconds,
		endsAt: null,
		pausedRemainingSeconds: setting.totalSeconds
	};
}

/**
 * When the room is due back from an unmoderated caucus, which the Unmod view
 * writes as "back at 14:32" under its clock (`specs/05-pages/chair/unmod.md`,
 * "Data"): the moment a running clock reaches zero, or, while it is paused,
 * `now` plus the time it has left, so a paused caucus's "back at" moves on
 * with the wall clock. A clock that has gone over keeps the moment the room
 * was due. Null when no clock is set.
 */
export function dueBackAt(
	timer: Pick<TimerSetting, 'endsAt' | 'pausedRemainingSeconds'>,
	now: Date
): Date | null {
	if (timer.endsAt !== null) return new Date(timer.endsAt);
	if (timer.pausedRemainingSeconds === null) return null;

	const secondsLeft = Math.max(0, timer.pausedRemainingSeconds);

	return new Date(now.getTime() + secondsLeft * 1000);
}

/** A place in a list in words: 1 is "1st", 2 is "2nd", 3 is "3rd", 11 is "11th", 21 is "21st". */
export function ordinal(place: number): string {
	const lastTwoDigits = place % 100;

	// Eleven, twelve and thirteen break the rule the last digit sets.
	if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return `${place}th`;

	const lastDigit = place % 10;

	if (lastDigit === 1) return `${place}st`;
	if (lastDigit === 2) return `${place}nd`;
	if (lastDigit === 3) return `${place}rd`;

	return `${place}th`;
}
