/**
 * The chair's Motions view: the shape of a session's motions, the sentences
 * the view answers with, the readings of its forms, and which motion goes to
 * the vote.
 *
 * `specs/05-pages/chair/motions.md` describes the view. The order motions are
 * put to the vote is `rankMotions` and the majority is `simpleMajority`, both
 * in `$lib/committee-room.ts`, which every screen in the room shares. What
 * each kind of motion asks for, how a typed time is read and a motion's words
 * are `$lib/motion-input.ts`; what a count means is `$lib/motion-count.ts`.
 * Fetching and writing is `$lib/server/motions.ts`'s job, and what a passed
 * motion does to the room is `$lib/server/motion-effects.ts`'s. Nothing here
 * talks to Supabase, so the components can import it too.
 */

import type { CommitteeSession, MotionStatus } from '$lib/chair-room';
import {
	rankMotions,
	startedTimer,
	timerWithAddedSeconds,
	type CommitteeMode,
	type MotionKind,
	type RoomMotion,
	type RoomSeat,
	type TimerSetting
} from '$lib/committee-room';
import { motionKindFields, readDuration } from '$lib/motion-input';
import type { FloorPaper } from '$lib/papers-on-floor';

/** One motion of a session, with the seat that raised it. */
export type SessionMotion = RoomMotion & {
	status: MotionStatus;
	/** The seat that raised it, or null when the chair did. */
	proposedBy: RoomSeat | null;
	votesFor: number | null;
	votesAgainst: number | null;
	/** When it passed, failed, was dropped or withdrawn; null while it is on the floor. */
	decidedAt: string | null;
	/** A caucus started from its own view without a vote (D3): the record says so instead of a count. */
	startedWithoutVote: boolean;
};

/** A session's motions, as the view draws them in two lists. */
export type MotionsByStatus = {
	/** Still to be voted on, in the order they go to the vote. */
	proposed: SessionMotion[];
	/** Passed, failed, dropped or withdrawn, newest first. */
	decided: SessionMotion[];
};

/**
 * What the composer, "Record a motion", holds, as text, so a refused form is
 * drawn again as it was. The three shared fields mean what the kind makes of
 * them (`motionKindFields` in `$lib/motion-input.ts`).
 */
export type MotionFormValues = {
	kind: string;
	/** A seat id, `CHAIR_PROPOSER`, or `''` when nothing is picked yet. */
	proposedBySeatId: string;
	/** The topic, the reason, the document or the motion's name. */
	topic: string;
	/** The total, the length or the extension, typed as "10", "1:30" or "90s". */
	totalTime: string;
	/** A moderated caucus's speaking time, typed the same way. */
	speakingTime: string;
	/**
	 * The approved paper a motion to introduce a document names, by its id,
	 * `OTHER_DOCUMENT` for a document typed in the topic, or `''` while nothing
	 * is picked. Any other kind ignores it.
	 */
	paperId: string;
};

/** A message for each field that needs fixing. A field that is fine has no entry. */
export type MotionFormErrors = Partial<Record<keyof MotionFormValues, string>>;

/** A motion as `$lib/server/motions.ts` writes it. */
export type MotionInput = {
	kind: MotionKind;
	/** Null for a motion the chair raised. */
	proposedBySeatId: string | null;
	topic: string | null;
	totalTimeSeconds: number | null;
	speakingTimeSeconds: number | null;
	/** The approved paper a motion to introduce a document introduces, or null for a typed one. */
	paperId: string | null;
};

/** The hands counted for and against a motion. */
export type MotionTally = {
	votesFor: number;
	votesAgainst: number;
};

/**
 * What Pass and Fail sent as counts: a tally, null when the chair did not
 * count (both fields empty), or `'notWhole'` for a count that is not a whole
 * number of 0 or more.
 */
export type MotionTallyReading = MotionTally | null | 'notWhole';

/** The two decisions the vote form's buttons send as `result`. */
export type MotionResult = 'passed' | 'failed';

/** The session whose motions the view shows, and whether they may still be changed. */
export type ShownMotionsSession = {
	session: CommitteeSession | null;
	/** True for an ended session, whose motions are the session record. */
	isReadOnly: boolean;
};

