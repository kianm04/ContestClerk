import { fail, redirect } from '@sveltejs/kit';
import {
	hasApplicationWindowErrors,
	hasFormSettingsErrors,
	openingChoiceFor,
	openingOnPublish,
	openingToStore,
	readApplicationWindowForm,
	readFormSettingsForm,
	validateApplicationWindowForm,
	validateFormSettingsForm,
	type ApplicationWindowErrors,
	type ApplicationWindowValues,
	type FormSettingsErrors,
	type FormSettingsValues
} from '$lib/application-form-settings';
import {
	EMPTY_QUESTION_FORM,
	MAX_QUESTIONS,
	breaksExistingAnswers,
	hasQuestionErrors,
	isChoiceType,
	isQuestionType,
	parseOptions,
	readQuestionForm,
	toQuestionFormValues,
	validateQuestionForm,
	type QuestionFormErrors,
	type QuestionFormValues
} from '$lib/application-questions';
import type { Conference } from '$lib/conferences';
import { instantFromLocalDateTime, localDateTimeInTimezone } from '$lib/dates';
import { readDroppedPlace } from '$lib/drag-order';
import { stepUrlAfter } from '$lib/setup-steps';
import { manageApplicationFormUrl } from '$lib/urls';
import { requireManagePage, requirePermission } from '$lib/server/access';
import {
	countSubmittedApplications,
	readApplicationFormSettings,
	updateApplicationFormSettings,
	updateApplicationWindow
} from '$lib/server/application-form-settings';
import {
	createApplicationQuestion,
	deleteApplicationQuestion,
	getApplicationQuestion,
	listApplicationQuestions,
	moveApplicationQuestion,
	updateApplicationQuestion,
	type ApplicationQuestionInput
} from '$lib/server/application-questions';
import { setFlash } from '$lib/server/flash';
import { placeOrderedRow } from '$lib/server/ordered-rows';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * What every action on this page answers with when it refuses.
 *
 * One shape for all of them, so `+page.svelte` has a single thing to read rather
 * than a different answer per button. Each pair of `values` is `null` whenever
 * the refusal was not about that form, and the page then falls back to what
 * `load` read.
 */
type ApplicationFormPageResult = {
	/** What was typed into the window sections, or null when the refusal was not about them. */
	windowValues: ApplicationWindowValues | null;
	windowErrors: ApplicationWindowErrors;
	/** The same pair for the "What the form asks" section. */
	settingsValues: FormSettingsValues | null;
	settingsErrors: FormSettingsErrors;
	/** The same pair for the one question being added or edited. */
	questionValues: QuestionFormValues | null;
	questionErrors: QuestionFormErrors;
	/** A problem with the whole page rather than one field, shown in a `Notice`. */
	message: string | null;
};

/** What both "that question is not here" refusals say. */
const NO_SUCH_QUESTION = 'That question is not part of this conference.';

/**
 * The organiser gate, asked again at the top of every action.
 *
 * A form action is its own request and nothing `load` worked out reaches it, so
 * the check is made here rather than trusted from whenever the page was last
 * drawn. `specs/02-architecture/permissions.md` asks every action for that.
 */
async function requireConference(event: RequestEvent): Promise<Conference> {
	const { conference } = await requirePermission(
		event.locals,
		event.url,
		event.params.slug,
		'edit_conference'
	);

	return conference;
}

/** A moment as a `datetime-local` box holds it, or empty for a bound nobody set. */
function toLocalBox(moment: string | null, timezone: string): string {
	if (moment === null) {
		return '';
	}

	return localDateTimeInTimezone(new Date(moment), timezone);
}

/** Which question the form is posting about, or empty when the request did not say. */
function readQuestionId(formData: FormData): string {
	return String(formData.get('questionId') ?? '');
}

