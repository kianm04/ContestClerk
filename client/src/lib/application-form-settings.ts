/**
 * The organiser's application settings: when people may apply, who may apply,
 * what the form asks them, and the one notice at the top of the page that says
 * which state the window is in.
 *
 * Nothing in here talks to Supabase or to Svelte.
 * `$lib/server/application-form-settings.ts` reads and writes the columns; the
 * rules live here so that they can be read
 * and tested without a database. The rules come from
 * `specs/05-pages/organiser/application-form.md` and the wording of every
 * message from it and from `specs/03-design/writing-style.md`.
 *
 * The questions the organiser adds to the form have their own file,
 * `$lib/application-questions.ts`.
 */

import type { Conference } from '$lib/conferences';
import {
	dayInTimezone,
	formatDateRange,
	formatEventTime,
	instantFromLocalDateTime
} from '$lib/dates';

/**
 * The two answers to "Applications open": as soon as the conference is
 * published, or on a date the organiser types in.
 */
export type OpeningChoice = 'publish' | 'date';

/**
 * What the "When people can apply" and "Who can apply" sections ask for. Every
 * field is text or a boolean, as a form sends them.
 *
 * A refused form is drawn again from these exact values, so the organiser sees
 * what they typed rather than a tidied version of it.
 */
export type ApplicationWindowValues = {
	/** Which of the two "Applications open" answers is chosen. */
	opensWhen: OpeningChoice;
	/**
	 * `YYYY-MM-DDTHH:mm` from an `<input type="datetime-local">`, or `''`. Only
	 * read when `opensWhen` is `'date'`.
	 */
	applicationsOpenAt: string;
	/** The same shape, or `''` for a window that stays open. */
	applicationsCloseAt: string;
	acceptsIndividualApplications: boolean;
	acceptsDelegations: boolean;
};

/** A message for each field that needs fixing. A field that is fine has no entry. */
export type ApplicationWindowErrors = {
	applicationsOpenAt?: string;
	applicationsCloseAt?: string;
	/** The "at least one of the two" message. It belongs to the pair, not to either box. */
	whoCanApply?: string;
};

/** What the "What the form asks" form asks for. Text and booleans, for the same reason. */
export type FormSettingsValues = {
	/** "0" to "3", as the radio group sends it. */
	committeePreferenceCount: string;
	askMotivation: boolean;
	positionPaperRequired: boolean;
	/** `YYYY-MM-DDTHH:mm`, or `''`. */
	positionPaperDeadline: string;
};

/** A message for each field that needs fixing. A field that is fine has no entry. */
export type FormSettingsErrors = {
	committeePreferenceCount?: string;
	positionPaperDeadline?: string;
};

/** The one notice at the top of the page: which of four states the window is in. */
export type ApplicationWindowNotice = {
	tone: 'success' | 'info' | 'warning';
	/** The bold first line, such as "Applications are open now". */
	title: string;
	/** The window written out, or `''` when a bound is missing and there is nothing to write. */
	text: string;
};

/**
 * The most committee preferences the form may ask an applicant for.
 *
 * The database has the same limit as a check constraint
 * (`committee_preference_count between 0 and 3`), so raising it here alone
 * would only move the refusal from this page to Postgres.
 */
export const MAX_COMMITTEE_PREFERENCES = 3;

/**
 * The four answers to "how many committee preferences should the form ask
 * for?", in the order the dropdown lists them.
 *
 * The values are text rather than numbers because a `SelectField` sends what a
 * form sends, which is always text.
 */
export const COMMITTEE_PREFERENCE_OPTIONS: { value: string; label: string }[] = [
	{ value: '0', label: 'None' },
	{ value: '1', label: '1 preference' },
	{ value: '2', label: '2 preferences' },
	{ value: '3', label: '3 preferences' }
];

/** The two answers to "Applications open", in the order the radio buttons show them. */
export const OPENING_CHOICE_OPTIONS: { value: OpeningChoice; label: string }[] = [
	{ value: 'publish', label: 'As soon as I publish' },
	{ value: 'date', label: 'On a date I choose' }
];

/** Read one text field from a submitted form, without surrounding spaces. A missing field counts as ''. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/**
 * Whether a tick box was ticked.
 *
 * A browser sends the word `on` for a ticked box and sends nothing at all for
 * an unticked one, so the question is whether the field arrived rather than
 * what is in it.
 */
function readCheckbox(formData: FormData, fieldName: string): boolean {
	return formData.get(fieldName) !== null;
}

