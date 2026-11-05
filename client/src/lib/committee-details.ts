/**
 * The fields the committee form asks for, and the checks they have to pass.
 *
 * Nothing in here talks to Supabase or to Svelte. The `save` action of both
 * `/manage/[slug]/committees/new` and `/manage/[slug]/committees/[committeeId]`
 * uses these plain functions, so the two routes cannot disagree about what a
 * committee needs. `specs/05-pages/organiser/committee-edit.md` is where the
 * rules and the wording of every message come from.
 */

import type { CommitteeLevel } from '$lib/committees';
import { slugify } from '$lib/slugs';
import { statusLabel } from '$lib/status';

/**
 * Everything the committee form asks for.
 *
 * Every field is text, including the speaking time, because that is what a form
 * sends and what an input shows. A refused form is drawn again from these exact
 * values, so the organiser sees what they typed rather than a tidied version of it.
 */
export type CommitteeFormValues = {
	name: string;
	/** Optional. "UNSC". */
	abbreviation: string;
	/** The last part of the committee's link. May be empty: see `readCommitteeForm`. */
	slug: string;
	/** Optional. */
	description: string;
	/** An `experience_level` value: `beginner`, `intermediate` or `advanced`. */
	level: string;
	/** Optional. "Committee Room 1". */
	room: string;
	/** A whole number of seconds, as it was typed. */
	defaultSpeakingTimeSeconds: string;
	/** One entry per row of `TopicsEditor`, empty rows included. */
	topics: string[];
};

/** A message for each field that needs fixing. A field that is fine has no entry. */
export type CommitteeFormErrors = {
	name?: string;
	abbreviation?: string;
	slug?: string;
	description?: string;
	level?: string;
	room?: string;
	defaultSpeakingTimeSeconds?: string;
	/** One message for the whole topics list, since the rule is about the list rather than a row. */
	topics?: string;
};

/** What `validateCommitteeForm` has to be told that the values themselves do not say. */
export type CommitteeFormContext = {
	/**
	 * True once the conference is published. Only then is a topic required: a
	 * draft is still being written, and an organiser fills a committee in over
	 * several sittings.
	 */
	isConferencePublished: boolean;
	/**
	 * The slugs the conference's other committees already use. The committee
	 * being edited leaves its own slug out, or saving it unchanged would be
	 * refused as a clash with itself.
	 */
	takenSlugs: string[];
};

/** How many characters the name may have. `05-pages/organiser/committee-edit.md`. */
const NAME_MAX_LENGTH = 120;

/** How many characters the short name may have, so a badge stays a badge. */
const ABBREVIATION_MAX_LENGTH = 12;

/** How many characters the description may have: long enough for a few paragraphs. */
const DESCRIPTION_MAX_LENGTH = 4000;

/** How many characters the room may have. It is free text, such as "Committee Room 1". */
const ROOM_MAX_LENGTH = 60;

/**
 * How many characters one topic may have, and how many topics a committee may
 * have. The database refuses anything longer (`committees_topics_bounded`), so
 * the form says so first, in a sentence, rather than failing on save.
 */
const TOPIC_MAX_LENGTH = 200;
const MOST_TOPICS = 50;

/** The shortest and the longest default speaking time a committee may set, in seconds. */
const SPEAKING_TIME_LOWEST_SECONDS = 30;
const SPEAKING_TIME_HIGHEST_SECONDS = 600;

/**
 * The speaking time a new committee starts with. It is the same ninety seconds
 * the `committees` table defaults to, so a committee saved without touching the
 * field looks the same whichever side filled it in.
 */
const DEFAULT_SPEAKING_TIME_SECONDS = 90;

/**
 * Lowercase letters and digits in words joined by single hyphens: what
 * `slugify` in `$lib/slugs` makes, and the shape the `committees` table checks,
 * so a slug this accepts is never one the database refuses.
 */
const SLUG_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The longest link the `committees` table takes (`committees_slug_shape`). The
 * form refuses a longer one with a message, where the database could only
 * throw; `slugify` never makes one over 67, so only a hand-typed link gets near.
 */
export const SLUG_MAX_LENGTH = 100;

/**
 * The link a committee gets when its name has no letter or digit a link can
 * keep, such as one written in Cyrillic or Chinese. The same word the Setup
 * step's `uniqueSlug` and a quick session fall back to.
 */
