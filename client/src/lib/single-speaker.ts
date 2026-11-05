/**
 * The single speaker: one speaker given the floor outside any list, a seat
 * or anybody with a typed name ("Secretary-General"), with a purpose and a
 * time (`specs/05-pages/chair/single-speaker.md`). The three fixed purposes,
 * the time presets, reading the start form "Give one speaker the floor", and
 * the words of the running view's title.
 *
 * Plain functions with no Svelte in them, so the page, the action and the
 * tests read the form exactly alike.
 */

import { formatDuration } from '$lib/committee-room';
import type { GslList } from '$lib/gsl-floor';
import { readDuration } from '$lib/motion-input';

/**
 * What the Single speaker view draws while a single speaker has the floor, as
 * `readSingleSpeakerView` in `$lib/server/single-speaker-view.ts` reads it.
 */
export type SingleSpeakerViewData = {
	/** The single speaker's list, or null in the moment before the database has made it. */
	list: GslList | null;
	/** "Right of reply", or null when no purpose was given. */
	purpose: string | null;
};

/** The fixed purposes, in the order the form offers them. */
export const SINGLE_SPEAKER_PURPOSES = ['Right of reply', 'Presentation', 'Explanation of vote'];

/** The value of the "Other…" purpose, whose words are typed in `purposeOther`. */
export const OTHER_PURPOSE = 'other';

/** The time presets, as the radio buttons' values and words; "1:00" is chosen at first. */
export const SINGLE_SPEAKER_TIME_PRESETS = ['0:30', '1:00', '2:00', '3:00', '5:00'];

/** The time chosen when the form first shows. */
export const DEFAULT_SINGLE_SPEAKER_TIME = '1:00';

/** The longest typed name and the longest purpose, in characters. */
export const SINGLE_SPEAKER_TEXT_MAX_LENGTH = 80;

/** The shortest and longest time a single speaker may be given: 15 seconds to 20 minutes. */
const MIN_SPEAKING_SECONDS = 15;
const MAX_SPEAKING_SECONDS = 1200;

/** The sentences the start form refuses with (`single-speaker.md`, "`startSingle`"). */
export const SINGLE_SPEAKER_MESSAGES = {
	noSpeaker: 'Choose a delegation or type a name.',
	bothSpeakers: 'Choose a delegation or type a name, not both.',
	notPresent: 'That seat is not present.',
	nameLength: `Keep the name under ${SINGLE_SPEAKER_TEXT_MAX_LENGTH} characters.`,
	noPurpose: 'Say what the purpose is, or choose another.',
	purposeLength: `Keep the purpose under ${SINGLE_SPEAKER_TEXT_MAX_LENGTH} characters.`,
	time: 'Speaking time must be between 15 seconds and 20 minutes.'
} as const;

/** What the form holds, as typed, so a refused form is drawn again as it was. */
export type SingleSpeakerValues = {
	/** The chosen seat's id, or empty. */
	seatId: string;
	/** A name typed for somebody who holds no seat, or empty. */
	speakerName: string;
	/** One of the fixed purposes, `other`, or empty for none. */
	purpose: string;
	/** The words of "Other…". */
	purposeOther: string;
	/** The chosen preset, or empty once a time is typed. */
	time: string;
	/** A time typed in "other", which wins over the preset. */
	timeTyped: string;
};

/** A message for each part of the form that needs fixing: who, the purpose or the time. */
export type SingleSpeakerErrors = Partial<Record<'who' | 'purpose' | 'time', string>>;

/** The single speaker to give the floor, read from the form. Exactly one of the first two is set. */
export type SingleSpeakerInput = {
	seatId: string | null;
	speakerName: string | null;
	/** The purpose's words, or null for none. */
	purpose: string | null;
	speakingSeconds: number;
};

/** What reading the form answers: what was typed, what is wrong, and the speaker when nothing is. */
export type SingleSpeakerReading = {
	values: SingleSpeakerValues;
	errors: SingleSpeakerErrors;
	input: SingleSpeakerInput | null;
};

/** The form as it first shows: nobody chosen, no purpose, "1:00". */
export function emptySingleSpeakerForm(): SingleSpeakerValues {
	return {
		seatId: '',
		speakerName: '',
		purpose: '',
		purposeOther: '',
		time: DEFAULT_SINGLE_SPEAKER_TIME,
		timeTyped: ''
	};
}

