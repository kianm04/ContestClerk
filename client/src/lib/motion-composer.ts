/**
 * The fields of "Record a motion", the composer across the foot of the
 * Motions view (`specs/05-pages/chair/motions.md`, "Components" and the table
 * under "`propose`"): which fields a kind shows, in what order, with what
 * label and placeholder, and the three shared fields a page without
 * JavaScript shows for every kind. Plain functions, so the composer's
 * components hold no rules of their own.
 *
 * What each kind asks for and its defaults are `motionKindFields` in
 * `$lib/motion-input.ts`; this file only lays them out as the session study
 * draws them (`study/js/render-motions.js`, `kindFields`).
 */

import { formatDuration, type MotionKind } from '$lib/committee-room';
import { motionKindFields, type TimeField, type TopicField } from '$lib/motion-input';
import { OTHER_DOCUMENT } from '$lib/motions';
import type { FloorPaper } from '$lib/papers-on-floor';

/** The composer's three fields beyond the kind and "Raised by", by the name the form sends. */
export type ComposerFieldName = 'topic' | 'totalTime' | 'speakingTime';

/** One field as the composer draws it. */
export type ComposerField = {
	name: ComposerFieldName;
	/** The input's `id`, which its label points at. */
	id: string;
	/** The words above it: "Topic", "Total", "Each". */
	label: string;
	/** What it shows while empty: a time field's default ("10:00"), or "optional". */
	placeholder: string;
	/** `text` grows to fill the row; `time` is a narrow box for "10:00". */
	size: 'text' | 'time';
	/** A line under it naming the kinds that use it, shown only without JavaScript. */
	help: string | null;
};

/** The ids of the three fields, so "Raised by" knows where the cursor goes next. */
export const COMPOSER_FIELD_IDS: Record<ComposerFieldName, string> = {
	topic: 'motion-topic',
	totalTime: 'motion-total',
	speakingTime: 'motion-each'
};

/** The id of "Paper", the approved papers a motion to introduce a document picks from. */
export const PAPER_FIELD_ID = 'motion-paper';

/** One line of "Paper": a paper's id, or `OTHER_DOCUMENT`. */
export type DocumentChoice = { value: string; label: string; detail?: string };

/** The line under "Paper" without JavaScript, when every field is drawn whatever the kind. */
export const PAPER_FIELD_HELP = 'Document only. For Other, type its name in the topic.';

/** What an empty text field says, by kind, as the study writes it. */
const TOPIC_PLACEHOLDERS: Partial<Record<MotionKind, string>> = {
	unmoderated_caucus: 'optional',
	suspend_meeting: 'optional, “for lunch”',
	introduce_document: 'Working Paper 1.2'
};

/** The kinds whose time field comes before their topic, as "Length" does for an unmoderated caucus. */
const TIME_FIRST_KINDS: MotionKind[] = ['unmoderated_caucus'];

/** A time field's placeholder: its default, or "optional" for a time the motion may go without. */
function timePlaceholder(field: TimeField): string {
	return field.defaultSeconds === null ? 'optional' : formatDuration(field.defaultSeconds);
}

function topicField(kind: MotionKind, field: TopicField): ComposerField {
	const placeholder = TOPIC_PLACEHOLDERS[kind] ?? '';

	return {
		name: 'topic',
		id: COMPOSER_FIELD_IDS.topic,
		label: field.label,
		placeholder,
		size: 'text',
		help: null
	};
}

function timeField(name: 'totalTime' | 'speakingTime', field: TimeField): ComposerField {
	return {
		name,
		id: COMPOSER_FIELD_IDS[name],
		label: field.label,
		placeholder: timePlaceholder(field),
		size: 'time',
		help: null
	};
}

/**
 * Whether a motion to introduce a document picks its paper from "Paper": the
 * committee has approved papers waiting. Its name is then typed only for "Other".
 */
export function isPaperPicked(kind: MotionKind, papers: FloorPaper[]): boolean {
	return kind === 'introduce_document' && papers.length > 0;
}

/**
 * The fields a kind shows after "Raised by", in the study's order: a
 * moderated caucus its topic, total and speaking time; an unmoderated caucus
 * its length, then its topic; an extension its length; a suspension its
 * reason and length; a document its name; another motion its name and
 * length; adjourning and closing debate nothing. `isTopicShown` is false for
 * a document picked from "Paper", whose name is the paper's.
 */
export function composerFields(
	kind: MotionKind,
	defaultSpeakingSeconds: number,
	isTopicShown: boolean = true
): ComposerField[] {
	const fields = motionKindFields(kind, defaultSpeakingSeconds);
	const topic = fields.topic && isTopicShown ? [topicField(kind, fields.topic)] : [];
	const total = fields.totalTime ? [timeField('totalTime', fields.totalTime)] : [];
	const speaking = fields.speakingTime ? [timeField('speakingTime', fields.speakingTime)] : [];

	if (TIME_FIRST_KINDS.includes(kind)) return [...total, ...topic, ...speaking];

	return [...topic, ...total, ...speaking];
}

/**
 * The three shared fields a page without JavaScript shows whatever the kind,
 * since nothing can hide the ones a kind does not ask for. Each says which
 * kinds use it; the action ignores a field the chosen kind does not ask for.
 */
export function allComposerFields(defaultSpeakingSeconds: number): ComposerField[] {
	const each = formatDuration(defaultSpeakingSeconds);

	return [
		{
			name: 'topic',
			id: COMPOSER_FIELD_IDS.topic,
			label: 'Topic, reason or name',
			placeholder: '',
			size: 'text',
			help: 'Mod and Unmod: the topic. Suspend: the reason. Document and Other: its name.'
		},
		{
			name: 'totalTime',
			id: COMPOSER_FIELD_IDS.totalTime,
			label: 'Total or length',
			placeholder: '10:00',
			size: 'time',
			help: 'Mod and Unmod: 10:00 when empty. Extend: 5:00. Suspend and Other: optional.'
		},
		{
			name: 'speakingTime',
			id: COMPOSER_FIELD_IDS.speakingTime,
			label: 'Each speaker (Mod only)',
			placeholder: each,
			size: 'time',
			help: `Mod only: ${each} when empty.`
		}
	];
}

/**
 * The field the cursor moves to once "Raised by" is chosen, or null when the
 * kind asks for nothing more: "Paper" for a document while papers wait.
 */
export function fieldAfterRaisedBy(
	kind: MotionKind,
	defaultSpeakingSeconds: number,
	papers: FloorPaper[] = []
): string | null {
	if (isPaperPicked(kind, papers)) return PAPER_FIELD_ID;

	return composerFields(kind, defaultSpeakingSeconds)[0]?.id ?? null;
}

/**
 * The lines of "Paper": each approved paper by what a chair calls it, its
 * title beside it, then "Other" for a document with no paper in MUNMeet.
 */
export function documentChoices(papers: FloorPaper[]): DocumentChoice[] {
	const paperChoices = papers.map((paper) => ({
		value: paper.id,
		label: paper.name,
		detail: paper.title
	}));

	return [...paperChoices, { value: OTHER_DOCUMENT, label: 'Other' }];
}
