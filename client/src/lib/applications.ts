/**
 * The applicant's half of an application: who may apply to a conference, what
 * the form asks them, what comes back out of it and what a status means.
 *
 * Nothing in here talks to Supabase or to Svelte.
 * `$lib/server/applications.ts` reads and writes the applicant's own rows, and
 * `application-table.ts`, `application-bulk-decisions.ts` and
 * `application-review.ts` beside it the organiser's; the rules live here
 * so that they can be read and tested without a database. The shapes those
 * queries fill in live here too rather than beside them, because a component
 * may not import anything from `$lib/server`, not even a type. `$lib/home.ts`
 * and `$lib/profiles.ts` sit here for the same reason.
 *
 * The rules come from `specs/06-features/applications.md` and the wording of
 * every message from `specs/05-pages/delegate/apply.md`,
 * `specs/05-pages/delegate/application.md` and
 * `specs/03-design/writing-style.md`.
 *
 * The organiser's half of the same form — the window, who may apply, and the
 * custom questions — is in `$lib/application-form-settings.ts` and
 * `$lib/application-questions.ts`.
 */

import {
	isChoiceType,
	MAX_CHOICE_OPTIONS,
	type ApplicationQuestion
} from '$lib/application-questions';
import { hasConferenceFinished } from '$lib/committees';
import {
	formatConferenceDay,
	type ApplicationOpenMode,
	type Conference,
	type ConferenceStatus,
	type LocationMode,
	type MyDelegation
} from '$lib/conferences';
import { isCountryCode } from '$lib/countries';
import type { Database } from '$lib/database.types';
import { dayInTimezone, formatDateRange, formatDueIn } from '$lib/dates';
// This is deliberately a type-only import. `$lib/delegations.ts` imports a
// value from `$lib/conferences.ts`, which imports a type back from this file,
// so importing a value here would close a circle. `import type` is erased
// before the code runs, so that circle never exists at run time.
// `$lib/conferences.ts` already does exactly this in the other direction — look
// at its first import.
import type { DelegationStatus } from '$lib/delegations';
import {
	PROFILE_REQUIRED_FIELD_LABELS,
	type ExperienceLevel,
	type ProfileRequiredField
} from '$lib/profiles';
import { statusLabel } from '$lib/status';
import { isUuid } from '$lib/uuid';

/** `draft` | `submitted` | `accepted` | `rejected` | `waitlisted` | `withdrawn`. */
export type ApplicationStatus = Database['public']['Enums']['application_status'];

/** `unpaid` | `paid` | `waived` | `refunded` | `void`. */
export type InvoiceStatus = Database['public']['Enums']['invoice_status'];

/**
 * One answer: a piece of text for four of the five question types, and a list
 * of the ticked choices for a `multiple_choice` one.
 */
export type ApplicationAnswer = string | string[];

/** Every answer of one application, keyed by `application_questions.id`. */
export type ApplicationAnswers = Record<string, ApplicationAnswer>;

/** One application of the reader's own, in the shape their two pages show it. */
export type MyApplication = {
	id: string;
	conferenceId: string;
	status: ApplicationStatus;
	/** Ordered committee ids, at most the conference's `committee_preference_count`. */
	committeePreferences: string[];
	seatPreferences: string;
	motivation: string;
	/** Keyed by `application_questions.id`. */
	answers: ApplicationAnswers;
	submittedAt: string | null;
	decisionNote: string | null;
	updatedAt: string;
};

/** The conference facts the two applicant pages show. */
export type ApplicationConference = {
	id: string;
	slug: string;
	name: string;
	logoPath: string | null;
	startDate: string;
	endDate: string;
	/** An IANA name such as `Europe/Amsterdam`. Every time of this conference is shown in it. */
	timezone: string;
	status: ConferenceStatus;
	/** `manual` with no opening moment means the organiser has not opened applications yet. */
	applicationOpenMode: ApplicationOpenMode;
	/** ISO timestamps. A null bound counts as open on that side, except as `applicationOpenMode` says. */
	applicationsOpenAt: string | null;
	applicationsCloseAt: string | null;
	/** How many committee selects the form draws. 0 when the conference asks for none. */
	committeePreferenceCount: number;
	askMotivation: boolean;
};

/** The seat an accepted application won, for the sentence that names it. */
export type MyApplicationSeat = {
	seatName: string;
	committeeName: string;
	/** The last part of the committee's link, for the "Go to your committee" button. */
	committeeSlug: string;
	/**
	 * The seat's ISO two-letter country code, for drawing a flag. Null for a seat that is not a
	 * country, such as "Press".
	 */
	countryCode: string | null;
};

/** The invoice an accepted application led to, when the conference charges a fee. */
export type MyApplicationInvoice = {
	id: string;
	/** What the invoice calls itself, such as `DELFTMUN-0031`. */
	number: string;
	status: InvoiceStatus;
	/** Whole cents of the conference's currency. See the top of `$lib/money.ts`. */
	amountCents: number;
	currency: string;
};

/** A committee as one of the apply form's selects offers it. */
export type CommitteeChoice = {
	id: string;
	name: string;
	abbreviation: string | null;
};

/**
 * Everything the apply form holds.
 *
 * A refused form is drawn again from these exact values, so the applicant sees
 * what they typed rather than a tidied version of it.
 */
export type ApplicationFormValues = {
	/** One entry per select the form drew, `''` for "not chosen". */
	committeePreferences: string[];
	seatPreferences: string;
	motivation: string;
	answers: ApplicationAnswers;
	hasConsented: boolean;
};

/** A message for each part of the form that needs fixing. */
export type ApplicationFormErrors = {
	/** One message per select, in the same order; `''` where that select is fine. Absent when none has a problem. */
	committeePreferences?: string[];
	seatPreferences?: string;
	motivation?: string;
	/** Keyed by question id. A question that is fine has no entry. */
	answers?: Record<string, string>;
	consent?: string;
	/** A problem with the whole form: an incomplete profile, or a window that closed while the form was open. */
	form?: string;
};

/** Which of the six reasons `canApply` turned somebody away for. */
export type ApplyRefusalKind =
	| 'not_published'
	| 'individuals_not_accepted'
	| 'already_applied'
	| 'in_delegation'
	| 'not_yet_open'
	| 'closed';

/** Why somebody may not apply, and the sentence the page shows them. */
export type ApplyRefusal = {
	kind: ApplyRefusalKind;
	message: string;
};

/** Everything checking a submitted form needs to know about the conference and the applicant. */
export type ApplicationValidationContext = {
	/** How many committee selects the form drew. */
	preferenceCount: number;
	asksMotivation: boolean;
	questions: ApplicationQuestion[];
	/** The required profile fields still empty, which block submitting. */
	missingProfileFields: ProfileRequiredField[];
};

/** The longest the seat preferences may be, matching the text box on the form. */
export const SEAT_PREFERENCES_MAX_LENGTH = 300;

/**
 * The longest a motivation may be, matching the text box on the form and the
 * `applications_motivation_length` check on the column.
 */
export const MOTIVATION_MAX_LENGTH = 1500;

/**
 * The longest one answer to a custom question may be, and each choice in a
 * list of them, matching the text boxes on the form and the
 * `applications_answers_shape` check on the column. A list holds at most
 * `MAX_CHOICE_OPTIONS` choices, which `$lib/application-questions.ts` keeps.
 */