/** One text field of the submitted form, without the spaces around it. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/** What is wrong with who was chosen, or null when exactly one present seat or one short name was. */
function whoError(values: SingleSpeakerValues, presentSeatIds: string[]): string | null {
	const hasSeat = values.seatId !== '';
	const hasName = values.speakerName !== '';

	if (!hasSeat && !hasName) return SINGLE_SPEAKER_MESSAGES.noSpeaker;
	if (hasSeat && hasName) return SINGLE_SPEAKER_MESSAGES.bothSpeakers;
	if (hasSeat && !presentSeatIds.includes(values.seatId)) return SINGLE_SPEAKER_MESSAGES.notPresent;
	if (values.speakerName.length > SINGLE_SPEAKER_TEXT_MAX_LENGTH) {
		return SINGLE_SPEAKER_MESSAGES.nameLength;
	}

	return null;
}

/**
 * The purpose's words: a fixed purpose as it is, the words of "Other…", or
 * null for none (nothing chosen, or a value the form never offers).
 */
export function purposeWords(purpose: string, purposeOther: string): string | null {
	if (SINGLE_SPEAKER_PURPOSES.includes(purpose)) return purpose;
	if (purpose === OTHER_PURPOSE) return purposeOther;

	return null;
}

/** What is wrong with the purpose, or null. Only "Other…" can be wrong: empty, or too long. */
function purposeError(values: SingleSpeakerValues): string | null {
	if (values.purpose !== OTHER_PURPOSE) return null;
	if (values.purposeOther === '') return SINGLE_SPEAKER_MESSAGES.noPurpose;
	if (values.purposeOther.length > SINGLE_SPEAKER_TEXT_MAX_LENGTH) {
		return SINGLE_SPEAKER_MESSAGES.purposeLength;
	}

	return null;
}

/** The speaking time in seconds, the typed time winning over the preset, or null when it is not allowed. */
function readSpeakingSeconds(values: SingleSpeakerValues): number | null {
	const text = values.timeTyped === '' ? values.time : values.timeTyped;
	const seconds = readDuration(text);

	if (seconds === null || seconds < MIN_SPEAKING_SECONDS || seconds > MAX_SPEAKING_SECONDS) {
		return null;
	}

	return seconds;
}

/**
 * Read and check the form "Give one speaker the floor". `presentSeatIds` are
 * the committee's seats not marked absent, the only seats that may take the
 * floor; a typed name stands for somebody who holds no seat. Without
 * JavaScript both a seat and a name can arrive, which is refused.
 */
export function readSingleSpeakerForm(
	formData: FormData,
	presentSeatIds: string[]
): SingleSpeakerReading {
	const values: SingleSpeakerValues = {
		seatId: readText(formData, 'seatId'),
		speakerName: readText(formData, 'speakerName'),
		purpose: readText(formData, 'purpose'),
		purposeOther: readText(formData, 'purposeOther'),
		time: readText(formData, 'time'),
		timeTyped: readText(formData, 'timeTyped')
	};
	const errors: SingleSpeakerErrors = {};
	const who = whoError(values, presentSeatIds);
	const purpose = purposeError(values);
	const speakingSeconds = readSpeakingSeconds(values);

	if (who !== null) errors.who = who;
	if (purpose !== null) errors.purpose = purpose;
	if (speakingSeconds === null) errors.time = SINGLE_SPEAKER_MESSAGES.time;

	if (who !== null || purpose !== null || speakingSeconds === null) {
		return { values, errors, input: null };
	}

	const input: SingleSpeakerInput = {
		seatId: values.seatId === '' ? null : values.seatId,
		speakerName: values.speakerName === '' ? null : values.speakerName,
		purpose: purposeWords(values.purpose, values.purposeOther),
		speakingSeconds
	};

	return { values, errors, input };
}

/**
 * The running view's title before its time: "Single speaker · Right of
 * reply", or "Single speaker" alone when no purpose was given. The time,
 * "· 1:00", follows it in a quieter colour (`singleSpeakerTimeText`).
 */
export function singleSpeakerTitle(purpose: string | null): string {
	if (purpose === null || purpose === '') return 'Single speaker';

	return `Single speaker · ${purpose}`;
}

/** The time each speaker gets, as the title ends: "· 1:00". */
export function singleSpeakerTimeText(speakingSeconds: number): string {
	return `· ${formatDuration(speakingSeconds)}`;
}