const FALLBACK_SLUG = 'committee';

/** Digits and nothing else, so `90.5`, `-90` and `1e2` are not whole numbers. */
const WHOLE_NUMBER = /^\d+$/;

/**
 * The three levels a committee can have, in the order the radio buttons show them.
 *
 * `none` is left out on purpose: a committee is never "no experience yet", and
 * the database refuses that value (`specs/02-architecture/data-model.md`). The
 * words come from `$lib/status`, which already has one for every value of every
 * enum, so the radio buttons and the badge on a committee row cannot disagree.
 */
export const COMMITTEE_LEVEL_OPTIONS: { value: CommitteeLevel; label: string }[] = [
	{ value: 'beginner', label: statusLabel('experience_level', 'beginner') },
	{ value: 'intermediate', label: statusLabel('experience_level', 'intermediate') },
	{ value: 'advanced', label: statusLabel('experience_level', 'advanced') }
];

/**
 * The levels `validateCommitteeForm` accepts, taken from the list the form draws
 * its radio buttons from, so a level somebody can pick is always a level this
 * then accepts. It is typed as plain text because the field arrives as text.
 */
const COMMITTEE_LEVELS: string[] = COMMITTEE_LEVEL_OPTIONS.map((option) => option.value);

/**
 * What the form shows for a committee that does not exist yet: one empty topic
 * row to type into, and the speaking time the database would have chosen anyway.
 */
export const EMPTY_COMMITTEE_FORM: CommitteeFormValues = {
	name: '',
	abbreviation: '',
	slug: '',
	description: '',
	level: '',
	room: '',
	defaultSpeakingTimeSeconds: String(DEFAULT_SPEAKING_TIME_SECONDS),
	topics: ['']
};

/** Read one text field from a submitted form, without surrounding spaces. A missing field counts as ''. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/**
 * Every topic row of a submitted form, in the order they appear on the page.
 *
 * `TopicsEditor` names every row `topics[]`, so one form holds several fields
 * with that same name and `getAll` is what returns all of them rather than only
 * the first. Rows are kept exactly as they were typed, empty ones included: a
 * refused form is drawn again from them, and dropping the empty rows here would
 * make rows disappear under the organiser's hands. `cleanTopics` is what the
 * caller runs before saving.
 */
function readTopics(formData: FormData): string[] {
	return formData.getAll('topics[]').map((row) => String(row));
}

/** Read the committee form's fields from a submitted form. */
export function readCommitteeForm(formData: FormData): CommitteeFormValues {
	return {
		name: readText(formData, 'name'),
		abbreviation: readText(formData, 'abbreviation'),
		// The slug is not lowercased here. `SLUG_SHAPE` refuses capitals and says
		// so, which teaches the organiser what a link may contain; quietly
		// rewriting what they typed would not. An empty slug is allowed: the page
		// fills it in with `slugify(name)` before saving.
		slug: readText(formData, 'slug'),
		description: readText(formData, 'description'),
		level: readText(formData, 'level'),
		room: readText(formData, 'room'),
		defaultSpeakingTimeSeconds: readText(formData, 'defaultSpeakingTimeSeconds'),
		topics: readTopics(formData)
	};
}

/**
 * The link a committee gets when the organiser left the field empty: its name
 * made link-safe, the way every slug on the site is made.
 *
 * `slugify` keeps only a-z and 0-9, so a name with none of those ("Совет
 * Безопасности", "安全理事会") would leave an empty link, which the `committees`
 * table refuses (`committees_slug_shape`) where the form has no message to give.
 * Such a name gets `committee` instead; if another committee already has that
 * link, `checkSlug` says so and the organiser types one of their own.
 */
export function committeeSlugFromName(name: string): string {
	const fromName = slugify(name);

	return fromName === '' ? FALLBACK_SLUG : fromName;
}

/**
 * What is wrong with the committee's link, or `null` when there is nothing to say.
 *
 * An empty slug is nothing to say: the page fills it in from the name before it
 * saves, so the organiser is never asked for one they did not have to type.
 */
function checkSlug(slug: string, takenSlugs: string[]): string | null {
	if (slug === '') {
		return null;
	}

	if (!SLUG_SHAPE.test(slug)) {
		return 'Please use only lowercase letters, digits and hyphens.';
	}

	if (slug.length > SLUG_MAX_LENGTH) {
		return `Please keep the link to ${SLUG_MAX_LENGTH} characters or fewer.`;
	}

	if (takenSlugs.includes(slug)) {
		return 'Another committee already uses this link.';
	}

	return null;
}