export const ANSWER_MAX_LENGTH = 4000;

/**
 * Why this person may not apply to this conference right now, or `null` when
 * they may.
 *
 * The order of the questions below is what makes exactly one reason possible:
 * the first one that answers yes wins, the way `applyPanelState` in
 * `$lib/conferences.ts` already works. A `draft` or a `submitted` application
 * of one's own is not a refusal, because that is the row the form prefills
 * from; any other status is, because an application that has been decided is
 * not one to write over.
 *
 * `delegation` is the delegation the reader is in at this conference, or
 * `null` when they are in none. It is the whole delegation rather than its name
 * because the page hangs a link to `/delegations/[id]` on the sentence below;
 * until T25 built that route there was nothing to link to and this was a name.
 */
export function canApply(
	conference: Conference,
	application: MyApplication | null,
	delegation: MyDelegation | null,
	now: Date
): ApplyRefusal | null {
	if (conference.status !== 'published') {
		return { kind: 'not_published', message: 'This conference is not taking applications.' };
	}

	if (!conference.acceptsIndividualApplications) {
		return {
			kind: 'individuals_not_accepted',
			message: 'This conference does not accept individual applications.'
		};
	}

	const isDecided =
		application !== null && application.status !== 'draft' && application.status !== 'submitted';

	if (isDecided) {
		return { kind: 'already_applied', message: 'You already applied.' };
	}

	if (delegation !== null) {
		return {
			kind: 'in_delegation',
			message: `You are part of the ${delegation.name} delegation.`
		};
	}

	// The organiser opens applications by hand and has not yet, which
	// `isAcceptingApplications` in `$lib/conferences.ts` refuses too.
	if (conference.applicationOpenMode === 'manual' && conference.applicationsOpenAt === null) {
		return { kind: 'not_yet_open', message: 'Applications are not open yet.' };
	}

	if (conference.applicationsOpenAt !== null) {
		const opensAt = new Date(conference.applicationsOpenAt);

		if (opensAt.getTime() > now.getTime()) {
			const day = formatConferenceDay(conference.applicationsOpenAt, conference.timezone);

			return { kind: 'not_yet_open', message: `Applications open on ${day}.` };
		}
	}

	if (conference.applicationsCloseAt !== null) {
		const closesAt = new Date(conference.applicationsCloseAt);

		if (closesAt.getTime() < now.getTime()) {
			const day = formatConferenceDay(conference.applicationsCloseAt, conference.timezone);

			return { kind: 'closed', message: `Applications closed on ${day}.` };
		}
	}

	return null;
}

/** Read one text field from a submitted form, without surrounding spaces. A missing field counts as ''. */
function readText(formData: FormData, fieldName: string): string {
	return String(formData.get(fieldName) ?? '').trim();
}

/** Read the answer to one question out of the form, in the shape that question's type has. */
function readAnswer(formData: FormData, question: ApplicationQuestion): ApplicationAnswer {
	const fieldName = `question_${question.id}`;

	if (question.type === 'multiple_choice') {
		// The form draws one tick box per choice, all of them named the same
		// thing, so the answer is every value that arrived under that name.
		const ticked = formData.getAll(fieldName);

		return ticked.map((value) => String(value).trim());
	}

	if (question.type === 'checkbox') {
		// A `checkbox` question is one tick box rather than a list of them. A
		// browser sends the word `on` for a ticked box and nothing at all for an
		// unticked one, so the answer is stored as 'yes' or '' rather than as
		// whatever the browser happened to send. `applicationAnswerRows` below
		// reads those two back as "Yes" and "No".
		return formData.get(fieldName) !== null ? 'yes' : '';
	}

	return readText(formData, fieldName);
}

/**
 * Read the apply form's fields from a submitted form.
 *
 * Both actions read the form this way, so "Save draft" and "Submit application"
 * can never disagree about what was in it. Only the questions this conference
 * asks are read: a hand-made request can carry a `question_<id>` field for
 * another conference's question, and reading it would store an answer to a
 * question this form never asked.
 */
export function readApplicationForm(
	formData: FormData,
	questions: ApplicationQuestion[],
	preferenceCount: number
): ApplicationFormValues {
	const committeePreferences: string[] = [];

	// The selects are numbered from one, as the applicant reads them: the field
	// names are `committee_1` to `committee_3`. Every select gets an entry, even
	// one left on "not chosen", so the list always has one entry per select.
	for (let choice = 1; choice <= preferenceCount; choice += 1) {
		committeePreferences.push(readText(formData, `committee_${choice}`));
	}

	const answers: ApplicationAnswers = {};

	for (const question of questions) {
		answers[question.id] = readAnswer(formData, question);
	}

	return {
		committeePreferences,
		seatPreferences: readText(formData, 'seatPreferences'),
		motivation: readText(formData, 'motivation'),
		answers,
		// A browser sends nothing at all for an unticked box, so the question is
		// whether the field arrived rather than what is in it, the way
		// `readQuestionForm` in `$lib/application-questions.ts` asks it.
		hasConsented: formData.get('consent') !== null
	};
}

/** The first `maxLength` characters of `text`. Too much text is cut rather than refused. */
function clip(text: string, maxLength: number): string {
	return text.slice(0, maxLength);
}

/**
 * One answer with the spaces taken off, cut to the length the column holds
 * and, for a list, the blank entries dropped and the list cut to the most
 * choices the column holds.
 */
function cleanAnswer(answer: ApplicationAnswer): ApplicationAnswer {
	if (Array.isArray(answer)) {
		const trimmed = answer.map((value) => clip(value.trim(), ANSWER_MAX_LENGTH));

		return trimmed.filter((value) => value !== '').slice(0, MAX_CHOICE_OPTIONS);
	}

	return clip(answer.trim(), ANSWER_MAX_LENGTH);
}

/**
 * The values made safe to write, which is what "Save draft" stores.
 *
 * It checks nothing and refuses nothing: a draft is allowed to be half filled
 * in. It only takes out what the database would not hold — a committee that is
 * not this conference's, an answer to a question it does not ask, text longer
 * than its box — so that saving a draft cannot fail.
 *
 * The same committee twice is dropped here and not only in
 * `validateApplication` below, because the `validate_application` trigger
 * refuses a repeated preference on a draft as well as on a submitted
 * application. Without this, "Save draft never blocks on validation" would end
 * in a raw database error instead.
 */
export function cleanApplicationForm(
	values: ApplicationFormValues,
	committees: CommitteeChoice[],
	questions: ApplicationQuestion[]
): ApplicationFormValues {
	const committeePreferences: string[] = [];

	for (const committeeId of values.committeePreferences) {
		const isChosen = committeeId !== '';
		const isThisConferences = committees.some((committee) => committee.id === committeeId);
		const isRepeat = committeePreferences.includes(committeeId);

		if (isChosen && isThisConferences && !isRepeat) {
			committeePreferences.push(committeeId);
		}
	}

	const answers: ApplicationAnswers = {};

	// Walking the questions rather than the answers is what drops an answer to a
	// question this conference does not ask.
	for (const question of questions) {
		const answer = values.answers[question.id];

		if (answer !== undefined) {
			answers[question.id] = cleanAnswer(answer);
		}
	}

	return {
		committeePreferences,
		seatPreferences: clip(values.seatPreferences.trim(), SEAT_PREFERENCES_MAX_LENGTH),
		motivation: clip(values.motivation.trim(), MOTIVATION_MAX_LENGTH),
		answers,
		hasConsented: values.hasConsented
	};
}