/**
 * Which "Applications open" answer was sent. Anything but `date`, a missing
 * field included, counts as "As soon as I publish", because the page always
 * has one of the two chosen and only a request made by hand can send neither.
 */
function readOpeningChoice(formData: FormData): OpeningChoice {
	return formData.get('opensWhen') === 'date' ? 'date' : 'publish';
}

/** Read the window's five fields from a submitted form. */
export function readApplicationWindowForm(formData: FormData): ApplicationWindowValues {
	return {
		opensWhen: readOpeningChoice(formData),
		applicationsOpenAt: readText(formData, 'applicationsOpenAt'),
		applicationsCloseAt: readText(formData, 'applicationsCloseAt'),
		acceptsIndividualApplications: readCheckbox(formData, 'acceptsIndividualApplications'),
		acceptsDelegations: readCheckbox(formData, 'acceptsDelegations')
	};
}

/**
 * The opening time "As soon as I publish" stands for, as an exact moment.
 *
 * While the saved opening is already in the past it is kept, so saving the
 * page again changes nothing. Otherwise it is `now`: a draft cannot be applied
 * to before it is published, so an opening that has already passed is what
 * "open the moment it goes public" means. `/create` stores the same thing
 * (`startingApplicationWindow` in `$lib/conferences.ts`).
 *
 * It is never `null`, because `hasApplicationWindow` in
 * `$lib/publish-checklist.ts` reads a missing opening as no window at all, and
 * the step would never be done.
 */
export function openingOnPublish(savedOpensAt: string | null, now: Date): string {
	if (savedOpensAt !== null && new Date(savedOpensAt).getTime() <= now.getTime()) {
		return savedOpensAt;
	}

	return now.toISOString();
}

/**
 * The exact opening moment to store for what the form says, or `null` when
 * "On a date I choose" came with an empty box, which
 * `validateApplicationWindowForm` refuses before anything is stored.
 *
 * The box holds a time in the conference's own timezone, so that is the zone
 * it is read back in.
 */
export function openingToStore(
	values: ApplicationWindowValues,
	context: { savedOpensAt: string | null; timezone: string; now: Date }
): string | null {
	if (values.opensWhen === 'publish') {
		return openingOnPublish(context.savedOpensAt, context.now);
	}

	return instantFromLocalDateTime(values.applicationsOpenAt, context.timezone);
}

/**
 * Which "Applications open" answer the page starts with: "On a date I choose"
 * while the saved opening is still ahead, and "As soon as I publish" when it
 * has passed or was never set, since that is what such an opening means.
 */
export function openingChoiceFor(savedOpensAt: string | null, now: Date): OpeningChoice {
	if (savedOpensAt !== null && new Date(savedOpensAt).getTime() > now.getTime()) {
		return 'date';
	}

	return 'publish';
}

/**
 * Check the window. Every problem is collected instead of stopping at the
 * first one, so the organiser sees all of them at once rather than one per
 * attempt.
 *
 * The closing time is optional: a conference with no closing time stays open.
 * A box that holds neither `''` nor a `YYYY-MM-DDTHH:mm` cannot come from the
 * browser's own `datetime-local` box, so there is no message for the shape
 * itself.
 *
 * `context.startDate` is the conference's first day as `YYYY-MM-DD`, and
 * `context.openingOnPublishLocal` is `openingOnPublish` as a `datetime-local`
 * box would hold it. The values themselves cannot say either.
 */
export function validateApplicationWindowForm(
	values: ApplicationWindowValues,
	context: { startDate: string; openingOnPublishLocal: string }
): ApplicationWindowErrors {
	const errors: ApplicationWindowErrors = {};

	if (values.opensWhen === 'date' && values.applicationsOpenAt === '') {
		errors.applicationsOpenAt = 'Please choose when applications open.';
	}

	if (values.applicationsCloseAt !== '') {
		// The first ten characters of a `YYYY-MM-DDTHH:mm` are the `YYYY-MM-DD`
		// day it falls on, read in the conference's own timezone, and that is the
		// zone `startDate` is written in too. So comparing the two as text
		// compares them as dates, with nothing to parse. `validateFeeForm`
		// compares a fee's window the same way.
		const closingDay = values.applicationsCloseAt.slice(0, 10);

		// Not before, rather than after: a window that closes on the morning of
		// the first day would still have people applying while the conference is
		// under way. This is the rule `hasApplicationWindow` in
		// `$lib/publish-checklist.ts` uses for the dashboard, so a window this
		// form calls valid is a window the checklist ticks.
		if (closingDay >= context.startDate) {
			errors.applicationsCloseAt = 'Applications must close before the conference starts.';
		}
	}

	const openingLocal =
		values.opensWhen === 'date' ? values.applicationsOpenAt : context.openingOnPublishLocal;
	const hasBothTimes = openingLocal !== '' && values.applicationsCloseAt !== '';

	// Both hold a `YYYY-MM-DDTHH:mm` in the same zone, and written that way they
	// sort in the order the moments happen, so this too is a text comparison.
	// Equal counts as not after: a window of no length lets nobody apply.
	//
	// Checked after the rule above on purpose. Only one message fits in the box,
	// and when both rules fail this is the one to show, because it is about the
	// pair of times the organiser has just chosen rather than about a date set on
	// another page.
	if (hasBothTimes && values.applicationsCloseAt <= openingLocal) {
		errors.applicationsCloseAt = 'Closing must be after opening.';
	}

	// A conference that accepts neither kind of applicant accepts nobody, which
	// is never what the organiser meant. The message sits on the pair rather
	// than on either box, because either one of them fixes it.
	if (!values.acceptsIndividualApplications && !values.acceptsDelegations) {
		errors.whoCanApply = 'Accept individuals, delegations, or both.';
	}

	return errors;
}