/** The motion "Next to vote" shows, whether `?motion=` put it there out of its turn, and the rest. */
export type MotionToDecide = {
	motion: SessionMotion | null;
	isOutOfOrder: boolean;
	/** The rest of the floor, in rank order: "Further motions". */
	further: SessionMotion[];
};

/** The "Raised by" choice that means the chair raised the motion. */
export const CHAIR_PROPOSER = 'chair';

/** The "Paper" choice that means a document with no paper in MUNMeet, named in the topic instead. */
export const OTHER_DOCUMENT = 'other';

/** The longest topic a motion may have. The topic box also stops typing there. */
export const MOTION_TOPIC_MAX_LENGTH = 200;

/** A caucus's total, an unmoderated caucus's length and an extension: 1 to 60 minutes. */
const MIN_TOTAL_SECONDS = 60;
const MAX_TOTAL_SECONDS = 60 * 60;

/** The optional length of a suspension or another motion: 1 minute to 4 hours. */
const MIN_LENGTH_SECONDS = 60;
const MAX_LENGTH_SECONDS = 4 * 60 * 60;

/** The shortest and longest speech in a moderated caucus, in seconds. */
const MIN_SPEAKING_SECONDS = 15;
const MAX_SPEAKING_SECONDS = 300;

/** The kinds whose time field is an optional length rather than a caucus's total. */
const KINDS_WITH_OPTIONAL_LENGTH: MotionKind[] = ['suspend_meeting', 'other'];

/** The sentences the view's actions answer with when they refuse. */
export const MOTION_REFUSALS = {
	noSession: 'Start a session first.',
	noCaucus: 'There is no caucus to extend.',
	tooManyVotes: 'More votes than delegates present.',
	voteCounts: 'Enter the votes as whole numbers.',
	countSaysFails: 'As counted, the motion fails. Press Fail, or correct the count.',
	countSaysPasses: 'As counted, the motion passes. Press Pass, or correct the count.',
	notOnFloor: 'That motion is no longer on the floor.',
	noResult: 'Press Pass or Fail.',
	emptyFloor: 'There are no motions on the floor.',
	notDropped: 'Only a dropped motion can go back on the floor.'
} as const;

/** The messages under the composer's fields. */
export const MOTION_FIELD_MESSAGES = {
	kind: 'Pick the kind of motion.',
	proposer: 'Pick the seat that raised the motion.',
	caucusTopic: 'A moderated caucus needs a topic.',
	topic: 'Say what the motion is about.',
	topicLength: `Keep the topic under ${MOTION_TOPIC_MAX_LENGTH} characters.`,
	totalTime: 'Total time must be between 1 and 60 minutes.',
	length: 'A length must be between 1 minute and 4 hours.',
	speakingTime: 'Speaking time must be between 15 and 300 seconds.',
	speakingLongerThanTotal: 'Speaking time cannot be longer than the total time.',
	paper: 'Pick the paper to introduce, or Other.'
} as const;

/** The eight kinds, in the order the composer offers them. */
const MOTION_KINDS: MotionKind[] = [
	'moderated_caucus',
	'unmoderated_caucus',
	'extend_caucus',
	'suspend_meeting',
	'adjourn_meeting',
	'close_debate',
	'introduce_document',
	'other'
];

/** Is this text one of the eight kinds of motion? */
export function isMotionKind(text: string): text is MotionKind {
	return MOTION_KINDS.some((kind) => kind === text);
}

/** Whether the room is running a caucus, which an extension needs. */
export function isCaucusMode(mode: CommitteeMode): boolean {
	return mode === 'moderated_caucus' || mode === 'unmoderated_caucus';
}

/**
 * The composer as it first appears, or after a motion was added: the kind
 * chosen (a moderated caucus at first) and every other field empty, since an
 * empty time field means its default.
 */
export function emptyMotionForm(kind: string = 'moderated_caucus'): MotionFormValues {
	return { kind, proposedBySeatId: '', topic: '', totalTime: '', speakingTime: '', paperId: '' };
}

/** Read one text field from the submitted form, without surrounding spaces. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/** Whether `seconds` is a time from `min` to `max`. */
function isWithin(seconds: number | null, min: number, max: number): seconds is number {
	return seconds !== null && seconds >= min && seconds <= max;
}