/**
 * What is wrong with the committee selects: one message per select, or `null`
 * when every one of them is fine.
 *
 * `readApplicationForm` above gives every select an entry, so the first entry
 * is the first choice and counting the list counts the selects.
 */
function validateCommitteePreferences(
	committeePreferences: string[],
	preferenceCount: number
): string[] | null {
	const messages: string[] = [];
	const chosenAbove: string[] = [];
	let hasProblem = false;

	for (let index = 0; index < committeePreferences.length; index += 1) {
		const committeeId = committeePreferences[index];

		// Only the first choice is required, and only when the conference asks
		// for preferences at all. The rest may be left on "not chosen".
		if (index === 0 && committeeId === '' && preferenceCount > 0) {
			messages.push('Please pick your first choice of committee.');
			hasProblem = true;
			continue;
		}

		if (committeeId !== '' && chosenAbove.includes(committeeId)) {
			messages.push('Please pick different committees for each choice.');
			hasProblem = true;
			continue;
		}

		chosenAbove.push(committeeId);
		messages.push('');
	}

	if (!hasProblem) {
		return null;
	}

	return messages;
}

/**
 * One answer as the list of values really given: none for a blank answer, one
 * for a piece of text or a single choice, several for a multiple choice.
 *
 * Both "is this answered?" and "are these real options?" want the answer in
 * that one shape, whichever of the five types it came from.
 */
function answerValues(answer: ApplicationAnswer | undefined): string[] {
	if (answer === undefined) {
		return [];
	}

	if (Array.isArray(answer)) {
		return answer.filter((value) => value.trim() !== '');
	}

	if (answer.trim() === '') {
		return [];
	}

	return [answer];
}

/** What is wrong with the answer to one question, or `null` when nothing is. */
function answerProblem(
	question: ApplicationQuestion,
	answer: ApplicationAnswer | undefined
): string | null {
	const given = answerValues(answer);

	if (question.isRequired && given.length === 0) {
		return 'Please answer this question.';
	}

	// The box stops the typing at this length, so only a hand-made request
	// or a question whose options are longer still gets here.
	if (given.some((value) => value.length > ANSWER_MAX_LENGTH)) {
		return `Please keep this answer under ${ANSWER_MAX_LENGTH} characters.`;
	}

	// Only the two types that offer choices can be answered with something that
	// is not one of them.
	if (!isChoiceType(question.type)) {
		return null;
	}

	const hasUnknownChoice = given.some((value) => !question.options.includes(value));

	if (hasUnknownChoice) {
		return 'Please pick one of the options.';
	}

	// A question saved before options were capped can offer more than this.
	if (given.length > MAX_CHOICE_OPTIONS) {
		return `Please pick at most ${MAX_CHOICE_OPTIONS} options.`;
	}

	return null;
}

/** What is wrong with the answers, keyed by question id. A question that is fine has no entry. */
function validateAnswers(
	answers: ApplicationAnswers,
	questions: ApplicationQuestion[]
): Record<string, string> {
	const errors: Record<string, string> = {};

	for (const question of questions) {
		const message = answerProblem(question, answers[question.id]);

		if (message !== null) {
			errors[question.id] = message;
		}
	}

	return errors;
}

/**
 * Check the whole apply form, which is what "Submit application" does.
 *
 * Every problem is collected instead of stopping at the first one, so somebody
 * filling in a long form sees all of them at once rather than one per attempt.
 * An incomplete profile is a problem with the whole form rather than with a
 * field, because the field it is about is on another page.
 */
export function validateApplication(
	values: ApplicationFormValues,
	context: ApplicationValidationContext
): ApplicationFormErrors {
	const errors: ApplicationFormErrors = {};
	const committeeMessages = validateCommitteePreferences(
		values.committeePreferences,
		context.preferenceCount
	);

	if (committeeMessages !== null) {
		errors.committeePreferences = committeeMessages;
	}

	const motivation = values.motivation.trim();

	// A conference that does not ask for a motivation cannot be missing one, but
	// a hand-made request can still carry more text than the column holds.
	if (context.asksMotivation && motivation === '') {
		errors.motivation = 'Please tell the organisers why you want to take part.';
	} else if (motivation.length > MOTIVATION_MAX_LENGTH) {
		errors.motivation = `Your motivation can be at most ${MOTIVATION_MAX_LENGTH} characters.`;
	}

	if (values.seatPreferences.trim().length > SEAT_PREFERENCES_MAX_LENGTH) {
		errors.seatPreferences = `Please keep this under ${SEAT_PREFERENCES_MAX_LENGTH} characters.`;
	}

	const answerErrors = validateAnswers(values.answers, context.questions);

	if (Object.keys(answerErrors).length > 0) {
		errors.answers = answerErrors;
	}

	if (!values.hasConsented) {
		errors.consent = 'Please agree so the organisers can see your details.';
	}

	if (context.missingProfileFields.length > 0) {
		const fieldWords = context.missingProfileFields.map(
			(field) => PROFILE_REQUIRED_FIELD_LABELS[field]
		);

		errors.form = `Complete your profile before submitting: ${fieldWords.join(', ')}.`;
	}

	return errors;
}

/**
 * Did `validateApplication` find any problem at all?
 *
 * The committee selects need looking into rather than counting: they are a list
 * with an entry for every select, and the entries for the selects that are fine
 * are empty strings.
 */
export function hasApplicationErrors(errors: ApplicationFormErrors): boolean {
	const committeeMessages = errors.committeePreferences ?? [];

	if (committeeMessages.some((message) => message !== '')) {
		return true;
	}

	if (errors.answers !== undefined && Object.keys(errors.answers).length > 0) {
		return true;
	}

	return (
		errors.seatPreferences !== undefined ||
		errors.motivation !== undefined ||
		errors.consent !== undefined ||
		errors.form !== undefined
	);
}

/**
 * The `name` of the first field with something wrong with it, in the order the
 * form draws them, or `null` when nothing is wrong.
 *
 * `05-pages/delegate/apply.md` asks a refused submit to take the reader to the
 * first error, and the form is five cards long, so the message they need can be
 * well below the fold. Which field that is belongs here rather than in the
 * component, because it is the form's own order written down: the committee
 * selects, the seat preferences, the motivation, the questions in the order
 * they are asked, and the consent last.
 */
export function firstErrorFieldName(
	errors: ApplicationFormErrors,
	questions: ApplicationQuestion[]
): string | null {
	const committeeMessages = errors.committeePreferences ?? [];

	for (let index = 0; index < committeeMessages.length; index += 1) {
		if (committeeMessages[index] !== '') {
			// The selects are numbered from one, as the applicant reads them.
			return `committee_${index + 1}`;
		}
	}

	if (errors.seatPreferences !== undefined) {
		return 'seatPreferences';
	}

	if (errors.motivation !== undefined) {
		return 'motivation';
	}

	const answerErrors = errors.answers ?? {};
	const askedInOrder = [...questions].sort((first, second) => first.position - second.position);

	for (const question of askedInOrder) {
		if (answerErrors[question.id] !== undefined) {
			return `question_${question.id}`;
		}
	}

	if (errors.consent !== undefined) {
		return 'consent';
	}

	// `errors.form` is the only one left, and it is drawn at the top of the form
	// where the reader already is, so there is nowhere to take them.
	return null;
}