/** Refuse with a message about the whole page, leaving every form as the page last drew it. */
function refuse(message: string) {
	return fail(400, {
		windowValues: null,
		windowErrors: {},
		settingsValues: null,
		settingsErrors: {},
		questionValues: null,
		questionErrors: {},
		message
	} satisfies ApplicationFormPageResult);
}

/**
 * Refuse the settings form (the three sections above the questions) when
 * something in it was filled in wrongly.
 *
 * 400, because what arrived is wrong and only the person who sent it can put it
 * right. `fail` sends the page back with that status and this result as `form`,
 * so every field keeps what was typed and shows its own message at once. Both
 * halves go back, even when only one of them was wrong, because they were sent
 * as one form and the other half would otherwise lose what was typed.
 */
function refuseSettingsForm(
	windowValues: ApplicationWindowValues,
	windowErrors: ApplicationWindowErrors,
	settingsValues: FormSettingsValues,
	settingsErrors: FormSettingsErrors
) {
	return fail(400, {
		windowValues,
		windowErrors,
		settingsValues,
		settingsErrors,
		questionValues: null,
		questionErrors: {},
		message: null
	} satisfies ApplicationFormPageResult);
}

/** The same for the question being added or edited at the foot of the page. */
function refuseQuestionForm(values: QuestionFormValues, errors: QuestionFormErrors) {
	return fail(400, {
		windowValues: null,
		windowErrors: {},
		settingsValues: null,
		settingsErrors: {},
		questionValues: values,
		questionErrors: errors,
		message: null
	} satisfies ApplicationFormPageResult);
}

/**
 * Refuse the question form with a message about the whole page rather than
 * about one field, keeping what was typed.
 *
 * The two refusals that use it — the twenty-question cap and a change that
 * would strand answers already given — are both reached only after the
 * organiser has filled the form in, and neither belongs to any one box. Plain
 * `refuse` above would send `questionValues: null` and the page would fall back
 * to what `load` read, throwing the typed question away.
 */
function refuseQuestionWithMessage(values: QuestionFormValues, message: string) {
	return fail(400, {
		windowValues: null,
		windowErrors: {},
		settingsValues: null,
		settingsErrors: {},
		questionValues: values,
		questionErrors: {},
		message
	} satisfies ApplicationFormPageResult);
}

/**
 * Where the page goes once the settings are saved. While the conference is a
 * draft this page is step 3 of setting it up, and its button says "Save and
 * continue", so it goes on to the next step (Fees). Once the conference is
 * public the button says "Save changes" and the page simply comes back.
 */
function pageAfterSave(conference: Conference): string {
	const applicationFormPage = manageApplicationFormUrl(conference.slug);

	if (conference.status !== 'draft') {
		return applicationFormPage;
	}

	return stepUrlAfter(conference.slug, 'application-form') ?? applicationFormPage;
}

/**
 * The question form's text as the database takes it.
 *
 * `validateQuestionForm` has already refused a type that is not one of the five
 * the database knows, so the fallback below can never reach it. It is written
 * out because TypeScript cannot see that the check has already happened.
 *
 * Only the two choice types keep their options. Everything else stores an empty
 * list, so a question turned from a dropdown into a text box does not leave a
 * list of choices behind it that nothing will ever show again.
 */
function toQuestionInput(values: QuestionFormValues): ApplicationQuestionInput {
	const type = isQuestionType(values.type) ? values.type : 'short_text';

	return {
		label: values.label,
		helpText: values.helpText === '' ? null : values.helpText,
		type,
		options: isChoiceType(type) ? parseOptions(values.options) : [],
		isRequired: values.isRequired
	};
}

/**
 * Everything the application form page draws, on top of what the layout above
 * it has already read.
 *
 * `parent()` is a promise for whatever the layout's own `load` returned: this
 * conference and the organisation running it. The layout let in anybody whose
 * permissions open some page of this conference, and handed those permissions
 * down; the first lines below answer a 404 unless they open this one.
 *
 * Files under `$lib/server` only ever run on the server, so the queries below
 * cannot reach the browser.
 */
