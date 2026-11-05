/**
 * The custom questions an organiser adds to a conference's application form:
 * their types, their choices, and the checks the question form runs before
 * saving one.
 *
 * Nothing in here talks to Supabase or to Svelte.
 * `$lib/server/application-questions.ts` reads and writes the rows; the rules
 * live here so that they can be read and tested without a database. The rules
 * come from `specs/05-pages/organiser/application-form.md` and the wording of
 * every message from it and from `specs/03-design/writing-style.md`.
 *
 * The window, who may apply and the rest of the form's settings are in
 * `$lib/application-form-settings.ts`.
 */

import type { Database } from '$lib/database.types';
import { statusLabel } from '$lib/status';

/** One of the five kinds of question, straight from the database enum. */
export type QuestionType = Database['public']['Enums']['question_type'];

/** One custom question, in the shape the pages show it. */
export type ApplicationQuestion = {
	id: string;
	label: string;
	helpText: string | null;
	type: QuestionType;
	/** The choices, for `single_choice` and `multiple_choice`. Empty for every other type. */
	options: string[];
	isRequired: boolean;
	/** Lowest first. It is the order the applicant is asked them in. */
	position: number;
};

/**
 * Everything the question form asks for.
 *
 * Every field is text or a boolean, because that is what a form sends and what
 * an input shows. A refused form is drawn again from these exact values, so the
 * organiser sees what they typed rather than a tidied version of it.
 */
export type QuestionFormValues = {
	/** The question being edited, or `''` when the form is adding a new one. */
	questionId: string;
	label: string;
	helpText: string;
	/** A `question_type` value. */
	type: string;
	/** The options as the textarea holds them: one per line. */
	options: string;
	isRequired: boolean;
};

/** A message for each field that needs fixing. A field that is fine has no entry. */
export type QuestionFormErrors = {
	label?: string;
	helpText?: string;
	type?: string;
	options?: string;
};

/**
 * How many custom questions one conference may have.
 *
 * An application form that asks more than this stops being a form somebody
 * fills in. `05-pages/organiser/application-form.md` sets the number.
 */
export const MAX_QUESTIONS = 20;

/** How many characters a question itself may have. */
export const QUESTION_LABEL_MAX_LENGTH = 200;

/** How many characters the smaller line under a question may have. */
export const QUESTION_HELP_TEXT_MAX_LENGTH = 300;

/** How many choices a "Pick one" or "Pick several" question needs to be worth asking. */
export const MIN_CHOICE_OPTIONS = 2;

/**
 * The most choices a "Pick one" or "Pick several" question may offer.
 *
 * It is also the most an applicant may tick, because the
 * `applications_answers_shape` check on the database holds a list answer to
 * this many entries. A question with more options than that could not be
 * answered by ticking all of them.
 */
export const MAX_CHOICE_OPTIONS = 20;

/**
 * The five kinds of question, in the order the database enum lists them.
 *
 * The words come from `$lib/status`, which already has one for every value of
 * every database enum, so the dropdown here and the row above it cannot
 * disagree about what `single_choice` is called.
 */
export const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
	{ value: 'short_text', label: statusLabel('question_type', 'short_text') },
	{ value: 'long_text', label: statusLabel('question_type', 'long_text') },
	{ value: 'single_choice', label: statusLabel('question_type', 'single_choice') },
	{ value: 'multiple_choice', label: statusLabel('question_type', 'multiple_choice') },
	{ value: 'checkbox', label: statusLabel('question_type', 'checkbox') }
];

/**
 * What the form shows for a question that does not exist yet.
 *
 * The type starts on the first of the five, and `isRequired` starts on, because
 * that is what the `application_questions` table defaults it to: a question
 * saved without touching the box looks the same whichever side filled it in.
 */
export const EMPTY_QUESTION_FORM: QuestionFormValues = {
	questionId: '',
	label: '',
	helpText: '',
	type: 'short_text',
	options: '',
	isRequired: true
};

/** Is this one of the five `question_type` values? Anyone can put anything in a form, so forms ask. */
export function isQuestionType(text: string): text is QuestionType {
	return QUESTION_TYPE_OPTIONS.some((option) => option.value === text);
}

/**
 * Does this kind of question have choices to pick from?
 *
 * This is the one rule that decides whether the options box means anything, so
 * it is written here once and everything else asks it rather than listing the
 * two types again.
 */
export function isChoiceType(type: QuestionType): boolean {
	return type === 'single_choice' || type === 'multiple_choice';
}

/**
 * The choices as the organiser typed them into the textarea: one per line.
 *
 * Blank lines are dropped, so a trailing newline does not become an empty
 * choice, and each line loses the spaces around it. A textarea sends its line
 * endings as `\r\n`, and trimming takes the `\r` off with the spaces.
 *
 * The same option twice is kept rather than dropped; refusing a list that says
 * the same thing twice is `validateQuestionForm`'s job, and it can only do it
 * if the duplicate is still here to see.
 */
export function parseOptions(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '');
}

/**
 * The choices put back into the textarea, one per line.
 *
 * The other half of the pair `parseOptions` starts, the way
 * `localDateTimeInTimezone` and `instantFromLocalDateTime` in `$lib/dates.ts`
 * sit either side of a `datetime-local` box.
 */
export function formatOptions(options: string[]): string {
	return options.join('\n');
}

/**
 * The words for one kind of question, such as "Pick one".
 *
 * A question's `type` always matches one of the five options, so the fallback
 * is only there because TypeScript cannot see that.
 */
