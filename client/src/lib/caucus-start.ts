/**
 * Reading the start forms of the Mod and Unmod views: "Start a moderated
 * caucus" and "Start an unmoderated caucus" (`specs/05-pages/chair/mod.md`,
 * "`startModerated`", and `unmod.md`, "`startUnmoderated`").
 *
 * They read a caucus the way the Motions composer reads one of the same kind
 * (`motions.md`, "`propose`"): the same defaults, the same limits and the same
 * sentences, so a caucus started directly and one passed in Motions are the
 * same. Times are typed the MUN way and read by `readDuration`. Unlike the
 * composer, "Raised by" may be left empty, which means the chair.
 *
 * Plain functions with no Svelte in them, so the page, the action and the
 * tests read a form exactly alike.
 */

import { CHAIR_PROPOSER } from '$lib/motions';
import { DEFAULT_CAUCUS_SECONDS, readDuration } from '$lib/motion-input';

/** The two kinds of caucus a view starts. */
export type CaucusKind = 'moderated_caucus' | 'unmoderated_caucus';

/** A caucus to start, read from a start form. */
export type CaucusStartInput = {
	kind: CaucusKind;
	/** The seat that raised it, or null when the chair did. */
	proposedBySeatId: string | null;
	topic: string | null;
	totalSeconds: number;
	/** Each speaker's time in a moderated caucus; null in an unmoderated one. */
	speakingSeconds: number | null;
};

/** What the Mod start form holds, as typed, so a refused form is drawn again as it was. */
export type ModStartValues = {
	topic: string;
	totalTime: string;
	speakingTime: string;
	/** A seat id, `chair`, or empty for the chair. */
	proposedBySeatId: string;
};

/** A message for each Mod start field that needs fixing. */
export type ModStartErrors = Partial<Record<keyof ModStartValues, string>>;

/** What the Unmod start form holds, as typed. */
export type UnmodStartValues = {
	/** The chosen preset, such as "10:00", or empty once a length is typed. */
	length: string;
	/** A length typed in "other", which wins over the preset. */
	lengthTyped: string;
	topic: string;
	proposedBySeatId: string;
};

/** A message for each Unmod start field that needs fixing; `length` covers both length fields. */
export type UnmodStartErrors = Partial<Record<'length' | 'topic' | 'proposedBySeatId', string>>;

/** What reading a start form answers: what was typed, what is wrong, and the caucus when nothing is. */
export type StartFormReading<Values, Errors> = {
	values: Values;
	errors: Errors;
	input: CaucusStartInput | null;
};

/** One of Unmod's four lengths: the radio button's value, and its words. */
export type LengthPreset = { value: string; label: string };

/** Unmod's four lengths, in order; "10 min" is chosen at first. */
export const UNMOD_LENGTH_PRESETS: LengthPreset[] = [
	{ value: '5:00', label: '5 min' },
	{ value: '10:00', label: '10 min' },
	{ value: '15:00', label: '15 min' },
	{ value: '20:00', label: '20 min' }
];

/** The length chosen when the Unmod form first shows. */
export const DEFAULT_UNMOD_LENGTH = '10:00';

/** The longest topic a caucus may have, as in the composer. */
export const CAUCUS_TOPIC_MAX_LENGTH = 200;

/** The shortest and longest caucus, in seconds: 1 to 60 minutes. */
const MIN_TOTAL_SECONDS = 60;
const MAX_TOTAL_SECONDS = 3600;

/** The shortest and longest speech in a moderated caucus, in seconds. */
const MIN_SPEAKING_SECONDS = 15;
const MAX_SPEAKING_SECONDS = 300;

/** The composer's own sentences (`motions.md`, "`propose`"), which the start forms share. */
export const CAUCUS_START_MESSAGES = {
	proposer: 'Pick the seat that raised the motion.',
	caucusTopic: 'A moderated caucus needs a topic.',
	topicLength: `Keep the topic under ${CAUCUS_TOPIC_MAX_LENGTH} characters.`,
	totalTime: 'Total time must be between 1 and 60 minutes.',
	speakingTime: 'Speaking time must be between 15 and 300 seconds.',
	speakingLongerThanTotal: 'Speaking time cannot be longer than the total time.'
} as const;

/** The Mod start form as it first shows: empty, so the placeholders show the defaults. */
export function emptyModStart(): ModStartValues {
	return { topic: '', totalTime: '', speakingTime: '', proposedBySeatId: '' };
}

/** The Unmod start form as it first shows: "10 min" chosen, nothing typed. */
export function emptyUnmodStart(): UnmodStartValues {
	return { length: DEFAULT_UNMOD_LENGTH, lengthTyped: '', topic: '', proposedBySeatId: '' };
}

/** One text field of the submitted form, without the spaces around it. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/** Whether `seconds` was read and lies from `min` to `max`. */
function isWithin(seconds: number | null, min: number, max: number): seconds is number {
	return seconds !== null && seconds >= min && seconds <= max;
}