export const load: PageServerLoad = async ({ parent, url, locals }) => {
	const { conference, permissions } = await parent();
	// A 404 unless the reader's permissions open this page, by the table in
	// `$lib/manage-pages.ts`.
	requireManagePage(permissions, 'application-form');

	// None of the three needs another's answer, so they run side by side.
	const [questions, settings, applicationCount] = await Promise.all([
		listApplicationQuestions(locals.supabase, conference.id),
		readApplicationFormSettings(locals.supabase, conference.id),
		countSubmittedApplications(locals.supabase, conference.id)
	]);

	/*
		The moment is read once here and handed down, rather than the notice at
		the top asking the clock for itself. A component that called `new Date()`
		would write one thing while the page is being rendered on the server and
		another a moment later in the browser, and Svelte reports that as a
		hydration mismatch. The fees page passes `now` down for the same reason.
	*/
	const now = new Date();

	/*
		`?edit=<id>` is what turns the form under the list into an editor. An id
		that is not a question of this conference is not an error: the form falls
		back to the empty one, so a link that has gone stale simply shows "Add
		question" instead of a page that will not open.
	*/
	const requestedQuestionId = url.searchParams.get('edit');
	const questionBeingEdited = questions.find((question) => question.id === requestedQuestionId);

	return {
		questions,
		/*
			`settings` itself is not returned: the page reads nothing from it that
			`settingsForm` below does not already carry, and a `load` that hands the
			browser data nothing draws is a thing the next reader has to check before
			they can change it.
		*/
		/** How many people have really applied. Two settings lock once this is above nothing. */
		applicationCount,
		/** What the window sections show: the saved values, the two moments as local boxes. */
		windowForm: {
			opensWhen: openingChoiceFor(conference.applicationsOpenAt, now),
			applicationsOpenAt: toLocalBox(conference.applicationsOpenAt, conference.timezone),
			applicationsCloseAt: toLocalBox(conference.applicationsCloseAt, conference.timezone),
			acceptsIndividualApplications: conference.acceptsIndividualApplications,
			acceptsDelegations: conference.acceptsDelegations
		} satisfies ApplicationWindowValues,
		/** What the "what the form asks" section shows. Every field is text or a tick. */
		settingsForm: {
			committeePreferenceCount: String(settings.committeePreferenceCount),
			askMotivation: settings.askMotivation,
			positionPaperRequired: conference.positionPaperRequired,
			positionPaperDeadline: toLocalBox(conference.positionPaperDeadline, conference.timezone)
		} satisfies FormSettingsValues,
		/** What the question form shows: an empty form, or the question `?edit=` names. */
		questionForm: questionBeingEdited
			? toQuestionFormValues(questionBeingEdited)
			: EMPTY_QUESTION_FORM,
		/** The question being edited, or null. It is what turns the form into "Save question". */
		editQuestionId: questionBeingEdited?.id ?? null,
		now: now.toISOString()
	};
};

