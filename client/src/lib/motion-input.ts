/**
 * Motions as a chair types them and reads them out: reading a typed time
 * ("10", "1:30", "90s") into seconds, the fields and defaults of each kind of
 * motion, and a motion's title and subtitle ("Moderated caucus · 10:00 /
 * 1:00", "Opening humanitarian corridors · Brazil").
 *
 * `specs/05-pages/chair/motions.md` ("`propose`" and "Components") says what
 * each kind asks for. The GSL's speaking time (`gsl.md`) and the start forms
 * of Mod, Unmod and Single speaker read their times with `readDuration` too.
 * Plain functions, so they can be read and tested without Svelte.
 */

import { formatDuration, type MotionKind, type RoomMotion } from '$lib/committee-room';

/** The text field a kind asks for: its topic, reason, document or name. */
export type TopicField = {
	/** "Topic", "Reason", "Document" or "Motion". */
	label: string;
	isRequired: boolean;
};

/** A time field a kind asks for. */
export type TimeField = {
	/** "Total", "Length", "By" or "Each". */
	label: string;
	/** What an empty field means, in seconds, or null for a time the motion may go without. */
	defaultSeconds: number | null;
};

/** The fields one kind of motion asks for beyond its kind and who raised it; null for one it does not. */
export type MotionKindFields = {
	topic: TopicField | null;
	totalTime: TimeField | null;
	speakingTime: TimeField | null;
};

/** One choice of the composer's row of kinds. */
export type MotionKindChoice = {
	kind: MotionKind;
	/** The short name on the segmented button: "Mod", "Close debate". */
	label: string;
};

/** A motion, with what its title and subtitle are written from. */
export type MotionWordsSource = Pick<
	RoomMotion,
	'kind' | 'topic' | 'totalTimeSeconds' | 'speakingTimeSeconds'
> & {
	/** The seat that raised it, or null when the chair did. */
	proposedBy: { name: string } | null;
};

/** A caucus's total, or an unmoderated caucus's length, when its field is left empty: 10:00. */
export const DEFAULT_CAUCUS_SECONDS = 600;

/** An extension's length when its field is left empty: 5:00. */
export const DEFAULT_EXTENSION_SECONDS = 300;

/** The eight kinds as the composer offers them, in myMUN's order, Mod first and chosen at first. */
export const MOTION_KIND_CHOICES: MotionKindChoice[] = [
	{ kind: 'moderated_caucus', label: 'Mod' },
	{ kind: 'unmoderated_caucus', label: 'Unmod' },
	{ kind: 'extend_caucus', label: 'Extend' },
	{ kind: 'suspend_meeting', label: 'Suspend' },
	{ kind: 'adjourn_meeting', label: 'Adjourn' },
	{ kind: 'close_debate', label: 'Close debate' },
	{ kind: 'introduce_document', label: 'Document' },
	{ kind: 'other', label: 'Other' }
];

/** Each kind's name at the start of its title. */
const MOTION_TITLE_NAMES: Record<MotionKind, string> = {
	moderated_caucus: 'Moderated caucus',
	unmoderated_caucus: 'Unmoderated caucus',
	extend_caucus: 'Extend the caucus',
	suspend_meeting: 'Suspend the meeting',
	adjourn_meeting: 'Adjourn the meeting',
	close_debate: 'Close debate',
	introduce_document: 'Introduce a document',
	other: 'Other motion'
};

/**
 * The kinds whose topic goes in the subtitle. A document's and another
 * motion's topic is their name, which their title already says.
 */
const KINDS_WITH_TOPIC_IN_SUBTITLE: MotionKind[] = [
	'moderated_caucus',
	'unmoderated_caucus',
	'suspend_meeting'
];

const SECONDS_PER_MINUTE = 60;

/**
 * A time typed the MUN way, in seconds: a bare number is minutes ("10" is
 * 600, "2" is 120), "1:30" is minutes and seconds (90), and "90s" is seconds
 * (90). Spaces around it do not matter. Null for anything else, an empty
 * field included, so the caller can tell "not given" from a time; whether the
 * time is long enough is the caller's to check.
 */