/** The message under the topic field, or null when it is fine. */
function topicError(kind: MotionKind, topic: string, isRequired: boolean): string | null {
	if (topic.length > MOTION_TOPIC_MAX_LENGTH) return MOTION_FIELD_MESSAGES.topicLength;
	if (!isRequired || topic !== '') return null;

	return kind === 'moderated_caucus'
		? MOTION_FIELD_MESSAGES.caucusTopic
		: MOTION_FIELD_MESSAGES.topic;
}

/**
 * A time field read into seconds: its default when empty, and otherwise what
 * was typed, checked against the kind's limits. `error` is the message under
 * the field, or null.
 */
function readTimeField(
	text: string,
	defaultSeconds: number | null,
	isOptionalLength: boolean
): { seconds: number | null; error: string | null } {
	if (text === '') return { seconds: defaultSeconds, error: null };

	const seconds = readDuration(text);

	if (isOptionalLength) {
		const isFine = isWithin(seconds, MIN_LENGTH_SECONDS, MAX_LENGTH_SECONDS);

		return { seconds, error: isFine ? null : MOTION_FIELD_MESSAGES.length };
	}

	const isFine = isWithin(seconds, MIN_TOTAL_SECONDS, MAX_TOTAL_SECONDS);

	return { seconds, error: isFine ? null : MOTION_FIELD_MESSAGES.totalTime };
}

/** The speaking time read into seconds, with its message: its own limits, and never longer than the total. */
function readSpeakingField(
	text: string,
	defaultSeconds: number,
	totalSeconds: number | null
): { seconds: number | null; error: string | null } {
	const seconds = text === '' ? defaultSeconds : readDuration(text);

	if (!isWithin(seconds, MIN_SPEAKING_SECONDS, MAX_SPEAKING_SECONDS)) {
		return { seconds, error: MOTION_FIELD_MESSAGES.speakingTime };
	}

	if (totalSeconds !== null && seconds > totalSeconds) {
		return { seconds, error: MOTION_FIELD_MESSAGES.speakingLongerThanTotal };
	}

	return { seconds, error: null };
}

/**
 * The approved paper a motion to introduce a document names, or what is
 * wrong with the pick. Only a document asks, and only while the committee
 * has approved papers waiting; "Other" leaves the document to the topic.
 */
function readPickedPaper(
	kind: MotionKind,
	paperId: string,
	approvedPapers: FloorPaper[]
): { paper: FloorPaper | null; error: string | null } {
	if (kind !== 'introduce_document' || approvedPapers.length === 0) {
		return { paper: null, error: null };
	}

	if (paperId === OTHER_DOCUMENT) return { paper: null, error: null };

	const paper = approvedPapers.find((candidate) => candidate.id === paperId) ?? null;

	return { paper, error: paper === null ? MOTION_FIELD_MESSAGES.paper : null };
}

/**
 * Read and check a submitted composer. `presentSeatIds` are the seats that may
 * raise a motion; `defaultSpeakingSeconds` is the committee's speaking time,
 * which an empty "Each" means; `approvedPapers` are the papers a motion to
 * introduce a document may name. Answers what was typed, a message per field
 * that needs fixing, and, when nothing does, the motion to write. A field the
 * kind does not ask for is ignored and written as null. A picked paper is the
 * motion's topic too, "Working paper 1.1", so every list of motions names it.
 */