/**
 * A saved application put back into the form, for the apply page to open an
 * existing draft with.
 *
 * The committee list is cut or padded to one entry per select, because an
 * organiser can change `committee_preference_count` after somebody saved a
 * draft, and the form has to draw what it asks for today.
 */
export function toApplicationFormValues(
	application: MyApplication,
	preferenceCount: number
): ApplicationFormValues {
	const committeePreferences: string[] = [];

	for (let index = 0; index < preferenceCount; index += 1) {
		committeePreferences.push(application.committeePreferences[index] ?? '');
	}

	return {
		committeePreferences,
		seatPreferences: application.seatPreferences,
		motivation: application.motivation,
		answers: application.answers,
		// Consent is not a column on `applications`, so it is worked out rather
		// than read: a row that was once submitted had consent given at the time,
		// and a draft that has never been submitted has not been consented to yet.
		hasConsented: application.submittedAt !== null
	};
}

/** The statuses an applicant may move their own application to. */
function applicantNextStatuses(status: ApplicationStatus): ApplicationStatus[] {
	if (status === 'draft') {
		return ['submitted'];
	}

	// "Edit" is what takes a submitted application back to a draft; withdrawing
	// it cannot be undone.
	if (status === 'submitted') {
		return ['draft', 'withdrawn'];
	}

	if (status === 'waitlisted') {
		return ['withdrawn'];
	}

	return [];
}

/** The statuses an organiser may move somebody's application to. */
function organiserNextStatuses(status: ApplicationStatus): ApplicationStatus[] {
	if (status === 'submitted') {
		return ['accepted', 'rejected', 'waitlisted'];
	}

	if (status === 'waitlisted') {
		return ['accepted', 'rejected'];
	}

	// Taking back an acceptance frees the seat again, which is the "Revoke"
	// button on the organiser's review page.
	if (status === 'accepted') {
		return ['rejected', 'withdrawn'];
	}

	return [];
}

/**
 * Where an application may go next, for whoever is asking.
 *
 * The status machine in `06-features/applications.md` is one table with a
 * column for each side, so both sides are written here rather than one of them
 * waiting for the organiser's pages. A status with nothing left to do, such as
 * `rejected`, gives an empty list.
 */
export function nextStatuses(
	status: ApplicationStatus,
	role: 'applicant' | 'organiser'
): ApplicationStatus[] {
	if (role === 'applicant') {
		return applicantNextStatuses(status);
	}

	return organiserNextStatuses(status);
}

/**
 * May the applicant still change this application?
 *
 * Only while it is theirs to change — a draft, or a submitted application they
 * can reopen — and only while the conference is still taking applications.
 */
export function canEditApplication(status: ApplicationStatus, isWindowOpen: boolean): boolean {
	if (!isWindowOpen) {
		return false;
	}

	return status === 'draft' || status === 'submitted';
}

/**
 * The one sentence the status card says, such as "The organisers are reviewing
 * your application."
 *
 * `seat` is the seat an accepted application won. `accept_application` always
 * allocates one in the same step, so an accepted application without a seat is
 * not a state the app reaches; the shorter sentence is there because TypeScript
 * cannot know that.
 */
export function applicationStatusSentence(
	status: ApplicationStatus,
	seat: MyApplicationSeat | null
): string {
	if (status === 'draft') {
		return 'You have not submitted this application yet.';
	}

	if (status === 'submitted') {
		return 'The organisers are reviewing your application.';
	}

	if (status === 'waitlisted') {
		return 'You are on the waiting list. We will tell you as soon as a seat opens.';
	}

	if (status === 'accepted') {
		if (seat === null) {
			return 'You were accepted.';
		}

		return `You were accepted and represent ${seat.seatName} in ${seat.committeeName}.`;
	}

	if (status === 'rejected') {
		return 'The organisers could not accept your application this time.';
	}

	// `withdrawn` is the last of the six statuses, so nothing else can be left.
	return 'You withdrew this application.';
}

/**
 * How many whole years old somebody born on `dateOfBirth` is on `today`.
 *
 * Both dates are `YYYY-MM-DD`, so the year and the rest are read straight out
 * of the text. No `Date` is built, which keeps the timezone out of a question
 * that does not have one: a birthday falls on the same day wherever it is read.
 */
function ageInYears(dateOfBirth: string, today: string): number {
	const birthYear = Number(dateOfBirth.slice(0, 4));
	const currentYear = Number(today.slice(0, 4));
	const birthMonthAndDay = dateOfBirth.slice(5);
	const currentMonthAndDay = today.slice(5);

	const yearsSinceBirth = currentYear - birthYear;

	// `MM-DD` text compares the same way the dates it is cut from do. The
	// birthday has not come round yet this year, so a year comes back off.
	if (currentMonthAndDay < birthMonthAndDay) {
		return yearsSinceBirth - 1;
	}

	return yearsSinceBirth;
}

/**
 * The line to show somebody whose age is outside what the conference expects,
 * or `null` when there is nothing to say.
 *
 * `06-features/applications.md` calls this a warning and never a block: both
 * sentences end by saying they can still apply. There is nothing to say when
 * the organisers set no bounds, when the profile has no date of birth, or when
 * the age is inside the bounds. Both dates are `YYYY-MM-DD`.
 */
export function ageWarning(
	conference: Conference,
	dateOfBirth: string,
	today: string
): string | null {
	if (conference.minAge === null && conference.maxAge === null) {
		return null;
	}

	if (dateOfBirth === '') {
		return null;
	}

	const age = ageInYears(dateOfBirth, today);

	if (conference.minAge !== null && age < conference.minAge) {
		return `This conference is for delegates aged ${conference.minAge} and over. You can still apply.`;
	}

	if (conference.maxAge !== null && age > conference.maxAge) {
		return `This conference is for delegates up to ${conference.maxAge}. You can still apply.`;
	}

	return null;
}

/**
 * One answer as the "Your answers" list shows it. The organiser's review page
 * reads it through `$lib/application-review`, so both pages word it the same.
 */
export function answerText(
	question: ApplicationQuestion,
	answer: ApplicationAnswer | undefined
): string {
	if (question.type === 'checkbox') {
		// A tick box is stored as 'yes' or '', and neither is a word to put in
		// front of somebody, so it is read back as the answer to the question.
		return answer === 'yes' ? 'Yes' : 'No';
	}

	const given = answerValues(answer);

	if (given.length === 0) {
		return 'Not answered';
	}

	return given.join(', ');
}

/**
 * The whole "Your answers" list of one application, in the order the form asked
 * for it: the committee preferences, the seat preferences, the motivation, and
 * then one row per custom question.
 *
 * `committeeNames` are the names of `application.committeePreferences`, in the
 * same order, which the page looks up because this file knows no committees.
 *
 * The first three rows are left out when they are empty rather than shown
 * blank: a conference that asks for no committee preferences and no motivation
 * has neither stored, and a box the applicant left blank has nothing to show.
 * An unanswered question is the other way round and keeps its row, reading
 * "Not answered", because the organiser really did ask it and the reader should
 * see that it was put to them.
 *
 * It lives here rather than in the component that draws it, because `CLAUDE.md`
 * keeps formatting out of a component's script block.
 */