export function readDuration(value: FormDataEntryValue | null): number | null {
	if (typeof value !== 'string') return null;

	const text = value.trim();

	const minutesOnly = /^(\d+)$/.exec(text);
	if (minutesOnly) return Number(minutesOnly[1]) * SECONDS_PER_MINUTE;

	// The seconds take exactly two digits below 60, so "1:5" and "1:75" are refused.
	const minutesAndSeconds = /^(\d+):([0-5]\d)$/.exec(text);
	if (minutesAndSeconds) {
		return Number(minutesAndSeconds[1]) * SECONDS_PER_MINUTE + Number(minutesAndSeconds[2]);
	}

	const secondsOnly = /^(\d+)\s*s$/i.exec(text);
	if (secondsOnly) return Number(secondsOnly[1]);

	return null;
}

/**
 * The fields one kind of motion asks for, with their labels and what an empty
 * time field means (the table under "`propose`" in `motions.md`). A
 * moderated caucus takes 10:00 and the committee's own speaking time, an
 * unmoderated caucus 10:00 and an extension 5:00; a suspension's and another
 * motion's length may be left out.
 */
export function motionKindFields(
	kind: MotionKind,
	committeeSpeakingSeconds: number
): MotionKindFields {
	switch (kind) {
		case 'moderated_caucus':
			return {
				topic: { label: 'Topic', isRequired: true },
				totalTime: { label: 'Total', defaultSeconds: DEFAULT_CAUCUS_SECONDS },
				speakingTime: { label: 'Each', defaultSeconds: committeeSpeakingSeconds }
			};
		case 'unmoderated_caucus':
			return {
				topic: { label: 'Topic', isRequired: false },
				totalTime: { label: 'Length', defaultSeconds: DEFAULT_CAUCUS_SECONDS },
				speakingTime: null
			};
		case 'extend_caucus':
			return {
				topic: null,
				totalTime: { label: 'By', defaultSeconds: DEFAULT_EXTENSION_SECONDS },
				speakingTime: null
			};
		case 'suspend_meeting':
			return {
				topic: { label: 'Reason', isRequired: false },
				totalTime: { label: 'Length', defaultSeconds: null },
				speakingTime: null
			};
		case 'introduce_document':
			return {
				topic: { label: 'Document', isRequired: true },
				totalTime: null,
				speakingTime: null
			};
		case 'other':
			return {
				topic: { label: 'Motion', isRequired: true },
				totalTime: { label: 'Length', defaultSeconds: null },
				speakingTime: null
			};
		case 'adjourn_meeting':
		case 'close_debate':
			// Adjourning and closing debate ask for nothing more.
			return { topic: null, totalTime: null, speakingTime: null };
	}
}

/** The kind's name at the start of the title, with a document's or another motion's own name. */
function titleName(motion: MotionWordsSource): string {
	const ownName = motion.topic ?? '';

	if (motion.kind === 'introduce_document' && ownName !== '') return `Introduce ${ownName}`;
	if (motion.kind === 'other' && ownName !== '') return ownName;

	return MOTION_TITLE_NAMES[motion.kind];
}

/**
 * A motion's title as a chair reads it out: the kind or the motion's own
 * name, then its times. "Moderated caucus · 10:00 / 1:00", "Unmoderated
 * caucus · 15:00", "Extend the caucus · 5:00", "Suspend the meeting",
 * "Introduce Working Paper 1.2", "Recess for the photo · 10:00".
 */
export function motionTitle(motion: MotionWordsSource): string {
	const name = titleName(motion);

	if (motion.totalTimeSeconds === null) return name;

	const total = formatDuration(motion.totalTimeSeconds);

	if (motion.kind !== 'moderated_caucus' || motion.speakingTimeSeconds === null) {
		return `${name} · ${total}`;
	}

	return `${name} · ${total} / ${formatDuration(motion.speakingTimeSeconds)}`;
}

/**
 * The line under a motion's title: its topic or reason when the title has not
 * said it, then who raised it. "Opening humanitarian corridors · Brazil",
 * "for lunch · the chair", or "Kenya" alone.
 */
export function motionSubtitle(motion: MotionWordsSource): string {
	const parts: string[] = [];
	const showsTopic = KINDS_WITH_TOPIC_IN_SUBTITLE.includes(motion.kind);

	if (showsTopic && motion.topic !== null && motion.topic !== '') parts.push(motion.topic);

	parts.push(motion.proposedBy?.name ?? 'the chair');

	return parts.join(' · ');
}