export function readMotionForm(
	formData: FormData,
	presentSeatIds: string[],
	defaultSpeakingSeconds: number,
	approvedPapers: FloorPaper[] = []
): { values: MotionFormValues; errors: MotionFormErrors; input: MotionInput | null } {
	const values: MotionFormValues = {
		kind: readText(formData, 'kind'),
		proposedBySeatId: readText(formData, 'proposedBySeatId'),
		topic: readText(formData, 'topic'),
		totalTime: readText(formData, 'totalTime'),
		speakingTime: readText(formData, 'speakingTime'),
		paperId: readText(formData, 'paperId')
	};
	const errors: MotionFormErrors = {};

	if (!isMotionKind(values.kind)) {
		return { values, errors: { kind: MOTION_FIELD_MESSAGES.kind }, input: null };
	}

	const kind = values.kind;
	const fields = motionKindFields(kind, defaultSpeakingSeconds);
	const isChair = values.proposedBySeatId === CHAIR_PROPOSER;

	if (!isChair && !presentSeatIds.includes(values.proposedBySeatId)) {
		errors.proposedBySeatId = MOTION_FIELD_MESSAGES.proposer;
	}

	const picked = readPickedPaper(kind, values.paperId, approvedPapers);
	if (picked.error) errors.paperId = picked.error;

	// With a paper picked, or still to pick, the typed name is not the document's.
	const isTopicRead = picked.paper === null && picked.error === null;
	const topicMessage =
		fields.topic && isTopicRead ? topicError(kind, values.topic, fields.topic.isRequired) : null;
	if (topicMessage) errors.topic = topicMessage;

	const isOptionalLength = KINDS_WITH_OPTIONAL_LENGTH.includes(kind);
	const total = fields.totalTime
		? readTimeField(values.totalTime, fields.totalTime.defaultSeconds, isOptionalLength)
		: { seconds: null, error: null };
	if (total.error) errors.totalTime = total.error;

	const speaking = fields.speakingTime
		? readSpeakingField(values.speakingTime, defaultSpeakingSeconds, total.seconds)
		: { seconds: null, error: null };
	if (speaking.error) errors.speakingTime = speaking.error;

	if (Object.keys(errors).length > 0) return { values, errors, input: null };

	const typedTopic = fields.topic && values.topic !== '' ? values.topic : null;
	const input: MotionInput = {
		kind,
		proposedBySeatId: isChair ? null : values.proposedBySeatId,
		topic: picked.paper?.name ?? typedTopic,
		totalTimeSeconds: total.seconds,
		speakingTimeSeconds: speaking.seconds,
		paperId: picked.paper?.id ?? null
	};

	return { values, errors, input };
}

/**
 * The counts Pass and Fail sent. Counting is optional: with both fields empty
 * the motion is decided without a tally (null). Once either is filled, an
 * empty one counts as 0. A count that is not a whole number of 0 or more
 * reads as `'notWhole'`.
 */
export function readMotionTally(formData: FormData): MotionTallyReading {
	const forText = readText(formData, 'votesFor');
	const againstText = readText(formData, 'votesAgainst');

	if (forText === '' && againstText === '') return null;

	const wholeNumber = /^\d+$/;
	const isWhole = (text: string) => text === '' || wholeNumber.test(text);

	if (!isWhole(forText) || !isWhole(againstText)) return 'notWhole';

	return { votesFor: Number(forText || 0), votesAgainst: Number(againstText || 0) };
}

/** The decision a vote form's button sent: `passed` or `failed`, or null for anything else. */
export function readMotionResult(value: FormDataEntryValue | null): MotionResult | null {
	if (value === 'passed' || value === 'failed') return value;

	return null;
}

/** Every `motionId` a form sent, as "Undo" and "Restore" send them, without repeats or blanks. */
export function readMotionIds(formData: FormData): string[] {
	const ids = formData.getAll('motionId').map((value) => String(value).trim());

	return [...new Set(ids.filter((id) => id !== ''))];
}

/** The moment a motion was decided, or proposed when it has not been, in milliseconds. */
function decidedTime(motion: SessionMotion): number {
	return new Date(motion.decidedAt ?? motion.createdAt).getTime();
}

/**
 * Split a session's motions into the floor, ranked by `rankMotions`, and the
 * decided ones, newest first.
 */
export function splitMotions(motions: SessionMotion[]): MotionsByStatus {
	const proposed = motions.filter((motion) => motion.status === 'proposed');
	const decided = motions.filter((motion) => motion.status !== 'proposed');
	// `sort` changes the array it is given, so it sorts a copy.
	const newestFirst = [...decided].sort(
		(first, second) => decidedTime(second) - decidedTime(first)
	);

	return { proposed: rankMotions(proposed), decided: newestFirst };
}