export const actions: Actions = {
	/**
	 * Save the three settings sections together: when people may apply, who
	 * may, and what the form asks. The footer's "Save and continue" (a draft)
	 * and "Save changes" (a public conference) both send this. See
	 * `pageAfterSave` for where each one goes.
	 */
	save: async (event) => {
		const conference = await requireConference(event);

		// Both are context the rules need: the saved count is what a new count may
		// not go below, and the number of applications is what decides whether that
		// rule applies at all.
		// Neither needs the other's answer, so they run side by side.
		const [settings, applicationCount] = await Promise.all([
			readApplicationFormSettings(event.locals.supabase, conference.id),
			countSubmittedApplications(event.locals.supabase, conference.id)
		]);

		const formData = await event.request.formData();
		const windowValues = readApplicationWindowForm(formData);
		const settingsValues = readFormSettingsForm(formData);

		// "As soon as I publish" stands for an opening time of its own, and both
		// the closing time and the position paper deadline are checked against
		// whichever opening is being saved.
		const now = new Date();
		const openingOnPublishLocal = toLocalBox(
			openingOnPublish(conference.applicationsOpenAt, now),
			conference.timezone
		);
		const opensAt = openingToStore(windowValues, {
			savedOpensAt: conference.applicationsOpenAt,
			timezone: conference.timezone,
			now
		});

		const windowErrors = validateApplicationWindowForm(windowValues, {
			startDate: conference.startDate,
			openingOnPublishLocal
		});
		const settingsErrors = validateFormSettingsForm(settingsValues, {
			applicationsOpenAtLocal: toLocalBox(opensAt, conference.timezone),
			endDate: conference.endDate,
			savedPreferenceCount: settings.committeePreferenceCount,
			hasApplications: applicationCount > 0
		});

		if (hasApplicationWindowErrors(windowErrors) || hasFormSettingsErrors(settingsErrors)) {
			return refuseSettingsForm(windowValues, windowErrors, settingsValues, settingsErrors);
		}

		// The boxes hold a time in the conference's own timezone, so that is the
		// zone they are read back in. An empty closing box answers `null`, a
		// window that stays open.
		await updateApplicationWindow(event.locals.supabase, conference.id, {
			applicationsOpenAt: opensAt,
			applicationsCloseAt: instantFromLocalDateTime(
				windowValues.applicationsCloseAt,
				conference.timezone
			),
			acceptsIndividualApplications: windowValues.acceptsIndividualApplications,
			acceptsDelegations: windowValues.acceptsDelegations
		});

		await updateApplicationFormSettings(event.locals.supabase, conference.id, {
			committeePreferenceCount: Number(settingsValues.committeePreferenceCount),
			askMotivation: settingsValues.askMotivation,
			positionPaperRequired: settingsValues.positionPaperRequired,
			positionPaperDeadline: instantFromLocalDateTime(
				settingsValues.positionPaperDeadline,
				conference.timezone
			)
		});

		// A redirecting action cannot return anything, so the message travels in a
		// one-shot cookie that the root layout reads and throws away.
		setFlash(event.cookies, { tone: 'success', message: 'Application form saved.' });
		redirect(303, pageAfterSave(conference));
	},

	/** Add one custom question to the foot of the list. */
	addQuestion: async (event) => {
		const conference = await requireConference(event);

		const formData = await event.request.formData();
		const values = readQuestionForm(formData);

		const questions = await listApplicationQuestions(event.locals.supabase, conference.id);

		// `05-pages/organiser/application-form.md` caps the list, so that an apply
		// form stays something a delegate will actually finish.
		if (questions.length >= MAX_QUESTIONS) {
			return refuseQuestionWithMessage(values, `You can add up to ${MAX_QUESTIONS} questions.`);
		}

		const errors = validateQuestionForm(values);

		if (hasQuestionErrors(errors)) {
			return refuseQuestionForm(values, errors);
		}

		await createApplicationQuestion(event.locals.supabase, conference.id, toQuestionInput(values));

		setFlash(event.cookies, { tone: 'success', message: 'Question added.' });
		redirect(303, manageApplicationFormUrl(event.params.slug));
	},

	/** Save the question the form is editing, named by its hidden `questionId`. */
	updateQuestion: async (event) => {
		const conference = await requireConference(event);

		const formData = await event.request.formData();
		const values = readQuestionForm(formData);

		// The hidden field is only on the form while it is editing, so nothing but
		// a request put together by hand arrives without it. Asked before
		// `getApplicationQuestion`, because an empty id is not a question the
		// database can even look for.
		if (values.questionId === '') {
			return refuse('That request did not say which question to save.');
		}

		// `getApplicationQuestion` asks inside this conference, so an id belonging
		// to somebody else's conference simply is not there.
		const saved = await getApplicationQuestion(
			event.locals.supabase,
			conference.id,
			values.questionId
		);

		if (!saved) {
			return refuse(NO_SUCH_QUESTION);
		}

		const errors = validateQuestionForm(values);

		if (hasQuestionErrors(errors)) {
			return refuseQuestionForm(values, errors);
		}

		/*
			Wording a question better is always allowed. Changing what kind of answer
			it takes, or taking an option away, is not, once somebody has answered
			it: the answers already given are kept under the question's own id, and
			they would no longer mean what they say. `breaksExistingAnswers` is what
			knows which changes those are.
		*/
		const applicationCount = await countSubmittedApplications(event.locals.supabase, conference.id);

		if (applicationCount > 0 && breaksExistingAnswers(saved, values)) {
			return refuseQuestionWithMessage(
				values,
				'This question already has answers. Add a new question instead.'
			);
		}

		await updateApplicationQuestion(event.locals.supabase, saved.id, toQuestionInput(values));

		setFlash(event.cookies, { tone: 'success', message: 'Question saved.' });
		redirect(303, manageApplicationFormUrl(event.params.slug));
	},

	/**
	 * Swap one question with the neighbour above or below it.
	 *
	 * Every row has a small form of its own carrying nothing but the question's
	 * id, and the two arrows inside it post to `?/moveQuestion&direction=up` and
	 * `…&direction=down`. SvelteKit lets a form action carry a query string of
	 * its own, which is the trick the fees list uses: it means one small form per
	 * row instead of two, and it is an ordinary HTML form either way, so
	 * reordering works with JavaScript switched off.
	 */
	moveQuestion: async (event) => {
		const conference = await requireConference(event);

		const direction = event.url.searchParams.get('direction');

		if (direction !== 'up' && direction !== 'down') {
			// Only a request somebody put together by hand can get here: the two
			// buttons on every row always name one of the two directions.
			return refuse('A question can only move up or down.');
		}

		const formData = await event.request.formData();
		const questionId = readQuestionId(formData);

		if (questionId === '') {
			return refuse('That request did not say which question to move.');
		}

		await moveApplicationQuestion(event.locals.supabase, conference.id, questionId, direction);

		// Straight back to the list with no flash: the question has visibly changed
		// places, which says everything a message would.
		redirect(303, manageApplicationFormUrl(event.params.slug));
	},

	/**
	 * Put one question at the place it was dragged to (T132). The list's hidden
	 * drop form posts the question's id and its new `place`, counting from 1.
	 * Dragging needs JavaScript, so the arrows of `moveQuestion` stay the way
	 * without it.
	 */
	moveQuestionTo: async (event) => {
		const conference = await requireConference(event);

		const formData = await event.request.formData();
		const questionId = readQuestionId(formData);
		const toIndex = readDroppedPlace(formData.get('place'));

		if (questionId === '' || toIndex === null) {
			return refuse('That request did not say which question to move, or where.');
		}

		const isPlaced = await placeOrderedRow(
			event.locals.supabase,
			{ table: 'application_questions', ownerColumn: 'conference_id', ownerId: conference.id },
			questionId,
			toIndex
		);

		if (!isPlaced) {
			return refuse('That question is no longer on the form.');
		}

		redirect(303, manageApplicationFormUrl(event.params.slug));
	},

	/** Delete one question. The answers already given to it stay where they are. */
	deleteQuestion: async (event) => {
		const conference = await requireConference(event);

		const formData = await event.request.formData();
		const questionId = readQuestionId(formData);

		// Asked before `getApplicationQuestion`, for the reason `updateQuestion`
		// gives above.
		if (questionId === '') {
			return refuse('That request did not say which question to delete.');
		}

		const question = await getApplicationQuestion(event.locals.supabase, conference.id, questionId);

		if (!question) {
			return refuse(NO_SUCH_QUESTION);
		}

		await deleteApplicationQuestion(event.locals.supabase, question.id);

		setFlash(event.cookies, { tone: 'success', message: 'Question deleted.' });
		redirect(303, manageApplicationFormUrl(event.params.slug));
	}
};