/** Did `validateApplicationWindowForm` find any problem at all? */
export function hasApplicationWindowErrors(errors: ApplicationWindowErrors): boolean {
	return Object.keys(errors).length > 0;
}

/** Read the form settings' four fields from a submitted form. */
export function readFormSettingsForm(formData: FormData): FormSettingsValues {
	return {
		committeePreferenceCount: readText(formData, 'committeePreferenceCount'),
		askMotivation: readCheckbox(formData, 'askMotivation'),
		positionPaperRequired: readCheckbox(formData, 'positionPaperRequired'),
		positionPaperDeadline: readText(formData, 'positionPaperDeadline')
	};
}

/**
 * How many committee preferences the radio group chose, or `null` when the text
 * is not one of the whole numbers from 0 to `MAX_COMMITTEE_PREFERENCES`.
 *
 * The empty box is turned away first, because `Number('')` is 0 rather than
 * nothing and an unanswered question is not an answer of "None".
 */
function readPreferenceCount(text: string): number | null {
	if (text === '') {
		return null;
	}

	const count = Number(text);

	if (!Number.isInteger(count) || count < 0 || count > MAX_COMMITTEE_PREFERENCES) {
		return null;
	}

	return count;
}

/**
 * What is wrong with the position paper deadline, or `undefined` when nothing
 * is.
 *
 * Three separate rules land on this one box and only one message fits in it, so
 * they are asked in order and the first one that answers is the one shown.
 */
function positionPaperDeadlineError(
	values: FormSettingsValues,
	context: { applicationsOpenAtLocal: string; endDate: string }
): string | undefined {
	if (values.positionPaperDeadline === '') {
		// The box stays on the page and keeps whatever was typed even when papers
		// are not required, the way the payment instructions on the fees page do
		// when payments are collected by card. So an empty box is only a problem
		// when the conference really asks for a paper.
		if (values.positionPaperRequired) {
			return 'Please set a deadline for position papers.';
		}

		return undefined;
	}

	// The same first-ten-characters comparison as the window form's, against the
	// conference's last day this time.
	const deadlineDay = values.positionPaperDeadline.slice(0, 10);

	if (deadlineDay > context.endDate) {
		return 'The deadline must be before the conference ends.';
	}

	// Both are a `YYYY-MM-DDTHH:mm` in the conference's own zone, so they are
	// compared as text as well. A paper due before anybody can even apply is a
	// deadline nobody could meet.
	if (
		context.applicationsOpenAtLocal !== '' &&
		values.positionPaperDeadline <= context.applicationsOpenAtLocal
	) {
		return 'The deadline must be after applications open.';
	}

	return undefined;
}

/**
 * Check the form settings. Every problem is collected instead of stopping at
 * the first one.
 *
 * The context is the four things the values themselves cannot say: when
 * applications open, when the conference ends, how many preferences are asked
 * for at the moment, and whether anybody has applied yet.
 */