/**
 * The motion "Next to vote" shows: the one on the floor that `requestedId`
 * (`?motion=`) names, out of order, or else the most disruptive one. A
 * `?motion=` that names nothing on the floor any more is ignored.
 * `proposed` is the floor in rank order.
 */
export function motionToDecide(
	proposed: SessionMotion[],
	requestedId: string | null
): MotionToDecide {
	const first = proposed[0] ?? null;
	const requested = proposed.find((motion) => motion.id === requestedId);
	const isOutOfOrder = requested !== undefined && requested.id !== first?.id;
	const motion = (isOutOfOrder ? requested : first) ?? null;
	const further = proposed.filter((onFloor) => onFloor.id !== motion?.id);

	return { motion, isOutOfOrder, further };
}

/** Each motion's place in the order the floor goes to the vote, 1 for the most disruptive. */
export function motionRanks(floor: SessionMotion[]): Record<string, number> {
	const ranks: Record<string, number> = {};

	floor.forEach((motion, index) => {
		ranks[motion.id] = index + 1;
	});

	return ranks;
}

/**
 * What a decided row says after its title: the count ("9–4", with an en
 * dash), "started without a vote" for a caucus started directly, or null for
 * a motion decided without counting.
 */
export function decidedMotionTally(
	motion: Pick<SessionMotion, 'votesFor' | 'votesAgainst' | 'startedWithoutVote'>
): string | null {
	if (motion.startedWithoutVote) return 'started without a vote';
	if (motion.votesFor === null || motion.votesAgainst === null) return null;

	return `${motion.votesFor}–${motion.votesAgainst}`;
}

/**
 * The toast after motions left the floor at once: "2 other motions dropped"
 * when another motion passed, or "3 motions dropped" when the chair cleared
 * the floor.
 */
export function droppedMotionsMessage(count: number, areOthers: boolean): string {
	const other = areOthers ? 'other ' : '';
	const motions = count === 1 ? 'motion' : 'motions';

	return `${count} ${other}${motions} dropped`;
}

/**
 * What "Raised by" shows for its choice: the seat's name, "The chair" for
 * `CHAIR_PROPOSER`, or nothing while nothing (or a seat no longer there) is
 * chosen.
 */
export function raisedByLabel(value: string, seats: RoomSeat[]): string {
	if (value === CHAIR_PROPOSER) return 'The chair';

	return seats.find((seat) => seat.id === value)?.name ?? '';
}

/**
 * The room's timer lengthened by a passed extension of `seconds`. A running or
 * paused timer gets the seconds on top of what it has left, and the length it
 * is drawn against grows by the same amount. With no timer at all, the
 * extension starts one of its own.
 */
export function extendedCaucusTimer(
	setting: TimerSetting,
	seconds: number,
	now: Date
): TimerSetting {
	const longer = timerWithAddedSeconds(setting, seconds, now);

	if (longer === null) return startedTimer(seconds, now);

	return { ...longer, totalSeconds: (setting.totalSeconds ?? 0) + seconds };
}

/**
 * The session the view shows: the ended one `?session=` names, read-only (the
 * session record), or else the session running in the room. Null when neither
 * is there.
 */
export function chooseShownSession(
	sessions: CommitteeSession[],
	currentSession: CommitteeSession | null,
	requestedSessionId: string | null
): ShownMotionsSession {
	const requested = sessions.find((session) => session.id === requestedSessionId);

	if (requested?.status === 'ended') return { session: requested, isReadOnly: true };
	if (currentSession?.status === 'in_progress')
		return { session: currentSession, isReadOnly: false };

	return { session: null, isReadOnly: false };
}

/** The committee's ended sessions, whose records the session record links to. */
export function endedSessions(sessions: CommitteeSession[]): CommitteeSession[] {
	return sessions.filter((session) => session.status === 'ended');
}

/**
 * The one motion the delegate live view shows: the caucus the room is running,
 * when there is one, and otherwise the motion that goes to the vote first.
 * Null when the floor is empty.
 */
export function floorMotion(
	motions: SessionMotion[],
	currentMotionId: string | null
): SessionMotion | null {
	const running = motions.find((motion) => motion.id === currentMotionId);

	if (running) return running;

	return splitMotions(motions).proposed[0] ?? null;
}