export function questionTypeLabel(type: QuestionType): string {
	const option = QUESTION_TYPE_OPTIONS.find((candidate) => candidate.value === type);

	return option?.label ?? type;
}

/**
 * The quiet line under a question in the organiser's list, such as
 * "Short answer · Required" or "Pick one (S, M, L) · Optional".
 *
 * It lives here rather than in the row that draws it, because `CLAUDE.md` keeps
 * formatting out of a component's script block. "Optional" is written out
 * rather than left blank, so that a row never looks half finished.
 */
export function questionSummaryLine(question: ApplicationQuestion): string {
	// Only the two choice types have choices worth listing, and a choice type
	// with none yet has nothing to put in the brackets.
	const hasOptionsToList = isChoiceType(question.type) && question.options.length > 0;
	const optionsPart = hasOptionsToList ? ` (${question.options.join(', ')})` : '';
	const requiredWord = question.isRequired ? 'Required' : 'Optional';

	return `${questionTypeLabel(question.type)}${optionsPart} · ${requiredWord}`;
}

/** Read one text field from a submitted form, without surrounding spaces. A missing field counts as ''. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/**
 * Read the question form's fields from a submitted form.
 *
 * `questionId` is the hidden field that says which question is being edited. It
 * is empty on the "Add question" form, which is how the page tells the two
 * apart.
 */
export function readQuestionForm(formData: FormData): QuestionFormValues {
	return {
		questionId: readText(formData, 'questionId'),
		label: readText(formData, 'label'),
		helpText: readText(formData, 'helpText'),
		type: readText(formData, 'type'),
		options: readText(formData, 'options'),
		// A browser sends the word `on` for a ticked box and sends nothing at all
		// for an unticked one, so the question is whether the field arrived
		// rather than what is in it.
		isRequired: formData.get('isRequired') !== null
	};
}

/**
 * How many different choices the options box holds.
 *
 * A `Set` keeps one of each, so a list that says "Small" twice counts as one
 * choice, which is not something to make an applicant pick between.
 */
function countDistinctOptions(text: string): number {
	return new Set(parseOptions(text)).size;
}

/**
 * Check the question form. Every problem is collected instead of stopping at
 * the first one, so the organiser sees all of them at once rather than one per
 * attempt.
 */
export function validateQuestionForm(values: QuestionFormValues): QuestionFormErrors {
	const errors: QuestionFormErrors = {};

	if (values.label === '') {
		errors.label = 'Please enter the question.';
	} else if (values.label.length > QUESTION_LABEL_MAX_LENGTH) {
		errors.label = `Please keep the question under ${QUESTION_LABEL_MAX_LENGTH} characters.`;
	}

	// The help text is optional, so its length is the only thing to ask about.
	if (values.helpText.length > QUESTION_HELP_TEXT_MAX_LENGTH) {
		errors.helpText = `Please keep the help text under ${QUESTION_HELP_TEXT_MAX_LENGTH} characters.`;
	}

	// Only a hand-made request can get here with anything else in it, since the
	// dropdown offers these five values and nothing besides. Nothing more can be
	// asked once the type is unknown, so the checking stops with what it has.
	if (!isQuestionType(values.type)) {
		errors.type = 'Please pick a question type.';

		return errors;
	}

	// Asked only once the type is known, because the type is what decides
	// whether the options box means anything at all. For the three types that
	// have no choices it is ignored entirely and never earns a message.
	if (isChoiceType(values.type) && countDistinctOptions(values.options) < MIN_CHOICE_OPTIONS) {
		errors.options = 'Please give at least two options, one per line.';
	} else if (
		isChoiceType(values.type) &&
		parseOptions(values.options).length > MAX_CHOICE_OPTIONS
	) {
		// Every line counts here, a repeated one too, because every line becomes
		// a tick box the applicant can tick.
		errors.options = `Please give at most ${MAX_CHOICE_OPTIONS} options.`;
	}

	return errors;
}

/** Did `validateQuestionForm` find any problem at all? */
export function hasQuestionErrors(errors: QuestionFormErrors): boolean {
	return Object.keys(errors).length > 0;
}

/**
 * Would saving these values over `saved` make nonsense of answers people have
 * already given?
 *
 * Two changes would. Changing the type leaves every answer in a shape the
 * question no longer has, and removing a choice leaves whoever picked it with
 * an answer that is no longer on the list. Adding a choice or rewording the
 * question is always safe.
 *
 * Whether anybody has applied yet is the caller's to know; this only answers
 * whether the change is one of the two dangerous kinds.
 */
export function breaksExistingAnswers(
	saved: ApplicationQuestion,
	values: QuestionFormValues
): boolean {
	if (values.type !== saved.type) {
		return true;
	}

	const newOptions = parseOptions(values.options);

	return saved.options.some((savedOption) => !newOptions.includes(savedOption));
}

/** Put a saved question back into the form, for the "Edit" link to open it with. */
export function toQuestionFormValues(question: ApplicationQuestion): QuestionFormValues {
	return {
		questionId: question.id,
		label: question.label,
		// The column allows null for "no help text", and a textarea holds text,
		// so the one becomes the other on the way in.
		helpText: question.helpText ?? '',
		type: question.type,
		options: formatOptions(question.options),
		isRequired: question.isRequired
	};
}

/**
 * The `id` of the hidden form that saves a drag in the list of custom
 * questions. Every drag handle of the list names it in its `form` attribute.
 */
export const QUESTION_DROP_FORM_ID = 'question-drop-form';

/** The `id` of the sentence that tells a screen reader how to drag a question with the keys. */
export const QUESTION_DROP_HINT_ID = 'question-drop-hint';