/** Is this text a whole number of seconds we accept as a speaking time? */
function isUsableSpeakingTime(text: string): boolean {
	if (!WHOLE_NUMBER.test(text)) {
		return false;
	}

	const seconds = Number(text);

	return seconds >= SPEAKING_TIME_LOWEST_SECONDS && seconds <= SPEAKING_TIME_HIGHEST_SECONDS;
}

/**
 * Check the committee form. Every problem is collected instead of stopping at the
 * first one, so the organiser sees all of them at once rather than one per attempt.
 */
export function validateCommitteeForm(
	values: CommitteeFormValues,
	context: CommitteeFormContext
): CommitteeFormErrors {
	const errors: CommitteeFormErrors = {};

	// A name that is too long gets the same message as a name that is missing,
	// because it points the organiser at the same field either way.
	if (values.name === '' || values.name.length > NAME_MAX_LENGTH) {
		errors.name = "Please enter the committee's name.";
	}

	if (values.abbreviation.length > ABBREVIATION_MAX_LENGTH) {
		errors.abbreviation = `Please keep the abbreviation under ${ABBREVIATION_MAX_LENGTH} characters.`;
	}

	const slugMessage = checkSlug(values.slug, context.takenSlugs);

	if (slugMessage !== null) {
		errors.slug = slugMessage;
	}

	if (values.description.length > DESCRIPTION_MAX_LENGTH) {
		errors.description = `Please keep the description under ${DESCRIPTION_MAX_LENGTH} characters.`;
	}

	if (!COMMITTEE_LEVELS.includes(values.level)) {
		errors.level = 'Please pick a level.';
	}

	if (values.room.length > ROOM_MAX_LENGTH) {
		errors.room = `Please keep the room under ${ROOM_MAX_LENGTH} characters.`;
	}

	if (!isUsableSpeakingTime(values.defaultSpeakingTimeSeconds)) {
		errors.defaultSpeakingTimeSeconds = `Please enter a speaking time between ${SPEAKING_TIME_LOWEST_SECONDS} and ${SPEAKING_TIME_HIGHEST_SECONDS} seconds.`;
	}

	// Topics are only required once the conference is published, because a draft
	// committee is still being written. Empty rows never count towards the one.
	const hasTopic = cleanTopics(values.topics).length > 0;

	if (context.isConferencePublished && !hasTopic) {
		errors.topics = 'Please add at least one topic.';
	}

	const topics = cleanTopics(values.topics);

	if (topics.some((topic) => topic.length > TOPIC_MAX_LENGTH)) {
		errors.topics = `Please keep each topic under ${TOPIC_MAX_LENGTH} characters.`;
	} else if (topics.length > MOST_TOPICS) {
		errors.topics = `Please keep to ${MOST_TOPICS} topics or fewer.`;
	}

	return errors;
}

/** Did `validateCommitteeForm` find any problem at all? */
export function hasCommitteeErrors(errors: CommitteeFormErrors): boolean {
	return Object.keys(errors).length > 0;
}

/**
 * The topic rows with one more empty row on the end, which is what the "Add
 * topic" button asks for.
 *
 * It answers a new list rather than changing the one it was given, so the caller
 * decides what to do with the answer and nothing changes behind its back.
 */
export function withExtraTopic(topics: string[]): string[] {
	return [...topics, ''];
}

/**
 * The topic rows without the one at `index`, which is what a row's "Remove"
 * button asks for. An index that is not a row leaves the list as it was.
 *
 * Removing the only row leaves an empty list rather than refusing: the organiser
 * can add a row back, and a published conference is told it needs a topic when
 * it tries to save. Like `withExtraTopic`, it answers a new list.
 */
export function withoutTopicAt(topics: string[], index: number): string[] {
	return topics.filter((topic, topicIndex) => topicIndex !== index);
}

/**
 * The topics worth saving: each one without its surrounding spaces, and the
 * empty rows left out. The form keeps empty rows so it can draw itself again;
 * the database gets only the topics somebody really typed.
 */
export function cleanTopics(topics: string[]): string[] {
	const trimmed = topics.map((topic) => topic.trim());

	return trimmed.filter((topic) => topic !== '');
}