export function validateFormSettingsForm(
	values: FormSettingsValues,
	context: {
		/**
		 * The opening time being saved with these settings, as a `datetime-local`
		 * box holds it, or `''` when there is none.
		 */
		applicationsOpenAtLocal: string;
		/** The conference's last day, `YYYY-MM-DD`. */
		endDate: string;
		/** What `committee_preference_count` is in the database right now. */
		savedPreferenceCount: number;
		/** Whether the conference has any application that is not a draft. */
		hasApplications: boolean;
	}
): FormSettingsErrors {
	const errors: FormSettingsErrors = {};

	const preferenceCount = readPreferenceCount(values.committeePreferenceCount);

	if (preferenceCount === null) {
		// Only a hand-made request can get here with anything else in it, since
		// the dropdown offers these four numbers and nothing besides.
		errors.committeePreferenceCount = 'Please choose how many committee preferences to ask for.';
	} else if (context.hasApplications && preferenceCount < context.savedPreferenceCount) {
		// People who have already applied answered the question as it was asked
		// then, and dropping a preference would throw away a choice they made.
		// Asking for more is always allowed: the extra answer is simply blank.
		errors.committeePreferenceCount = 'You cannot ask for fewer preferences after people applied.';
	}

	const deadlineError = positionPaperDeadlineError(values, context);

	if (deadlineError !== undefined) {
		errors.positionPaperDeadline = deadlineError;
	}

	return errors;
}

/** Did `validateFormSettingsForm` find any problem at all? */
export function hasFormSettingsErrors(errors: FormSettingsErrors): boolean {
	return Object.keys(errors).length > 0;
}

/**
 * An exact moment written as the day it falls on where the conference is, such
 * as "3 Nov 2026".
 *
 * Which day a moment belongs to depends on where you read it, and it is the
 * conference's own day that matters. Handing `formatDateRange` the same day
 * twice writes it as a single date. `applicationWindowBadge` in
 * `$lib/conferences.ts` does these same two steps for the badge on a card.
 */
function formatConferenceDay(isoMoment: string, timezone: string): string {
	const day = dayInTimezone(new Date(isoMoment), timezone);

	return formatDateRange(day, day);
}

/**
 * The window written out in full, such as
 * "1 Oct 2026 09:00 – 15 Dec 2026 23:59 (Europe/Amsterdam)", or `''` when one
 * of the two bounds is missing and there is no window to write.
 *
 * The timezone is named once at the end, because
 * `specs/03-design/writing-style.md` asks for the zone to be shown once per
 * page and this notice is the only place the page prints both times.
 */
function applicationWindowSentence(conference: Conference): string {
	if (conference.applicationsOpenAt === null || conference.applicationsCloseAt === null) {
		return '';
	}

	const openingDate = formatConferenceDay(conference.applicationsOpenAt, conference.timezone);
	const openingTime = formatEventTime(conference.applicationsOpenAt, null, conference.timezone);
	const closingDate = formatConferenceDay(conference.applicationsCloseAt, conference.timezone);
	const closingTime = formatEventTime(conference.applicationsCloseAt, null, conference.timezone);

	// The dash is an en dash (–) with a space each side, as the style guide asks.
	return `${openingDate} ${openingTime} – ${closingDate} ${closingTime} (${conference.timezone})`;
}

/**
 * The one notice at the top of the application form page: which of four states
 * the window is in, and the window itself written out underneath.
 *
 * Unlike `isAcceptingApplications` in `$lib/conferences.ts`, this deliberately
 * does not look at `conference.status`. That function answers "can somebody
 * apply right now?", and a draft is not public so nobody can. This one answers
 * "what have you set the window to?", which is a question about the settings
 * themselves, and an organiser preparing a draft needs the same answer as one
 * whose conference is already published.
 *
 * `now` is a parameter rather than read from the clock, because a pure function
 * may not read the clock.
 */
export function applicationWindowNotice(
	conference: Conference,
	now: Date
): ApplicationWindowNotice {
	if (conference.applicationsOpenAt === null && conference.applicationsCloseAt === null) {
		return { tone: 'warning', title: 'Set an opening and closing time', text: '' };
	}

	const text = applicationWindowSentence(conference);

	// The order of the questions below is what makes exactly one state possible:
	// the first one that answers yes wins. `applyPanelState` in
	// `$lib/conferences.ts` asks them in this same order.
	if (conference.applicationsOpenAt !== null) {
		const opensAt = new Date(conference.applicationsOpenAt);

		if (opensAt.getTime() > now.getTime()) {
			const openingDate = formatConferenceDay(conference.applicationsOpenAt, conference.timezone);

			return { tone: 'info', title: `Open on ${openingDate}`, text };
		}
	}

	if (conference.applicationsCloseAt !== null) {
		const closesAt = new Date(conference.applicationsCloseAt);

		if (closesAt.getTime() < now.getTime()) {
			const closingDate = formatConferenceDay(conference.applicationsCloseAt, conference.timezone);

			return { tone: 'info', title: `Closed on ${closingDate}`, text };
		}
	}

	return { tone: 'success', title: 'Applications are open now', text };
}