/**
 * Who raised the caucus: null for the chair (an empty field or `chair`), the
 * seat's id for a present seat, or undefined for anything else, which the
 * form refuses.
 */
function readProposer(value: string, presentSeatIds: string[]): string | null | undefined {
	if (value === '' || value === CHAIR_PROPOSER) return null;

	return presentSeatIds.includes(value) ? value : undefined;
}

/** The message for a topic too long to keep, or for a moderated caucus's missing one; null when fine. */
function topicError(topic: string, isRequired: boolean): string | null {
	if (isRequired && topic === '') return CAUCUS_START_MESSAGES.caucusTopic;
	if (topic.length > CAUCUS_TOPIC_MAX_LENGTH) return CAUCUS_START_MESSAGES.topicLength;

	return null;
}

/**
 * Read and check the Mod start form. `presentSeatIds` are the seats that may
 * have raised the caucus; `defaultSpeakingSeconds` is the committee's
 * speaking time, which an empty "Each speaker" takes, as an empty "Total"
 * takes 10:00.
 */
export function readModStartForm(
	formData: FormData,
	presentSeatIds: string[],
	defaultSpeakingSeconds: number
): StartFormReading<ModStartValues, ModStartErrors> {
	const values: ModStartValues = {
		topic: readText(formData, 'topic'),
		totalTime: readText(formData, 'totalTime'),
		speakingTime: readText(formData, 'speakingTime'),
		proposedBySeatId: readText(formData, 'proposedBySeatId')
	};
	const errors: ModStartErrors = {};
	const proposer = readProposer(values.proposedBySeatId, presentSeatIds);
	const totalSeconds =
		values.totalTime === '' ? DEFAULT_CAUCUS_SECONDS : readDuration(values.totalTime);
	const speakingSeconds =
		values.speakingTime === '' ? defaultSpeakingSeconds : readDuration(values.speakingTime);
	const hasTotal = isWithin(totalSeconds, MIN_TOTAL_SECONDS, MAX_TOTAL_SECONDS);
	const hasSpeaking = isWithin(speakingSeconds, MIN_SPEAKING_SECONDS, MAX_SPEAKING_SECONDS);

	const topicMessage = topicError(values.topic, true);

	if (topicMessage !== null) errors.topic = topicMessage;
	if (proposer === undefined) errors.proposedBySeatId = CAUCUS_START_MESSAGES.proposer;
	if (!hasTotal) errors.totalTime = CAUCUS_START_MESSAGES.totalTime;
	if (!hasSpeaking) errors.speakingTime = CAUCUS_START_MESSAGES.speakingTime;
	if (hasTotal && hasSpeaking && speakingSeconds > totalSeconds) {
		errors.speakingTime = CAUCUS_START_MESSAGES.speakingLongerThanTotal;
	}

	const hasErrors = Object.keys(errors).length > 0;

	if (hasErrors || proposer === undefined || !hasTotal || !hasSpeaking) {
		return { values, errors, input: null };
	}

	const input: CaucusStartInput = {
		kind: 'moderated_caucus',
		proposedBySeatId: proposer,
		topic: values.topic,
		totalSeconds,
		speakingSeconds
	};

	return { values, errors, input };
}

/**
 * Read and check the Unmod start form. A length typed in "other" ("12",
 * "12:30") wins over the chosen preset; without JavaScript both can arrive.
 * The topic may be left empty.
 */
export function readUnmodStartForm(
	formData: FormData,
	presentSeatIds: string[]
): StartFormReading<UnmodStartValues, UnmodStartErrors> {
	const values: UnmodStartValues = {
		length: readText(formData, 'length'),
		lengthTyped: readText(formData, 'lengthTyped'),
		topic: readText(formData, 'topic'),
		proposedBySeatId: readText(formData, 'proposedBySeatId')
	};
	const errors: UnmodStartErrors = {};
	const proposer = readProposer(values.proposedBySeatId, presentSeatIds);
	const lengthText = values.lengthTyped === '' ? values.length : values.lengthTyped;
	const totalSeconds = readDuration(lengthText);
	const hasTotal = isWithin(totalSeconds, MIN_TOTAL_SECONDS, MAX_TOTAL_SECONDS);

	const topicMessage = topicError(values.topic, false);

	if (topicMessage !== null) errors.topic = topicMessage;
	if (proposer === undefined) errors.proposedBySeatId = CAUCUS_START_MESSAGES.proposer;
	if (!hasTotal) errors.length = CAUCUS_START_MESSAGES.totalTime;

	const hasErrors = Object.keys(errors).length > 0;

	if (hasErrors || proposer === undefined || !hasTotal) {
		return { values, errors, input: null };
	}

	const input: CaucusStartInput = {
		kind: 'unmoderated_caucus',
		proposedBySeatId: proposer,
		topic: values.topic === '' ? null : values.topic,
		totalSeconds,
		speakingSeconds: null
	};

	return { values, errors, input };
}