export function applicationAnswerRows(
	application: MyApplication,
	questions: ApplicationQuestion[],
	committeeNames: string[]
): { label: string; value: string }[] {
	const rows: { label: string; value: string }[] = [];

	if (committeeNames.length > 0) {
		// Numbered, because "1. UNSC · 2. ECOFIN" is an order of preference
		// rather than a set of committees.
		const numbered = committeeNames.map((name, index) => `${index + 1}. ${name}`);

		rows.push({ label: 'Committee preferences', value: numbered.join(' · ') });
	}

	if (application.seatPreferences.trim() !== '') {
		rows.push({ label: 'Seat preferences', value: application.seatPreferences });
	}

	if (application.motivation.trim() !== '') {
		rows.push({ label: 'Motivation', value: application.motivation });
	}

	// `position` is the order the applicant was asked the questions in, and the
	// answers are shown in that same order. Sorting a copy leaves the array the
	// page was given alone.
	const askedInOrder = [...questions].sort((first, second) => first.position - second.position);

	for (const question of askedInOrder) {
		rows.push({
			label: question.label,
			value: answerText(question, application.answers[question.id])
		});
	}

	return rows;
}

/*
 * Everything below belongs to the organiser's own table,
 * `/manage/[slug]/applications`, rather than to the form an applicant fills in.
 * It is the same applications read from the other side: a page of them at a
 * time, chosen with a filter kept in the address, decided on in bulk, and
 * written out as a spreadsheet. Nothing above this line knows about any of it.
 *
 * The wording comes from `specs/05-pages/organiser/applications.md`.
 */

/** How many applications fit on one page of the organiser's table. */
export const APPLICATIONS_PAGE_SIZE = 25;

/**
 * The longest a decision note may be, matching the text box on the reject
 * panel. It is the note the applicant reads, not the private one.
 */
export const DECISION_NOTE_MAX_LENGTH = 500;

/**
 * Every status the organiser's table shows: the five that are not `draft`.
 *
 * A draft is an application nobody has sent yet, so it is none of the
 * organiser's business. Row Level Security cannot hide it — a policy decides
 * rows and not columns, and the organiser may read the row — so every query and
 * every list in this half leaves drafts out itself.
 */
export type ListedApplicationStatus = Exclude<ApplicationStatus, 'draft'>;

/**
 * The tabs, in the order the page draws them: the queue first, then the two
 * ways out of it, then the two ends of the story.
 */
export const APPLICATION_STATUS_TABS: ListedApplicationStatus[] = [
	'submitted',
	'waitlisted',
	'accepted',
	'rejected',
	'withdrawn'
];

/**
 * The words on each tab.
 *
 * They come from `$lib/status`, which already has a word for every value of
 * every enum, so a tab and the badge on the row underneath it cannot disagree
 * about what `submitted` is called. Writing the five out by hand rather than
 * building them in a loop is what makes `pnpm check` fail if a status is ever
 * added to the enum and nobody gives it a tab.
 */
export const APPLICATION_TAB_LABELS: Record<ListedApplicationStatus, string> = {
	submitted: statusLabel('application_status', 'submitted'),
	waitlisted: statusLabel('application_status', 'waitlisted'),
	accepted: statusLabel('application_status', 'accepted'),
	rejected: statusLabel('application_status', 'rejected'),
	withdrawn: statusLabel('application_status', 'withdrawn')
};

/**
 * What each tab says when it has no applications in it.
 *
 * One sentence per tab rather than one for all five, because "No applications
 * under review." is the only one `05-pages/organiser/applications.md` writes
 * out and the other four read wrong in its place: a conference that has
 * accepted nobody yet is not a conference with nothing under review. The words
 * live here rather than in the page, because `CLAUDE.md` keeps wording out of a
 * component's script block.
 */
export const APPLICATION_EMPTY_TITLES: Record<ListedApplicationStatus, string> = {
	submitted: 'No applications under review.',
	waitlisted: 'No waitlisted applications.',
	accepted: 'No accepted applications.',
	rejected: 'No applications marked as not accepted.',
	withdrawn: 'No withdrawn applications.'
};

/** Is this one of the five statuses the table shows? `draft` is not. */
export function isListedApplicationStatus(text: string): text is ListedApplicationStatus {
	return APPLICATION_STATUS_TABS.some((status) => status === text);
}

/** Which order the table comes in: oldest submission first, by name, or newest decision first. */
export type ApplicationListSort = 'submitted' | 'name' | 'decided';

/**
 * The three orders as the sort dropdown offers them.
 *
 * "Oldest first" is the default because the queue is worked through in the
 * order people joined it, which is the fair way round.
 */
export const APPLICATION_SORT_OPTIONS: { value: ApplicationListSort; label: string }[] = [
	{ value: 'submitted', label: 'Oldest first' },
	{ value: 'name', label: 'Name' },
	{ value: 'decided', label: 'Recently decided' }
];

/**
 * How the page draws the applications: one tab at a time as a table, or every
 * state an organiser decides side by side as a board of columns (T135).
 */
export type ApplicationListView = 'table' | 'board';

/** Everything we read out of the URL: which applications to show, and which page of them. */
export type ApplicationListQuery = {
	/** Text over the applicant's name and institution. */
	q: string;
	status: ListedApplicationStatus;
	/** A committee id (always a uuid) the applicant put anywhere in their preferences, or '' for any. */
	committee: string;
	/** A two-letter country code, or '' for any. */
	country: string;
	sort: ApplicationListSort;
	/** 1-based. */
	page: number;
	/**
	 * The table or the board. It is part of the query rather than a setting of
	 * its own so that every action's redirect, which rebuilds the address from
	 * this query, lands the organiser back on the view they were using.
	 */
	view: ApplicationListView;
};

/** The table as it opens: everything under review, oldest first, first page. */
export const EMPTY_APPLICATION_LIST_QUERY: ApplicationListQuery = {
	q: '',
	status: 'submitted',
	committee: '',
	country: '',
	sort: 'submitted',
	page: 1,
	view: 'table'
};

/** Anyone can type anything into the URL, so ignore anything that is not one of the five tabs. */
function readListedStatus(value: string | null): ListedApplicationStatus {
	const status = value?.trim() ?? '';

	if (isListedApplicationStatus(status)) {
		return status;
	}

	return 'submitted';
}

/** Anyone can type anything into the URL, so ignore anything that is not one of the three orders. */
function readSort(value: string | null): ApplicationListSort {
	const sort = value?.trim() ?? '';
	const knownSort = APPLICATION_SORT_OPTIONS.find((option) => option.value === sort);

	return knownSort?.value ?? 'submitted';
}

/** Anyone can type anything into the URL, so ignore values that are not a known country code. */
function readCountryCode(value: string | null): string {
	const code = value?.trim().toUpperCase() ?? '';

	return isCountryCode(code) ? code : '';
}

/**
 * The committee the address names, or '' for any. It is kept only when it has
 * the shape of an id: the value goes straight into a filter on a `uuid[]`
 * column, and Postgres refuses the whole query for anything else, so a value
 * that is not an id means "any committee" rather than a failed page. This file
 * knows no committees, so an id of some other conference simply matches no
 * application.
 */
function readCommitteeId(value: string | null): string {
	const id = value?.trim() ?? '';

	return isUuid(id) ? id : '';
}

/** Anyone can type anything into the URL, so anything but `board` is the table. */
function readView(value: string | null): ApplicationListView {
	return value?.trim() === 'board' ? 'board' : 'table';
}

/** Fall back to the first page for anything that is not a whole number above zero. */
function readPage(value: string | null): number {
	const page = Number(value);

	return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * Turn `?q=kowalski&status=waitlisted&country=PL&sort=name&page=2` into an
 * `ApplicationListQuery`. Takes the parameters rather than the whole URL,
 * because the filter form reads its own values through this same function, the
 * way `parseConferenceQuery` in `$lib/conferences.ts` does.
 *
 * Anything unreadable falls back to its default: the address is only text
 * somebody could have typed there.
 */
export function parseApplicationListQuery(params: URLSearchParams): ApplicationListQuery {
	return {
		q: params.get('q')?.trim() ?? '',
		status: readListedStatus(params.get('status')),
		committee: readCommitteeId(params.get('committee')),
		country: readCountryCode(params.get('country')),
		sort: readSort(params.get('sort')),
		page: readPage(params.get('page')),
		view: readView(params.get('view'))
	};
}

/** One row of the organiser's table. */
export type OrganiserApplicationRow = {
	id: string;
	applicantName: string;
	avatarPath: string | null;
	institutionName: string | null;
	countryCode: string | null;
	experienceLevel: ExperienceLevel;
	/** How the first committee they asked for is named, or null when they asked for none. */
	firstPreference: string | null;
	/**
	 * Every committee they asked for, as ids, in their own order of preference.
	 *
	 * The table draws none of these — it prints `firstPreference` and nothing
	 * else — but the seat panel needs them: `suggestSeats` puts an applicant's
	 * preferred committees at the top of their dropdown and asks for ids. They
	 * travel on the row rather than being looked up again from the name, because
	 * two committees of one conference may share an abbreviation and a name is
	 * not a way back to an id.
	 */
	committeePreferences: string[];
	status: ListedApplicationStatus;
	submittedAt: string | null;
	decidedAt: string | null;
	/** "UNSC · France" once accepted, otherwise null. */
	seatLabel: string | null;
};

/** How many applications this conference has in each of the five shown statuses. */
export type ApplicationStatusCounts = Record<ListedApplicationStatus, number>;

/** A conference nobody has applied to yet, and what the counts start from. */
export const EMPTY_APPLICATION_STATUS_COUNTS: ApplicationStatusCounts = {
	submitted: 0,
	waitlisted: 0,
	accepted: 0,
	rejected: 0,
	withdrawn: 0
};

/**
 * The line under the page title: "142 under review · 80 accepted".
 *
 * A status nobody is in is left out rather than written as "0 waitlisted",
 * because the tabs above already show every status and its count. With nobody
 * at all it is "No applications yet", the way `teamCountsSentence` in
 * `$lib/team.ts` answers the same question about an empty team.
 */
export function applicationCountsSentence(counts: ApplicationStatusCounts): string {
	const parts: string[] = [];

	for (const status of APPLICATION_STATUS_TABS) {
		if (counts[status] > 0) {
			// The tab labels start with a capital because a tab is a label of its
			// own. In the middle of a sentence the same words are lower case.
			const words = APPLICATION_TAB_LABELS[status].toLowerCase();

			parts.push(`${counts[status]} ${words}`);
		}
	}

	if (parts.length === 0) {
		return 'No applications yet';
	}

	return parts.join(' · ');
}

/** How a bulk decision went: how many really moved, and how many were left alone. */
export type BulkDecisionOutcome = {
	changedCount: number;
	skippedCount: number;
};

/** "1 application" or "6 applications": the plural is the only thing that changes. */
function countedApplications(count: number): string {
	if (count === 1) {
		return '1 application';
	}

	return `${count} applications`;
}

/** "1 was already decided" or "2 were already decided": the plural again. */
function alreadyDecided(count: number): string {
	if (count === 1) {
		return '1 was already decided';
	}

	return `${count} were already decided`;
}

/** "2 skipped because they were already decided", in the singular for one of them. */
function skippedBecauseDecided(count: number): string {
	if (count === 1) {
		return '1 skipped because it was already decided';
	}

	return `${count} skipped because they were already decided`;
}

/**
 * What the flash says after a bulk decision.
 *
 * `doneWord` is what was done to them: "waitlisted", or "marked as not
 * accepted". It is given rather than worked out here because the two actions
 * word it differently and neither word is a status.
 *
 * An application is skipped when somebody else decided it while this organiser
 * was looking at the list, so the sentence always says how many were left
 * alone rather than quietly doing less than it was asked:
 *
 *   nothing skipped  → "6 applications waitlisted."
 *   nothing changed  → "Nothing changed. 2 were already decided."
 *   both             → "4 waitlisted, 2 skipped because they were already decided."
 */
export function bulkDecisionFlash(outcome: BulkDecisionOutcome, doneWord: string): string {
	if (outcome.changedCount === 0) {
		return `Nothing changed. ${alreadyDecided(outcome.skippedCount)}.`;
	}

	if (outcome.skippedCount === 0) {
		return `${countedApplications(outcome.changedCount)} ${doneWord}.`;
	}

	return `${outcome.changedCount} ${doneWord}, ${skippedBecauseDecided(outcome.skippedCount)}.`;
}

/**
 * The seat chosen for each applicant, read out of the `seat:<applicationId>`
 * fields the accept panel draws.
 *
 * Only the applications that were ticked are read, so a hand-made request
 * cannot carry a seat for somebody the organiser never selected. Each of them
 * gets an entry, `''` when its dropdown was left on "not chosen", so that
 * `validateBulkSeatChoices` below can say which applicant is missing one.
 */
export function readBulkSeatChoices(
	formData: FormData,
	applicationIds: string[]
): Record<string, string> {
	const choices: Record<string, string> = {};

	for (const applicationId of applicationIds) {
		choices[applicationId] = readText(formData, `seat:${applicationId}`);
	}

	return choices;
}

/**
 * What is wrong with those choices, or `null` when nothing is.
 *
 * Only the first problem comes back, because the panel shows one message above
 * the whole list rather than one per row, and because the organiser fixes them
 * one at a time anyway.
 *
 * `seatNameById` turns a seat id into its name for the second message. It is
 * given rather than looked up, because this file knows no seats: the page has
 * them already and building the map is its job.
 */
export function validateBulkSeatChoices(
	applicationIds: string[],
	choices: Record<string, string>,
	seatNameById: Map<string, string>
): string | null {
	const chosenAlready: string[] = [];

	for (const applicationId of applicationIds) {
		const seatId = choices[applicationId] ?? '';

		if (seatId === '') {
			return 'Choose a seat for every applicant, or untick the ones you are not ready to accept.';
		}

		if (chosenAlready.includes(seatId)) {
			// A seat whose name nobody gave us is still a seat chosen twice, so
			// the message is worded so that it reads without one.
			const seatName = seatNameById.get(seatId) ?? 'That seat';

			return `${seatName} was chosen twice.`;
		}

		chosenAlready.push(seatId);
	}

	return null;
}

/** One application as the CSV writes it. */
export type ApplicationExportRow = {
	applicantName: string;
	email: string | null;
	institutionName: string | null;
	/** The English country name, not the code. */
	countryName: string | null;
	experienceLevel: ExperienceLevel;
	/** `YYYY-MM-DD`, or null. */
	dateOfBirth: string | null;
	phone: string | null;
	dietaryRequirements: string | null;
	/** "Maria Kowalska · +48 22 000 0000", or null when neither half is filled in. */
	emergencyContact: string | null;
	/** The committees they asked for, in their own order, already named. */
	committeeNames: string[];
	seatPreferences: string | null;
	motivation: string | null;
	answers: ApplicationAnswers;
	status: ListedApplicationStatus;
	/** ISO timestamps, so a spreadsheet can sort them. */
	submittedAt: string | null;
	decidedAt: string | null;
	/** "UNSC · France", or null. */
	seatLabel: string | null;
	decisionNote: string | null;
	internalNote: string | null;
};

/** One answer as a spreadsheet cell. */
function answerCell(question: ApplicationQuestion, answer: ApplicationAnswer | undefined): string {
	if (question.type === 'checkbox') {
		// A tick box is stored as 'yes' or '', and neither is a word to put in a
		// column, so it is read back as the answer to the question the box asks,
		// the way `applicationAnswerRows` above reads it for the page.
		return answer === 'yes' ? 'Yes' : 'No';
	}

	// A "Pick several" answer is a list, and one cell holding "English, French"
	// is what a reader of a spreadsheet expects. A question nobody answered is an
	// empty cell rather than the "Not answered" the page shows, because somebody
	// sorting or counting a column should not have to read around a sentence.
	return answerValues(answer).join(', ');
}

/** The first row of the CSV: what each column holds. */
function applicationCsvHeadings(
	askedInOrder: ApplicationQuestion[],
	preferenceCount: number
): string[] {
	const preferenceHeadings: string[] = [];

	// The preferences are numbered from one, as the applicant chose them.
	for (let choice = 1; choice <= preferenceCount; choice += 1) {
		preferenceHeadings.push(`Preference ${choice}`);
	}

	return [
		'Name',
		'Email',
		'Institution',
		'Country',
		'Experience',
		'Date of birth',
		'Phone',
		'Dietary requirements',
		'Emergency contact',
		...preferenceHeadings,
		'Seat preferences',
		'Motivation',
		...askedInOrder.map((question) => question.label),
		'Status',
		'Submitted',
		'Decided',
		'Seat',
		'Decision note',
		'Internal note'
	];
}

/** One application as one row of cells, in the same order as the headings above. */
function applicationCsvRow(
	application: ApplicationExportRow,
	askedInOrder: ApplicationQuestion[],
	preferenceCount: number
): string[] {
	const preferences: string[] = [];

	// Every row gets one cell per preference the conference asks for, even when
	// this applicant named fewer, so that every row has the same columns as the
	// headings.
	for (let index = 0; index < preferenceCount; index += 1) {
		preferences.push(application.committeeNames[index] ?? '');
	}

	const answers = askedInOrder.map((question) =>
		answerCell(question, application.answers[question.id])
	);

	// An empty cell is '', never the word "null": a spreadsheet shows what it is
	// given.
	return [
		application.applicantName,
		application.email ?? '',
		application.institutionName ?? '',
		application.countryName ?? '',
		statusLabel('experience_level', application.experienceLevel),
		application.dateOfBirth ?? '',
		application.phone ?? '',
		application.dietaryRequirements ?? '',
		application.emergencyContact ?? '',
		...preferences,
		application.seatPreferences ?? '',
		application.motivation ?? '',
		...answers,
		statusLabel('application_status', application.status),
		application.submittedAt ?? '',
		application.decidedAt ?? '',
		application.seatLabel ?? '',
		application.decisionNote ?? '',
		application.internalNote ?? ''
	];
}

/**
 * The whole export as a table of cells, the first row the headings.
 *
 * `preferenceCount` is the conference's `committee_preference_count` rather
 * than the most preferences anybody named, so two exports of the same
 * conference have the same columns whatever the filter was.
 *
 * It stops at the cells. Turning them into text is `toCsvText` in
 * `$lib/csv.ts`, so the quoting rules of the file format are written down in
 * one place and the columns in another.
 */
export function applicationCsvRows(
	applications: ApplicationExportRow[],
	questions: ApplicationQuestion[],
	preferenceCount: number
): string[][] {
	// `position` is the order the applicant was asked the questions in, and the
	// columns follow it. Sorting a copy leaves the array the caller gave alone.
	const askedInOrder = [...questions].sort((first, second) => first.position - second.position);
	const rows = applications.map((application) =>
		applicationCsvRow(application, askedInOrder, preferenceCount)
	);

	return [applicationCsvHeadings(askedInOrder, preferenceCount), ...rows];
}

/**
 * What the download is called: `applications-thimun-2027-2026-09-21.csv`.
 *
 * `day` is `YYYY-MM-DD` worked out in the conference's own timezone, so two
 * exports taken on the same day there are named the same wherever the organiser
 * is sitting.
 */
export function applicationsCsvFileName(conferenceSlug: string, day: string): string {
	return `applications-${conferenceSlug}-${day}.csv`;
}

/*
 * Everything below is what `/applications` is drawn from: the reader's own list
 * of both roads into a conference, the individual application they sent and the
 * delegation they belong to, shown as one list of rows.
 *
 * It was added by T69 and sits in this same file beside the applicant's half
 * (T24) and the organiser's half (T26) for the reason the module map in
 * `specs/02-architecture/stack.md` gives: the topic of this file is the
 * application itself and not any one reader of it, so every side of it is
 * written down in one place. `$lib/delegations.ts` holds both sides of its own
 * route the same way.
 *
 * The wording comes from `specs/05-pages/delegate/applications.md`.
 */

/** The conference facts one row of `/applications` shows. */
export type ApplicationListConference = {
	id: string;
	slug: string;
	name: string;
	/** The organisation running the conference, or `null` when it could not be read. */
	organizationName: string | null;
	logoPath: string | null;
	/** The wide banner's path in the `public-media` bucket, or `null`; the home page's band draws it. */
	bannerPath: string | null;
	/** The first day, as a plain `YYYY-MM-DD` with no time and no timezone. */
	startDate: string;
	/** The last day, in the same shape. */
	endDate: string;
	/** An IANA name such as `Europe/Amsterdam`: the conference's own timezone, never the reader's. */
	timezone: string;
	/** Whether the organisers have closed the conference down, which is the `archived` status. */
	isArchived: boolean;
	/** An ISO timestamp, or `null` when nothing bounds the window on that side. */
	applicationsCloseAt: string | null;
	/** `null` for an online conference, and for one that has not said where yet; the home page's rows name it. */
	city: string | null;
	/** The building the conference is held in, or `null` when none has been named. */
	venueName: string | null;
	/** In a venue, online, or both: with `city`, what the home page writes as the place. */
	locationMode: LocationMode;
};

/** The seat a row names, once the conference has given the reader one. */
export type ApplicationListSeat = {
	seatName: string;
	/** What the committee is called on a row: its short name when it has one, its full name otherwise. */
	committeeHeading: string;
	/**
	 * The seat's ISO two-letter country code, for drawing a flag. Null for a seat that is not a
	 * country, such as "Press".
	 */
	countryCode: string | null;
};

/** One individual application of the reader's own, as `/applications` lists it. */
export type MyApplicationListItem = {
	id: string;
	status: ApplicationStatus;
	/** An ISO timestamp, `null` while the application is still a draft. */
	submittedAt: string | null;
	updatedAt: string;
	conference: ApplicationListConference;
	seat: ApplicationListSeat | null;
};

/** One delegation the reader belongs to, as `/applications` lists it. */
export type MyDelegationListItem = {
	id: string;
	name: string;
	status: DelegationStatus;
	conference: ApplicationListConference;
	seat: ApplicationListSeat | null;
};

/**
 * One row of `/applications`, whichever of the two roads into a conference
 * brought it there.
 *
 * `id` is what the page's `{#each}` keys on. It is the application's id on an
 * `individual` row and the delegation's id on a `delegation` one, and the two
 * can never collide because they are the keys of two different tables.
 */
export type ApplicationListEntry =
	| { kind: 'individual'; id: string; application: MyApplicationListItem }
	| { kind: 'delegation'; id: string; membership: MyDelegationListItem };

/** The conference one entry is about, whichever kind of entry it is. */
export function applicationListConference(entry: ApplicationListEntry): ApplicationListConference {
	if (entry.kind === 'individual') {
		return entry.application.conference;
	}

	return entry.membership.conference;
}

/** -1, 0 or 1 for two pieces of text, so that the comparator below reads as three tries in a row. */
function compareText(first: string, second: string): number {
	if (first < second) {
		return -1;
	}

	if (first > second) {
		return 1;
	}

	return 0;
}

/**
 * Which of two rows comes first: the one whose conference starts earlier, then
 * the one whose conference is named earlier in the alphabet, and last of all
 * the one with the smaller id.
 *
 * Both start dates are `YYYY-MM-DD`, so comparing them as text compares them as
 * dates, the way `compareMyCommittees` in `$lib/committees.ts` does.
 *
 * The two fallbacks are there so that two conferences starting on the same day
 * always come out in the same order, whichever order the two queries behind the
 * page happened to answer in.
 */
function compareApplicationListEntries(
	first: ApplicationListEntry,
	second: ApplicationListEntry
): number {
	const firstConference = applicationListConference(first);
	const secondConference = applicationListConference(second);
	const byStartDate = compareText(firstConference.startDate, secondConference.startDate);

	if (byStartDate !== 0) {
		return byStartDate;
	}

	const byName = compareText(firstConference.name, secondConference.name);

	if (byName !== 0) {
		return byName;
	}

	return compareText(first.id, second.id);
}

/**
 * Both roads into a conference as the one list `/applications` shows, soonest
 * conference first.
 *
 * Nothing is merged away. Nobody can hold both an individual application and a
 * delegation membership at one conference — `check_one_route_per_conference`
 * refuses the second — so the two lists can never name the same conference
 * twice and there is never a duplicate to drop, which is where this differs
 * from `mergeMyCommittees` in `$lib/committees.ts`.
 *
 * Neither list it is given is changed. `sort` reorders the array it is called
 * on, and the array here is one this function built itself.
 */
export function mergeIntoApplicationList(
	applications: MyApplicationListItem[],
	memberships: MyDelegationListItem[]
): ApplicationListEntry[] {
	const entries: ApplicationListEntry[] = [];

	for (const application of applications) {
		entries.push({ kind: 'individual', id: application.id, application });
	}

	for (const membership of memberships) {
		entries.push({ kind: 'delegation', id: membership.id, membership });
	}

	return entries.sort(compareApplicationListEntries);
}

/**
 * Only the entries whose conference is still to come or still running. This is
 * the list `/applications` shows until `?past=1` asks for the rest.
 *
 * The rule itself is imported from `$lib/committees.ts` rather than written out
 * again here. `/committees` takes the same `?past=1` parameter, and the two
 * sibling pages must not disagree about what "past" means, so the rule is
 * written once, in the file that first needed it.
 */
export function withoutPastConferences(
	entries: ApplicationListEntry[],
	now: Date
): ApplicationListEntry[] {
	return entries.filter((entry) => !hasConferenceFinished(applicationListConference(entry), now));
}

/**
 * Whether this conference is still taking applications, as far as one row of
 * this list can tell.
 *
 * A list row judges the window from the closing date and the archive flag
 * alone. The application's own page is the authority on anything subtler, and
 * this row only decides whether to offer "Finish". A conference with no
 * `applicationsCloseAt` has nothing bounding the window on that side, so its
 * window is open.
 */
function isApplicationWindowOpen(conference: ApplicationListConference, now: Date): boolean {
	if (conference.isArchived) {
		return false;
	}

	if (conference.applicationsCloseAt === null) {
		return true;
	}

	const closesAt = new Date(conference.applicationsCloseAt);

	return closesAt.getTime() >= now.getTime();
}

/**
 * The quiet line under the conference's name on an individual application's
 * row: "Submitted 8 Sept 2026", "Draft · closes in 3 days", or "Draft · closed".
 */
export function applicationRowLine(application: MyApplicationListItem, now: Date): string {
	const conference = application.conference;

	if (application.status !== 'draft') {
		// The database sets `submitted_at` the moment an application leaves draft,
		// so anything that is no longer a draft has one. The fallback to
		// `updatedAt` is only there because the column is nullable.
		const submittedMoment = new Date(application.submittedAt ?? application.updatedAt);
		const submittedDay = dayInTimezone(submittedMoment, conference.timezone);

		// `formatDateRange` writes a single day as "8 Sept 2026" when both ends are
		// the same day, which is why a function about a range is used for one date.
		return `Submitted ${formatDateRange(submittedDay, submittedDay)}`;
	}

	if (!isApplicationWindowOpen(conference, now)) {
		// "closed" is lower case because it is the second half of a sentence that
		// starts with "Draft ·", the same sentence an open draft gets with a
		// different ending. `05-pages/delegate/applications.md` words the edge
		// case that way too.
		return 'Draft · closed';
	}

	if (conference.applicationsCloseAt === null) {
		return 'Draft';
	}

	const closeDay = dayInTimezone(new Date(conference.applicationsCloseAt), conference.timezone);

	// `formatDueIn` writes a sentence of its own ("In 5 days"), so it is
	// lower-cased to sit in the middle of this one. It can never answer "Overdue"
	// here, because a window that has already shut is handled above.
	const closesIn = formatDueIn(closeDay, now, conference.timezone).toLowerCase();

	return `Draft · closes ${closesIn}`;
}

/** The quiet line under the conference's name on a delegation's row: "Delegation · LSE Team". */
export function delegationRowLine(membership: MyDelegationListItem): string {
	return `Delegation · ${membership.name}`;
}

/**
 * Whether this row still offers "Finish", which only an unsent draft at a
 * conference still taking applications does.
 */
export function canFinishApplication(application: MyApplicationListItem, now: Date): boolean {
	if (application.status !== 'draft') {
		return false;
	}

	return isApplicationWindowOpen(application.conference, now);
}

/**
 * The notice `/applications` shows above the list when some of the reader's
 * applications are at a conference the organisers have unpublished, and so
 * cannot be listed: they can no longer read the conference to name it.
 *
 * `count` is how many such rows there are, individual applications and
 * delegation memberships together. `null` for nought, which means "no notice".
 */
export function unpublishedApplicationsNotice(count: number): string | null {
	if (count <= 0) {
		return null;
	}

	if (count === 1) {
		return 'One of your applications is not listed because the organisers unpublished its conference. It comes back here if they publish it again.';
	}

	return `${count} of your applications are not listed because the organisers unpublished their conferences. They come back here if the conferences are published again.`;
}
