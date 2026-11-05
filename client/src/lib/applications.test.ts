import { describe, expect, it } from 'vitest';
import { MAX_CHOICE_OPTIONS, type ApplicationQuestion } from './application-questions';
import {
	ageWarning,
	ANSWER_MAX_LENGTH,
	answerText,
	APPLICATION_EMPTY_TITLES,
	APPLICATION_SORT_OPTIONS,
	APPLICATION_STATUS_TABS,
	APPLICATION_TAB_LABELS,
	applicationAnswerRows,
	applicationCountsSentence,
	applicationCsvRows,
	applicationListConference,
	applicationRowLine,
	applicationsCsvFileName,
	applicationStatusSentence,
	bulkDecisionFlash,
	canApply,
	canEditApplication,
	canFinishApplication,
	cleanApplicationForm,
	delegationRowLine,
	EMPTY_APPLICATION_LIST_QUERY,
	EMPTY_APPLICATION_STATUS_COUNTS,
	firstErrorFieldName,
	hasApplicationErrors,
	isListedApplicationStatus,
	mergeIntoApplicationList,
	nextStatuses,
	parseApplicationListQuery,
	readApplicationForm,
	readBulkSeatChoices,
	toApplicationFormValues,
	unpublishedApplicationsNotice,
	validateApplication,
	validateBulkSeatChoices,
	withoutPastConferences,
	type ApplicationExportRow,
	type ApplicationFormValues,
	type ApplicationListConference,
	type ApplicationListEntry,
	type ApplicationStatusCounts,
	type ApplicationValidationContext,
	type CommitteeChoice,
	type MyApplication,
	type MyApplicationListItem,
	type MyDelegationListItem
} from './applications';
import type { Conference } from './conferences';

/**
 * One conference every test starts from: published, taking applications from
 * individuals, with no dates on either side of its window, which counts as
 * open. Tests spread it and change only the field they are about.
 */
const THIMUN: Conference = {
	id: 'conference-thimun',
	slug: 'thimun-2027',
	name: 'THIMUN 2027',
	description: null,
	organizationName: 'THIMUN Foundation',
	organizationSlug: 'thimun-foundation',
	city: 'The Hague',
	countryCode: 'NL',
	countryName: 'Netherlands',
	locationMode: 'in_person',
	venueStatus: 'tba',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	feeStatus: 'undecided',
	applicationOpenMode: 'on_publish',
	startDate: '2027-01-24',
	endDate: '2027-01-29',
	websiteUrl: null,
	bannerPath: null,
	logoPath: null,
	level: 'high_school',
	status: 'published',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: 3000,
	applicationsOpenAt: null,
	applicationsCloseAt: null,
	committeeCount: 8,
	committeeNames: [],
	tagline: null,
	venueName: null,
	venueAddress: null,
	contactEmail: null,
	instagramUrl: null,
	contactPhone: null,
	facebookUrl: null,
	linkedinUrl: null,
	youtubeUrl: null,
	tiktokUrl: null,
	language: 'English',
	minAge: 14,
	maxAge: 19,
	positionPaperRequired: false,
	positionPaperDeadline: null,
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

/** The moment every test that needs a clock pretends it is. */
const NOW = new Date('2026-09-17T12:00:00Z');

/** The two committees the conference's selects offer. */
const COMMITTEES: CommitteeChoice[] = [
	{ id: 'committee-unsc', name: 'Security Council', abbreviation: 'UNSC' },
	{ id: 'committee-ecofin', name: 'Economic and Financial Committee', abbreviation: 'ECOFIN' }
];

/** The one question the conference marks required. */
const CHAIRED_QUESTION: ApplicationQuestion = {
	id: 'question-chaired',
	label: 'Have you chaired before?',
	helpText: null,
	type: 'short_text',
	options: [],
	isRequired: true,
	position: 1
};

/** An optional "Pick one", for the tests about answers that are not on the list. */
const SHIRT_QUESTION: ApplicationQuestion = {
	id: 'question-shirt',
	label: 'Which shirt size do you take?',
	helpText: null,
	type: 'single_choice',
	options: ['S', 'M', 'L'],
	isRequired: false,
	position: 2
};

/** An optional "Pick several", whose answer is a list rather than a piece of text. */
const LANGUAGES_QUESTION: ApplicationQuestion = {
	id: 'question-languages',
	label: 'Which languages do you speak?',
	helpText: null,
	type: 'multiple_choice',
	options: ['English', 'French', 'Spanish'],
	isRequired: false,
	position: 3
};

/** An optional tick box, which is stored as 'yes' or ''. */
const VEGETARIAN_QUESTION: ApplicationQuestion = {
	id: 'question-vegetarian',
	label: 'Do you need a vegetarian meal?',
	helpText: null,
	type: 'checkbox',
	options: [],
	isRequired: false,
	position: 4
};

/** A draft of the reader's own, for the tests that start from a saved row. */
const MY_DRAFT: MyApplication = {
	id: 'application-daniel',
	conferenceId: 'conference-thimun',
	status: 'draft',
	committeePreferences: ['committee-unsc'],
	seatPreferences: 'Any P5 country',
	motivation: 'I want to learn how the Council really works.',
	answers: { 'question-chaired': 'No' },
	submittedAt: null,
	decisionNote: null,
	updatedAt: '2026-09-17T12:00:00Z'
};

/** A form filled in so that nothing is wrong with it. */
const GOOD_FORM: ApplicationFormValues = {
	committeePreferences: ['committee-unsc', 'committee-ecofin'],
	seatPreferences: 'Any P5 country',
	motivation: 'I want to learn how the Council really works.',
	answers: { 'question-chaired': 'No' },
	hasConsented: true
};

/** A conference asking for two preferences, a motivation and the one required question. */
const CONTEXT: ApplicationValidationContext = {
	preferenceCount: 2,
	asksMotivation: true,
	questions: [CHAIRED_QUESTION],
	missingProfileFields: []
};

describe('canApply', () => {
	it('lets somebody apply to a published conference with an open window', () => {
		expect(canApply(THIMUN, null, null, NOW)).toBe(null);
	});

	it('refuses a conference that is not published', () => {
		const conference: Conference = { ...THIMUN, status: 'draft' };

		expect(canApply(conference, null, null, NOW)).toEqual({
			kind: 'not_published',
			message: 'This conference is not taking applications.'
		});
	});

	it('refuses a conference that only takes delegations', () => {
		const conference: Conference = { ...THIMUN, acceptsIndividualApplications: false };

		expect(canApply(conference, null, null, NOW)).toEqual({
			kind: 'individuals_not_accepted',
			message: 'This conference does not accept individual applications.'
		});
	});

	it('refuses somebody whose application has already been decided', () => {
		const decided: MyApplication = { ...MY_DRAFT, status: 'rejected' };

		expect(canApply(THIMUN, decided, null, NOW)).toEqual({
			kind: 'already_applied',
			message: 'You already applied.'
		});
	});

	it('lets somebody carry on with a draft of their own', () => {
		expect(canApply(THIMUN, MY_DRAFT, null, NOW)).toBe(null);
	});

	it('lets somebody reopen an application they have already submitted', () => {
		const submitted: MyApplication = { ...MY_DRAFT, status: 'submitted' };

		expect(canApply(THIMUN, submitted, null, NOW)).toBe(null);
	});

	/**
	 * The delegation the reader is already in. It is the whole thing rather than
	 * its name because the apply page hangs a link to `/delegations/[id]` on the
	 * sentence this refusal writes.
	 */
	const MY_DELEGATION = { id: 'delegation-delft', name: 'Delft University' };

	it('refuses somebody who is already in a delegation', () => {
		expect(canApply(THIMUN, null, MY_DELEGATION, NOW)).toEqual({
			kind: 'in_delegation',
			message: 'You are part of the Delft University delegation.'
		});
	});

	it('refuses a conference whose organiser has not opened applications yet', () => {
		const conference: Conference = {
			...THIMUN,
			applicationOpenMode: 'manual',
			applicationsOpenAt: null
		};

		expect(canApply(conference, null, null, NOW)).toEqual({
			kind: 'not_yet_open',
			message: 'Applications are not open yet.'
		});
	});

	it('refuses a window that has not opened yet, and says which day it opens', () => {
		const conference: Conference = { ...THIMUN, applicationsOpenAt: '2026-11-02T12:00:00Z' };

		expect(canApply(conference, null, null, NOW)).toEqual({
			kind: 'not_yet_open',
			message: 'Applications open on 2 Nov 2026.'
		});
	});

	it('refuses a window that has closed, and says which day it closed', () => {
		const conference: Conference = {
			...THIMUN,
			applicationsOpenAt: '2026-01-05T12:00:00Z',
			applicationsCloseAt: '2026-06-01T12:00:00Z'
		};

		expect(canApply(conference, null, null, NOW)).toEqual({
			kind: 'closed',
			message: 'Applications closed on 1 Jun 2026.'
		});
	});

	it('gives the first reason rather than every reason', () => {
		// The questions are asked in one order and the first "yes" wins, so an
		// unpublished conference whose window has also closed is turned away for
		// not being published.
		const conference: Conference = {
			...THIMUN,
			status: 'draft',
			applicationsCloseAt: '2026-06-01T12:00:00Z'
		};

		expect(canApply(conference, null, MY_DELEGATION, NOW)?.kind).toBe('not_published');
	});
});

describe('readApplicationForm', () => {
	/** The form a filled-in apply page sends. */
	function filledInForm(): FormData {
		const formData = new FormData();

		formData.set('committee_1', 'committee-unsc');
		formData.set('committee_2', '  committee-ecofin  ');
		formData.set('seatPreferences', '  Any P5 country  ');
		formData.set('motivation', 'I want to learn how the Council really works.');
		formData.set('question_question-chaired', '  No  ');
		formData.append('question_question-languages', 'English');
		formData.append('question_question-languages', 'French');
		formData.set('question_question-vegetarian', 'on');
		formData.set('consent', 'on');

		return formData;
	}

	it('reads every field of a filled-in form', () => {
		const questions = [CHAIRED_QUESTION, LANGUAGES_QUESTION, VEGETARIAN_QUESTION];

		expect(readApplicationForm(filledInForm(), questions, 2)).toEqual({
			committeePreferences: ['committee-unsc', 'committee-ecofin'],
			seatPreferences: 'Any P5 country',
			motivation: 'I want to learn how the Council really works.',
			answers: {
				'question-chaired': 'No',
				'question-languages': ['English', 'French'],
				'question-vegetarian': 'yes'
			},
			hasConsented: true
		});
	});

	it('gives every select an entry, even one left on "not chosen"', () => {
		const formData = new FormData();

		formData.set('committee_1', 'committee-unsc');

		const values = readApplicationForm(formData, [], 3);

		expect(values.committeePreferences).toEqual(['committee-unsc', '', '']);
	});

	it('stores an unticked box as an empty answer rather than as nothing', () => {
		const values = readApplicationForm(new FormData(), [VEGETARIAN_QUESTION], 0);

		expect(values.answers).toEqual({ 'question-vegetarian': '' });
	});

	it('reads an unanswered "Pick several" as an empty list', () => {
		const values = readApplicationForm(new FormData(), [LANGUAGES_QUESTION], 0);

		expect(values.answers).toEqual({ 'question-languages': [] });
	});

	it('ignores an answer to a question this conference does not ask', () => {
		// A hand-made request can carry another conference's question. Only the
		// questions the form drew are read, so the extra one goes nowhere.
		const formData = filledInForm();

		formData.set('question_question-from-elsewhere', 'Yes');

		const values = readApplicationForm(formData, [CHAIRED_QUESTION], 0);

		expect(values.answers).toEqual({ 'question-chaired': 'No' });
	});

	it('counts the consent box as unticked when it does not arrive', () => {
		const formData = filledInForm();

		formData.delete('consent');

		expect(readApplicationForm(formData, [], 0).hasConsented).toBe(false);
	});
});

describe('cleanApplicationForm', () => {
	it('keeps the committees the conference has, in the order they were chosen', () => {
		const values: ApplicationFormValues = {
			...GOOD_FORM,
			committeePreferences: ['committee-ecofin', 'committee-unsc']
		};

		const cleaned = cleanApplicationForm(values, COMMITTEES, [CHAIRED_QUESTION]);

		expect(cleaned.committeePreferences).toEqual(['committee-ecofin', 'committee-unsc']);
	});

	it('drops a select that was left on "not chosen"', () => {
		const values: ApplicationFormValues = {
			...GOOD_FORM,
			committeePreferences: ['', 'committee-unsc', '']
		};

		const cleaned = cleanApplicationForm(values, COMMITTEES, [CHAIRED_QUESTION]);

		expect(cleaned.committeePreferences).toEqual(['committee-unsc']);
	});

	it('drops a committee that is not one of this conference', () => {
		const values: ApplicationFormValues = {
			...GOOD_FORM,
			committeePreferences: ['committee-unsc', 'committee-somewhere-else']
		};

		const cleaned = cleanApplicationForm(values, COMMITTEES, [CHAIRED_QUESTION]);

		expect(cleaned.committeePreferences).toEqual(['committee-unsc']);
	});

	it('keeps only the first of a committee chosen twice', () => {
		// The database refuses a repeated preference on a draft as well, so a
		// draft that kept both would fail to save at all.
		const values: ApplicationFormValues = {
			...GOOD_FORM,
			committeePreferences: ['committee-unsc', 'committee-unsc', 'committee-ecofin']
		};

		const cleaned = cleanApplicationForm(values, COMMITTEES, [CHAIRED_QUESTION]);

		expect(cleaned.committeePreferences).toEqual(['committee-unsc', 'committee-ecofin']);
	});

	it('trims the two text boxes and cuts them to their limits', () => {
		const values: ApplicationFormValues = {
			...GOOD_FORM,
			seatPreferences: `  ${'a'.repeat(400)}  `,
			motivation: `  ${'b'.repeat(2000)}  `
		};

		const cleaned = cleanApplicationForm(values, COMMITTEES, [CHAIRED_QUESTION]);

		expect(cleaned.seatPreferences).toHaveLength(300);
		expect(cleaned.motivation).toHaveLength(1500);
	});

	it('drops an answer to a question this conference does not ask', () => {
		const values: ApplicationFormValues = {
			...GOOD_FORM,
			answers: { 'question-chaired': '  No  ', 'question-from-elsewhere': 'Yes' }
		};

		const cleaned = cleanApplicationForm(values, COMMITTEES, [CHAIRED_QUESTION]);

		expect(cleaned.answers).toEqual({ 'question-chaired': 'No' });
	});

	it('drops the blank entries of a list answer', () => {
		const values: ApplicationFormValues = {
			...GOOD_FORM,
			answers: { 'question-languages': ['English', '  ', ' French '] }
		};

		const cleaned = cleanApplicationForm(values, COMMITTEES, [LANGUAGES_QUESTION]);

		expect(cleaned.answers).toEqual({ 'question-languages': ['English', 'French'] });
	});

	it('cuts an answer, and each choice in a list, to the 4000 characters the column holds', () => {
		const values: ApplicationFormValues = {
			...GOOD_FORM,
			answers: {
				'question-chaired': `  ${'a'.repeat(4999)}  `,
				'question-languages': ['b'.repeat(4001)]
			}
		};

		const cleaned = cleanApplicationForm(values, COMMITTEES, [
			CHAIRED_QUESTION,
			LANGUAGES_QUESTION
		]);

		expect(cleaned.answers['question-chaired']).toHaveLength(ANSWER_MAX_LENGTH);
		expect(cleaned.answers['question-languages']).toEqual(['b'.repeat(ANSWER_MAX_LENGTH)]);
	});

	it('keeps the first twenty choices of a list, the most the column holds', () => {
		const ticked = Array.from({ length: 21 }, (_, index) => `Language ${index + 1}`);
		const values: ApplicationFormValues = {
			...GOOD_FORM,
			answers: { 'question-languages': ticked }
		};

		const cleaned = cleanApplicationForm(values, COMMITTEES, [LANGUAGES_QUESTION]);

		expect(cleaned.answers['question-languages']).toEqual(ticked.slice(0, MAX_CHOICE_OPTIONS));
	});
});

describe('validateApplication', () => {
	it('finds nothing wrong with a form that is properly filled in', () => {
		expect(validateApplication(GOOD_FORM, CONTEXT)).toEqual({});
	});

	it('asks for a first choice of committee', () => {
		const values: ApplicationFormValues = { ...GOOD_FORM, committeePreferences: ['', ''] };

		expect(validateApplication(values, CONTEXT).committeePreferences).toEqual([
			'Please pick your first choice of committee.',
			''
		]);
	});

	it('leaves the later choices alone when they are empty', () => {
		const values: ApplicationFormValues = {
			...GOOD_FORM,
			committeePreferences: ['committee-unsc', '']
		};

		expect(validateApplication(values, CONTEXT).committeePreferences).toBe(undefined);
	});

	it('asks nothing of the committees when the conference asks for none', () => {
		const context: ApplicationValidationContext = { ...CONTEXT, preferenceCount: 0 };
		const values: ApplicationFormValues = { ...GOOD_FORM, committeePreferences: [] };

		expect(validateApplication(values, context).committeePreferences).toBe(undefined);
	});

	it('marks the later select when the same committee is chosen twice', () => {
		const values: ApplicationFormValues = {
			...GOOD_FORM,
			committeePreferences: ['committee-unsc', 'committee-unsc']
		};

		expect(validateApplication(values, CONTEXT).committeePreferences).toEqual([
			'',
			'Please pick different committees for each choice.'
		]);
	});

	it('asks for a motivation when the conference asks for one', () => {
		const values: ApplicationFormValues = { ...GOOD_FORM, motivation: '   ' };

		expect(validateApplication(values, CONTEXT).motivation).toBe(
			'Please tell the organisers why you want to take part.'
		);
	});

	it('asks for no motivation when the conference does not ask for one', () => {
		const context: ApplicationValidationContext = { ...CONTEXT, asksMotivation: false };
		const values: ApplicationFormValues = { ...GOOD_FORM, motivation: '' };

		expect(validateApplication(values, context).motivation).toBe(undefined);
	});

	it('refuses a motivation longer than 1500 characters', () => {
		const values: ApplicationFormValues = { ...GOOD_FORM, motivation: 'a'.repeat(1501) };

		expect(validateApplication(values, CONTEXT).motivation).toBe(
			'Your motivation can be at most 1500 characters.'
		);
	});

	it('refuses seat preferences longer than 300 characters', () => {
		const values: ApplicationFormValues = { ...GOOD_FORM, seatPreferences: 'a'.repeat(301) };

		expect(validateApplication(values, CONTEXT).seatPreferences).toBe(
			'Please keep this under 300 characters.'
		);
	});

	it('asks for an answer to a required question', () => {
		const values: ApplicationFormValues = { ...GOOD_FORM, answers: { 'question-chaired': '  ' } };

		expect(validateApplication(values, CONTEXT).answers).toEqual({
			'question-chaired': 'Please answer this question.'
		});
	});

	it('counts an empty list as no answer to a required question', () => {
		const required: ApplicationQuestion = { ...LANGUAGES_QUESTION, isRequired: true };
		const context: ApplicationValidationContext = { ...CONTEXT, questions: [required] };
		const values: ApplicationFormValues = { ...GOOD_FORM, answers: { 'question-languages': [] } };

		expect(validateApplication(values, context).answers).toEqual({
			'question-languages': 'Please answer this question.'
		});
	});

	it('leaves an optional question that was not answered alone', () => {
		const context: ApplicationValidationContext = { ...CONTEXT, questions: [SHIRT_QUESTION] };
		const values: ApplicationFormValues = { ...GOOD_FORM, answers: { 'question-shirt': '' } };

		expect(validateApplication(values, context).answers).toBe(undefined);
	});

	it('refuses a choice that is not one of the options the question offers', () => {
		const context: ApplicationValidationContext = { ...CONTEXT, questions: [SHIRT_QUESTION] };
		const values: ApplicationFormValues = { ...GOOD_FORM, answers: { 'question-shirt': 'XXL' } };

		expect(validateApplication(values, context).answers).toEqual({
			'question-shirt': 'Please pick one of the options.'
		});
	});

	it('refuses a list holding one choice that is not on the list', () => {
		const context: ApplicationValidationContext = { ...CONTEXT, questions: [LANGUAGES_QUESTION] };
		const values: ApplicationFormValues = {
			...GOOD_FORM,
			answers: { 'question-languages': ['English', 'Klingon'] }
		};

		expect(validateApplication(values, context).answers).toEqual({
			'question-languages': 'Please pick one of the options.'
		});
	});

	it('refuses an answer longer than 4000 characters, and takes one of exactly 4000', () => {
		const tooLong: ApplicationFormValues = {
			...GOOD_FORM,
			answers: { 'question-chaired': 'a'.repeat(ANSWER_MAX_LENGTH + 1) }
		};
		const longest: ApplicationFormValues = {
			...GOOD_FORM,
			answers: { 'question-chaired': 'a'.repeat(ANSWER_MAX_LENGTH) }
		};

		expect(validateApplication(tooLong, CONTEXT).answers).toEqual({
			'question-chaired': 'Please keep this answer under 4000 characters.'
		});
		expect(validateApplication(longest, CONTEXT).answers).toBe(undefined);
	});

	it('refuses more than twenty ticks on a question saved with more options than that', () => {
		const options = Array.from({ length: 25 }, (_, index) => `Language ${index + 1}`);
		const manyLanguages: ApplicationQuestion = { ...LANGUAGES_QUESTION, options };
		const context: ApplicationValidationContext = { ...CONTEXT, questions: [manyLanguages] };
		const tooMany: ApplicationFormValues = {
			...GOOD_FORM,
			answers: { 'question-languages': options.slice(0, 21) }
		};
		const most: ApplicationFormValues = {
			...GOOD_FORM,
			answers: { 'question-languages': options.slice(0, MAX_CHOICE_OPTIONS) }
		};

		expect(validateApplication(tooMany, context).answers).toEqual({
			'question-languages': 'Please pick at most 20 options.'
		});
		expect(validateApplication(most, context).answers).toBe(undefined);
	});

	it('asks for consent when the box is not ticked', () => {
		const values: ApplicationFormValues = { ...GOOD_FORM, hasConsented: false };

		expect(validateApplication(values, CONTEXT).consent).toBe(
			'Please agree so the organisers can see your details.'
		);
	});

	it('names the profile fields that are still empty', () => {
		const context: ApplicationValidationContext = {
			...CONTEXT,
			missingProfileFields: ['fullName', 'institutionName']
		};

		expect(validateApplication(GOOD_FORM, context).form).toBe(
			'Complete your profile before submitting: your name, your institution.'
		);
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const values: ApplicationFormValues = {
			committeePreferences: ['', ''],
			seatPreferences: 'a'.repeat(301),
			motivation: '',
			answers: { 'question-chaired': '' },
			hasConsented: false
		};

		const errors = validateApplication(values, CONTEXT);

		expect(errors.committeePreferences?.[0]).toBe('Please pick your first choice of committee.');
		expect(errors.seatPreferences).toBe('Please keep this under 300 characters.');
		expect(errors.motivation).toBe('Please tell the organisers why you want to take part.');
		expect(errors.answers).toEqual({ 'question-chaired': 'Please answer this question.' });
		expect(errors.consent).toBe('Please agree so the organisers can see your details.');
	});
});

describe('hasApplicationErrors', () => {
	it('is quiet about a form with nothing wrong with it', () => {
		expect(hasApplicationErrors({})).toBe(false);
	});

	it('is quiet when every select is fine', () => {
		// A select that is fine carries an empty string rather than no entry at
		// all, so the list is there whichever answer this gives.
		expect(hasApplicationErrors({ committeePreferences: ['', ''] })).toBe(false);
	});

	it('finds a message on one of the selects', () => {
		const errors = {
			committeePreferences: ['', 'Please pick different committees for each choice.']
		};

		expect(hasApplicationErrors(errors)).toBe(true);
	});

	it('finds a message on one of the questions', () => {
		const errors = { answers: { 'question-chaired': 'Please answer this question.' } };

		expect(hasApplicationErrors(errors)).toBe(true);
	});

	it('finds a problem with the whole form', () => {
		expect(
			hasApplicationErrors({ form: 'Complete your profile before submitting: your name.' })
		).toBe(true);
	});

	it('finds a message on any single field', () => {
		expect(
			hasApplicationErrors({ motivation: 'Your motivation can be at most 1500 characters.' })
		).toBe(true);
		expect(
			hasApplicationErrors({ seatPreferences: 'Please keep this under 300 characters.' })
		).toBe(true);
		expect(
			hasApplicationErrors({ consent: 'Please agree so the organisers can see your details.' })
		).toBe(true);
	});
});

describe('firstErrorFieldName', () => {
	/** The questions in the order the form asks them, which is the order it looks in. */
	const QUESTIONS = [SHIRT_QUESTION, LANGUAGES_QUESTION, VEGETARIAN_QUESTION];

	it('has nowhere to send anybody when nothing is wrong', () => {
		expect(firstErrorFieldName({}, QUESTIONS)).toBeNull();
	});

	it('numbers a committee select the way the form names it', () => {
		expect(
			firstErrorFieldName(
				{ committeePreferences: ['', 'Please pick different committees for each choice.'] },
				QUESTIONS
			)
		).toBe('committee_2');
	});

	it('takes the fields in the order the form draws them', () => {
		// Each of these has everything below it still wrong, so the one it picks is
		// the one that comes first on the form rather than the only one there is.
		const committeeMessage = 'Please pick your first choice of committee.';
		const seatMessage = 'Please keep this under 300 characters.';
		const motivationMessage = 'Please tell the organisers why you want to take part.';
		const answerMessage = 'Please pick one of the options.';
		const consentMessage = 'Please agree so the organisers can see your details.';

		const fromTheConsent = { consent: consentMessage };
		const fromTheQuestions = { answers: { [SHIRT_QUESTION.id]: answerMessage }, ...fromTheConsent };
		const fromTheMotivation = { motivation: motivationMessage, ...fromTheQuestions };
		const fromTheSeats = { seatPreferences: seatMessage, ...fromTheMotivation };
		const everythingIsWrong = { committeePreferences: [committeeMessage], ...fromTheSeats };

		expect(firstErrorFieldName(everythingIsWrong, QUESTIONS)).toBe('committee_1');
		expect(firstErrorFieldName(fromTheSeats, QUESTIONS)).toBe('seatPreferences');
		expect(firstErrorFieldName(fromTheMotivation, QUESTIONS)).toBe('motivation');
		expect(firstErrorFieldName(fromTheQuestions, QUESTIONS)).toBe(`question_${SHIRT_QUESTION.id}`);
		expect(firstErrorFieldName(fromTheConsent, QUESTIONS)).toBe('consent');
	});

	it('asks the questions in their own order, not the order the answers are keyed in', () => {
		// The later question is listed first here, and the earlier one still wins.
		const errors = {
			answers: {
				[VEGETARIAN_QUESTION.id]: 'Please answer this question.',
				[LANGUAGES_QUESTION.id]: 'Please answer this question.'
			}
		};

		expect(firstErrorFieldName(errors, QUESTIONS)).toBe(`question_${LANGUAGES_QUESTION.id}`);
	});

	it('sends nobody anywhere for a problem with the whole form', () => {
		// `errors.form` is drawn at the top, where the reader already is.
		expect(
			firstErrorFieldName({ form: 'This conference is not taking applications.' }, QUESTIONS)
		).toBeNull();
	});
});

describe('toApplicationFormValues', () => {
	it('pads the committee list out to one entry per select', () => {
		const values = toApplicationFormValues(MY_DRAFT, 3);

		expect(values.committeePreferences).toEqual(['committee-unsc', '', '']);
	});

	it('cuts the committee list down when the conference now asks for fewer', () => {
		const application: MyApplication = {
			...MY_DRAFT,
			committeePreferences: ['committee-unsc', 'committee-ecofin']
		};

		expect(toApplicationFormValues(application, 1).committeePreferences).toEqual([
			'committee-unsc'
		]);
	});

	it('brings the answers and the two text boxes back as they were saved', () => {
		const values = toApplicationFormValues(MY_DRAFT, 1);

		expect(values.seatPreferences).toBe('Any P5 country');
		expect(values.motivation).toBe('I want to learn how the Council really works.');
		expect(values.answers).toEqual({ 'question-chaired': 'No' });
	});

	it('starts the consent box unticked for a draft that was never submitted', () => {
		expect(toApplicationFormValues(MY_DRAFT, 1).hasConsented).toBe(false);
	});

	it('starts it ticked again for a row that was submitted once', () => {
		const application: MyApplication = {
			...MY_DRAFT,
			status: 'submitted',
			submittedAt: '2026-09-08T12:02:00Z'
		};

		expect(toApplicationFormValues(application, 1).hasConsented).toBe(true);
	});
});

describe('nextStatuses', () => {
	it('lets an applicant submit a draft', () => {
		expect(nextStatuses('draft', 'applicant')).toEqual(['submitted']);
	});

	it('lets an applicant reopen or withdraw a submitted application', () => {
		expect(nextStatuses('submitted', 'applicant')).toEqual(['draft', 'withdrawn']);
	});

	it('lets an applicant withdraw from the waiting list', () => {
		expect(nextStatuses('waitlisted', 'applicant')).toEqual(['withdrawn']);
	});

	it('leaves an applicant nothing to do once a decision has been made', () => {
		expect(nextStatuses('accepted', 'applicant')).toEqual([]);
		expect(nextStatuses('rejected', 'applicant')).toEqual([]);
		expect(nextStatuses('withdrawn', 'applicant')).toEqual([]);
	});

	it('gives an organiser the three decisions on a submitted application', () => {
		expect(nextStatuses('submitted', 'organiser')).toEqual(['accepted', 'rejected', 'waitlisted']);
	});

	it('gives an organiser two decisions on a waitlisted one', () => {
		expect(nextStatuses('waitlisted', 'organiser')).toEqual(['accepted', 'rejected']);
	});

	it('lets an organiser take an acceptance back', () => {
		expect(nextStatuses('accepted', 'organiser')).toEqual(['rejected', 'withdrawn']);
	});

	it('leaves an organiser nothing to do on a draft or a finished application', () => {
		expect(nextStatuses('draft', 'organiser')).toEqual([]);
		expect(nextStatuses('rejected', 'organiser')).toEqual([]);
		expect(nextStatuses('withdrawn', 'organiser')).toEqual([]);
	});
});

describe('canEditApplication', () => {
	it('lets a draft be changed while applications are open', () => {
		expect(canEditApplication('draft', true)).toBe(true);
	});

	it('lets a submitted application be reopened while applications are open', () => {
		expect(canEditApplication('submitted', true)).toBe(true);
	});

	it('refuses once applications have closed', () => {
		expect(canEditApplication('draft', false)).toBe(false);
		expect(canEditApplication('submitted', false)).toBe(false);
	});

	it('refuses an application that has been decided', () => {
		expect(canEditApplication('accepted', true)).toBe(false);
		expect(canEditApplication('waitlisted', true)).toBe(false);
		expect(canEditApplication('rejected', true)).toBe(false);
		expect(canEditApplication('withdrawn', true)).toBe(false);
	});
});

describe('applicationStatusSentence', () => {
	/** The seat an accepted application won. */
	const MY_SEAT = {
		seatName: 'France',
		committeeName: 'Security Council',
		committeeSlug: 'unsc',
		countryCode: 'FR'
	};

	it('says a draft has not been submitted', () => {
		expect(applicationStatusSentence('draft', null)).toBe(
			'You have not submitted this application yet.'
		);
	});

	it('says a submitted application is being read', () => {
		expect(applicationStatusSentence('submitted', null)).toBe(
			'The organisers are reviewing your application.'
		);
	});

	it('says what being waitlisted means', () => {
		expect(applicationStatusSentence('waitlisted', null)).toBe(
			'You are on the waiting list. We will tell you as soon as a seat opens.'
		);
	});

	it('names the seat an accepted application won', () => {
		expect(applicationStatusSentence('accepted', MY_SEAT)).toBe(
			'You were accepted and represent France in Security Council.'
		);
	});

	it('still says somebody was accepted when there is no seat to name', () => {
		expect(applicationStatusSentence('accepted', null)).toBe('You were accepted.');
	});

	it('says a rejected application was not accepted this time', () => {
		expect(applicationStatusSentence('rejected', null)).toBe(
			'The organisers could not accept your application this time.'
		);
	});

	it('says a withdrawn application was withdrawn by its applicant', () => {
		expect(applicationStatusSentence('withdrawn', null)).toBe('You withdrew this application.');
	});
});

describe('ageWarning', () => {
	/** The day the age is worked out on in these tests. */
	const TODAY = '2026-09-20';

	it('has nothing to say when the organisers set no ages', () => {
		const conference: Conference = { ...THIMUN, minAge: null, maxAge: null };

		expect(ageWarning(conference, '2013-01-01', TODAY)).toBe(null);
	});

	it('has nothing to say when the profile has no date of birth', () => {
		expect(ageWarning(THIMUN, '', TODAY)).toBe(null);
	});

	it('has nothing to say about an age inside the two bounds', () => {
		expect(ageWarning(THIMUN, '2010-05-05', TODAY)).toBe(null);
	});

	it('warns somebody younger than the conference expects, without blocking them', () => {
		expect(ageWarning(THIMUN, '2013-01-01', TODAY)).toBe(
			'This conference is for delegates aged 14 and over. You can still apply.'
		);
	});

	it('warns somebody older than the conference expects, without blocking them', () => {
		expect(ageWarning(THIMUN, '2005-01-01', TODAY)).toBe(
			'This conference is for delegates up to 19. You can still apply.'
		);
	});

	it('counts somebody as a year younger until their birthday comes round', () => {
		// Born on the last day of the year: on 20 September they have not had
		// their fourteenth birthday yet, so the conference's youngest age warns.
		expect(ageWarning(THIMUN, '2012-12-31', TODAY)).toBe(
			'This conference is for delegates aged 14 and over. You can still apply.'
		);
	});

	it('counts somebody as old enough on their birthday itself', () => {
		expect(ageWarning(THIMUN, '2012-09-20', TODAY)).toBe(null);
	});
});

describe('answerText', () => {
	it('reads a tick box back as Yes or No', () => {
		expect(answerText(VEGETARIAN_QUESTION, 'yes')).toBe('Yes');
		expect(answerText(VEGETARIAN_QUESTION, '')).toBe('No');
		expect(answerText(VEGETARIAN_QUESTION, undefined)).toBe('No');
	});

	it('joins the picks of a "Pick several" with commas', () => {
		expect(answerText(LANGUAGES_QUESTION, ['English', 'French'])).toBe('English, French');
	});

	it('says "Not answered" for a question left blank', () => {
		expect(answerText(CHAIRED_QUESTION, undefined)).toBe('Not answered');
		expect(answerText(LANGUAGES_QUESTION, [])).toBe('Not answered');
	});

	it('gives a text answer as it was written', () => {
		expect(answerText(CHAIRED_QUESTION, 'Twice, at DELFTMUN.')).toBe('Twice, at DELFTMUN.');
	});
});

describe('applicationAnswerRows', () => {
	it('numbers the committee preferences in the order they were chosen', () => {
		const application: MyApplication = {
			...MY_DRAFT,
			committeePreferences: ['committee-unsc', 'committee-ecofin']
		};

		const rows = applicationAnswerRows(application, [], ['UNSC', 'ECOFIN']);

		expect(rows[0]).toEqual({ label: 'Committee preferences', value: '1. UNSC · 2. ECOFIN' });
	});

	it('leaves the committee row out when no committee was chosen', () => {
		const application: MyApplication = { ...MY_DRAFT, committeePreferences: [] };

		const rows = applicationAnswerRows(application, [], []);

		expect(rows[0]).toEqual({ label: 'Seat preferences', value: 'Any P5 country' });
	});

	it('shows the two text boxes as they were written', () => {
		const rows = applicationAnswerRows(MY_DRAFT, [], ['UNSC']);

		expect(rows[1]).toEqual({ label: 'Seat preferences', value: 'Any P5 country' });
		expect(rows[2]).toEqual({
			label: 'Motivation',
			value: 'I want to learn how the Council really works.'
		});
	});

	it('leaves the seat preferences row out when the box was left blank', () => {
		const application: MyApplication = { ...MY_DRAFT, seatPreferences: '' };

		const rows = applicationAnswerRows(application, [], ['UNSC']);

		expect(rows[1]).toEqual({
			label: 'Motivation',
			value: 'I want to learn how the Council really works.'
		});
	});

	it('leaves the motivation row out when the conference asked for none', () => {
		// A conference that does not ask for a motivation has none stored, so
		// there is nothing to leave a row for.
		const application: MyApplication = { ...MY_DRAFT, motivation: '' };

		const rows = applicationAnswerRows(application, [CHAIRED_QUESTION], ['UNSC']);

		expect(rows[2]).toEqual({ label: 'Have you chaired before?', value: 'No' });
	});

	it('asks the questions in the order the form asked them', () => {
		const application: MyApplication = {
			...MY_DRAFT,
			answers: { 'question-chaired': 'No', 'question-shirt': 'M' }
		};

		// The questions arrive in the wrong order on purpose: `position` is what
		// decides the order, not the array.
		const rows = applicationAnswerRows(application, [SHIRT_QUESTION, CHAIRED_QUESTION], ['UNSC']);

		expect(rows[3]).toEqual({ label: 'Have you chaired before?', value: 'No' });
		expect(rows[4]).toEqual({ label: 'Which shirt size do you take?', value: 'M' });
	});

	it('joins the choices of a "Pick several" answer', () => {
		const application: MyApplication = {
			...MY_DRAFT,
			answers: { 'question-languages': ['English', 'French'] }
		};

		const rows = applicationAnswerRows(application, [LANGUAGES_QUESTION], ['UNSC']);

		expect(rows[3]).toEqual({
			label: 'Which languages do you speak?',
			value: 'English, French'
		});
	});

	it('reads a tick box as Yes or No', () => {
		// Neither 'yes' nor '' is a word to put in front of somebody, so the two
		// are read back as the answer to the question the box asks.
		const ticked: MyApplication = { ...MY_DRAFT, answers: { 'question-vegetarian': 'yes' } };
		const unticked: MyApplication = { ...MY_DRAFT, answers: { 'question-vegetarian': '' } };

		expect(applicationAnswerRows(ticked, [VEGETARIAN_QUESTION], [])[2]).toEqual({
			label: 'Do you need a vegetarian meal?',
			value: 'Yes'
		});
		expect(applicationAnswerRows(unticked, [VEGETARIAN_QUESTION], [])[2].value).toBe('No');
	});

	it('says so when an optional question was not answered', () => {
		const application: MyApplication = { ...MY_DRAFT, answers: {} };

		const rows = applicationAnswerRows(application, [SHIRT_QUESTION], []);

		expect(rows[2]).toEqual({ label: 'Which shirt size do you take?', value: 'Not answered' });
	});
});

/*
 * Everything below tests the organiser's half of the file: the table at
 * `/manage/[slug]/applications`, its filter, its bulk decisions and its CSV.
 */

/** One application as the CSV reads it, for the tests to change one field of. */
function exportRow(changes: Partial<ApplicationExportRow> = {}): ApplicationExportRow {
	return {
		applicantName: 'Anna Kowalski',
		email: 'anna@example.org',
		institutionName: 'Lyceum 7',
		countryName: 'Poland',
		experienceLevel: 'intermediate',
		dateOfBirth: '2008-04-11',
		phone: '+48 22 000 0000',
		dietaryRequirements: 'Vegetarian',
		emergencyContact: 'Maria Kowalska · +48 22 000 0000',
		committeeNames: ['UNSC'],
		seatPreferences: 'Any P5 country',
		motivation: 'I want to learn how the Council really works.',
		answers: { 'question-chaired': 'No' },
		status: 'submitted',
		submittedAt: '2026-10-03T09:15:00Z',
		decidedAt: null,
		seatLabel: null,
		decisionNote: null,
		internalNote: null,
		...changes
	};
}

/** Counts a test can change one number of, rather than writing all five out again. */
function counts(changes: Partial<ApplicationStatusCounts> = {}): ApplicationStatusCounts {
	return { ...EMPTY_APPLICATION_STATUS_COUNTS, ...changes };
}

describe('APPLICATION_STATUS_TABS', () => {
	it('holds the five shown statuses in the order the page draws them', () => {
		expect(APPLICATION_STATUS_TABS).toEqual([
			'submitted',
			'waitlisted',
			'accepted',
			'rejected',
			'withdrawn'
		]);
	});

	it('leaves drafts out, because an unsent application is not the organisers to read', () => {
		expect(APPLICATION_STATUS_TABS).not.toContain('draft');
	});
});

describe('APPLICATION_TAB_LABELS', () => {
	it('words each tab the way a badge words the same status', () => {
		expect(APPLICATION_TAB_LABELS).toEqual({
			submitted: 'Under review',
			waitlisted: 'Waitlisted',
			accepted: 'Accepted',
			rejected: 'Not accepted',
			withdrawn: 'Withdrawn'
		});
	});
});

describe('APPLICATION_EMPTY_TITLES', () => {
	it('gives every tab a sentence about its own status', () => {
		expect(APPLICATION_EMPTY_TITLES).toEqual({
			submitted: 'No applications under review.',
			waitlisted: 'No waitlisted applications.',
			accepted: 'No accepted applications.',
			rejected: 'No applications marked as not accepted.',
			withdrawn: 'No withdrawn applications.'
		});
	});

	it('has one for every tab, so no tab can be drawn without a sentence', () => {
		for (const status of APPLICATION_STATUS_TABS) {
			expect(APPLICATION_EMPTY_TITLES[status]).not.toBe('');
		}
	});
});

describe('APPLICATION_SORT_OPTIONS', () => {
	it('offers the three orders the dropdown lists', () => {
		expect(APPLICATION_SORT_OPTIONS).toEqual([
			{ value: 'submitted', label: 'Oldest first' },
			{ value: 'name', label: 'Name' },
			{ value: 'decided', label: 'Recently decided' }
		]);
	});
});

describe('isListedApplicationStatus', () => {
	it('says yes to each of the five statuses the table shows', () => {
		for (const status of APPLICATION_STATUS_TABS) {
			expect(isListedApplicationStatus(status)).toBe(true);
		}
	});

	it('says no to a draft and to anything that is not a status at all', () => {
		expect(isListedApplicationStatus('draft')).toBe(false);
		expect(isListedApplicationStatus('SUBMITTED')).toBe(false);
		expect(isListedApplicationStatus('maybe')).toBe(false);
	});
});

describe('parseApplicationListQuery', () => {
	it('asks for nothing when the address carries nothing', () => {
		expect(parseApplicationListQuery(new URLSearchParams())).toEqual(EMPTY_APPLICATION_LIST_QUERY);
	});

	it('reads a whole query back off the address', () => {
		const params = new URLSearchParams(
			'q=kowalski&status=waitlisted&committee=6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b&country=PL&sort=name&page=3&view=board'
		);

		expect(parseApplicationListQuery(params)).toEqual({
			q: 'kowalski',
			status: 'waitlisted',
			committee: '6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b',
			country: 'PL',
			sort: 'name',
			page: 3,
			view: 'board'
		});
	});

	it('falls back to the table for a view it does not know', () => {
		expect(parseApplicationListQuery(new URLSearchParams('view=kanban')).view).toBe('table');
		expect(parseApplicationListQuery(new URLSearchParams('view=')).view).toBe('table');
	});

	it('trims the spaces around the search text', () => {
		expect(parseApplicationListQuery(new URLSearchParams('q=  kowalski  ')).q).toBe('kowalski');
	});

	it('falls back to the queue for a status it does not know', () => {
		// The address is only text somebody could have typed, and a draft is one
		// thing the organiser may never list.
		expect(parseApplicationListQuery(new URLSearchParams('status=draft')).status).toBe('submitted');
		expect(parseApplicationListQuery(new URLSearchParams('status=shortlisted')).status).toBe(
			'submitted'
		);
	});

	it('falls back to the oldest first for an order it does not know', () => {
		expect(parseApplicationListQuery(new URLSearchParams('sort=alphabetical')).sort).toBe(
			'submitted'
		);
		expect(parseApplicationListQuery(new URLSearchParams('sort=NAME')).sort).toBe('submitted');
	});

	it('falls back to the first page for anything that is not a page number', () => {
		expect(parseApplicationListQuery(new URLSearchParams('page=0')).page).toBe(1);
		expect(parseApplicationListQuery(new URLSearchParams('page=abc')).page).toBe(1);
		expect(parseApplicationListQuery(new URLSearchParams('page=-2')).page).toBe(1);
		expect(parseApplicationListQuery(new URLSearchParams('page=1.5')).page).toBe(1);
	});

	it('accepts a country code written in lower case', () => {
		expect(parseApplicationListQuery(new URLSearchParams('country=pl')).country).toBe('PL');
	});

	it('ignores a country that is not a real code', () => {
		expect(parseApplicationListQuery(new URLSearchParams('country=Narnia')).country).toBe('');
	});

	it('keeps a committee only when what the address carries has the shape of an id', () => {
		// The value goes straight into a filter on a `uuid[]` column, and Postgres
		// refuses the whole query for anything that is not a uuid. Anything else in
		// the address means "any committee" rather than a failed page.
		const id = '6f1a2b3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

		expect(parseApplicationListQuery(new URLSearchParams(`committee=${id}`)).committee).toBe(id);
		expect(parseApplicationListQuery(new URLSearchParams(`committee= ${id} `)).committee).toBe(id);
		expect(
			parseApplicationListQuery(new URLSearchParams('committee=committee-ecofin')).committee
		).toBe('');
		expect(parseApplicationListQuery(new URLSearchParams('committee=')).committee).toBe('');
	});
});

describe('applicationCountsSentence', () => {
	it('names every status somebody is in, in the order of the tabs', () => {
		const sentence = applicationCountsSentence(counts({ submitted: 142, accepted: 80 }));

		expect(sentence).toBe('142 under review · 80 accepted');
	});

	it('leaves out a status nobody is in rather than writing it as zero', () => {
		expect(applicationCountsSentence(counts({ accepted: 3 }))).toBe('3 accepted');
	});

	it('writes the five statuses in the tab order, whatever order the counts came in', () => {
		const sentence = applicationCountsSentence(
			counts({ withdrawn: 1, rejected: 2, waitlisted: 3, submitted: 4 })
		);

		expect(sentence).toBe('4 under review · 3 waitlisted · 2 not accepted · 1 withdrawn');
	});

	it('says so when nobody has applied yet', () => {
		expect(applicationCountsSentence(EMPTY_APPLICATION_STATUS_COUNTS)).toBe('No applications yet');
	});
});

describe('bulkDecisionFlash', () => {
	it('counts what was done when nothing was skipped', () => {
		const flash = bulkDecisionFlash({ changedCount: 6, skippedCount: 0 }, 'waitlisted');

		expect(flash).toBe('6 applications waitlisted.');
	});

	it('uses the word the action gives it', () => {
		const flash = bulkDecisionFlash({ changedCount: 6, skippedCount: 0 }, 'marked as not accepted');

		expect(flash).toBe('6 applications marked as not accepted.');
	});

	it('says nothing changed when every one of them was already decided', () => {
		const flash = bulkDecisionFlash({ changedCount: 0, skippedCount: 2 }, 'waitlisted');

		expect(flash).toBe('Nothing changed. 2 were already decided.');
	});

	it('says how many moved and how many did not when some of each', () => {
		const flash = bulkDecisionFlash({ changedCount: 4, skippedCount: 2 }, 'waitlisted');

		expect(flash).toBe('4 waitlisted, 2 skipped because they were already decided.');
	});

	it('reads as English for a single application', () => {
		expect(bulkDecisionFlash({ changedCount: 1, skippedCount: 0 }, 'waitlisted')).toBe(
			'1 application waitlisted.'
		);
		expect(bulkDecisionFlash({ changedCount: 0, skippedCount: 1 }, 'waitlisted')).toBe(
			'Nothing changed. 1 was already decided.'
		);
		expect(bulkDecisionFlash({ changedCount: 3, skippedCount: 1 }, 'waitlisted')).toBe(
			'3 waitlisted, 1 skipped because it was already decided.'
		);
	});
});

describe('readBulkSeatChoices', () => {
	it('reads the seat chosen for each ticked applicant', () => {
		const formData = new FormData();

		formData.set('seat:application-anna', 'seat-france');
		formData.set('seat:application-daniel', '  seat-china  ');

		const choices = readBulkSeatChoices(formData, ['application-anna', 'application-daniel']);

		expect(choices).toEqual({
			'application-anna': 'seat-france',
			'application-daniel': 'seat-china'
		});
	});

	it('gives an applicant whose dropdown was left on "not chosen" an empty entry', () => {
		const choices = readBulkSeatChoices(new FormData(), ['application-anna']);

		expect(choices).toEqual({ 'application-anna': '' });
	});

	it('ignores a seat sent for somebody who was not ticked', () => {
		// A hand-made request can carry any field it likes. Only the applications
		// in front of the organiser are read, so the extra one goes nowhere.
		const formData = new FormData();

		formData.set('seat:application-anna', 'seat-france');
		formData.set('seat:application-elsewhere', 'seat-brazil');

		expect(readBulkSeatChoices(formData, ['application-anna'])).toEqual({
			'application-anna': 'seat-france'
		});
	});
});

describe('validateBulkSeatChoices', () => {
	/** The names of the seats these tests choose between. */
	const SEAT_NAMES = new Map([
		['seat-france', 'France'],
		['seat-china', 'China']
	]);

	it('finds nothing wrong when everybody has a seat of their own', () => {
		const choices = { 'application-anna': 'seat-france', 'application-daniel': 'seat-china' };

		expect(
			validateBulkSeatChoices(['application-anna', 'application-daniel'], choices, SEAT_NAMES)
		).toBe(null);
	});

	it('asks for a seat for the applicant who has none', () => {
		const choices = { 'application-anna': 'seat-france', 'application-daniel': '' };

		expect(
			validateBulkSeatChoices(['application-anna', 'application-daniel'], choices, SEAT_NAMES)
		).toBe('Choose a seat for every applicant, or untick the ones you are not ready to accept.');
	});

	it('asks for a seat for an applicant the form sent nothing at all for', () => {
		expect(validateBulkSeatChoices(['application-anna'], {}, SEAT_NAMES)).toBe(
			'Choose a seat for every applicant, or untick the ones you are not ready to accept.'
		);
	});

	it('names the seat two applicants were given', () => {
		const choices = { 'application-anna': 'seat-france', 'application-daniel': 'seat-france' };

		expect(
			validateBulkSeatChoices(['application-anna', 'application-daniel'], choices, SEAT_NAMES)
		).toBe('France was chosen twice.');
	});

	it('still reads as a sentence when the seat has no name to give', () => {
		const choices = { 'application-anna': 'seat-mars', 'application-daniel': 'seat-mars' };

		expect(
			validateBulkSeatChoices(['application-anna', 'application-daniel'], choices, new Map())
		).toBe('That seat was chosen twice.');
	});
});

describe('applicationCsvRows', () => {
	it('gives one column per preference the conference asks for and one per question', () => {
		const rows = applicationCsvRows([exportRow()], [CHAIRED_QUESTION, SHIRT_QUESTION], 2);

		expect(rows[0]).toEqual([
			'Name',
			'Email',
			'Institution',
			'Country',
			'Experience',
			'Date of birth',
			'Phone',
			'Dietary requirements',
			'Emergency contact',
			'Preference 1',
			'Preference 2',
			'Seat preferences',
			'Motivation',
			'Have you chaired before?',
			'Which shirt size do you take?',
			'Status',
			'Submitted',
			'Decided',
			'Seat',
			'Decision note',
			'Internal note'
		]);
		// One heading row and one row per application, and every row is as wide
		// as the headings.
		expect(rows).toHaveLength(2);
		expect(rows[1]).toHaveLength(rows[0].length);
	});

	it('writes one application out in the order of the headings', () => {
		const application = exportRow({
			status: 'accepted',
			decidedAt: '2026-10-09T16:00:00Z',
			seatLabel: 'UNSC · France',
			decisionNote: 'Welcome aboard.',
			internalNote: 'Strong motivation.'
		});

		const rows = applicationCsvRows([application], [CHAIRED_QUESTION], 1);

		expect(rows[1]).toEqual([
			'Anna Kowalski',
			'anna@example.org',
			'Lyceum 7',
			'Poland',
			'Intermediate',
			'2008-04-11',
			'+48 22 000 0000',
			'Vegetarian',
			'Maria Kowalska · +48 22 000 0000',
			'UNSC',
			'Any P5 country',
			'I want to learn how the Council really works.',
			'No',
			'Accepted',
			'2026-10-03T09:15:00Z',
			'2026-10-09T16:00:00Z',
			'UNSC · France',
			'Welcome aboard.',
			'Strong motivation.'
		]);
	});

	it('asks the questions in the order the form asked them', () => {
		// The questions arrive in the wrong order on purpose: `position` is what
		// decides the columns, not the array.
		const rows = applicationCsvRows([exportRow()], [SHIRT_QUESTION, CHAIRED_QUESTION], 0);

		expect(rows[0].slice(-8, -6)).toEqual([
			'Have you chaired before?',
			'Which shirt size do you take?'
		]);
	});

	it('joins a "Pick several" answer and reads a tick box as Yes or No', () => {
		const ticked = exportRow({
			answers: { 'question-languages': ['English', 'French'], 'question-vegetarian': 'yes' }
		});
		const unticked = exportRow({
			answers: { 'question-languages': [], 'question-vegetarian': '' }
		});
		const questions = [LANGUAGES_QUESTION, VEGETARIAN_QUESTION];

		expect(applicationCsvRows([ticked], questions, 0)[1].slice(-8, -6)).toEqual([
			'English, French',
			'Yes'
		]);
		expect(applicationCsvRows([unticked], questions, 0)[1].slice(-8, -6)).toEqual(['', 'No']);
	});

	it('leaves an unanswered question empty rather than writing a sentence into it', () => {
		// The page says "Not answered" because somebody is reading it. A
		// spreadsheet column is sorted and counted, so it holds nothing.
		const rows = applicationCsvRows([exportRow({ answers: {} })], [SHIRT_QUESTION], 0);

		expect(rows[1].slice(-7, -6)).toEqual(['']);
	});

	it('leaves every empty cell empty rather than writing the word null', () => {
		const application = exportRow({
			email: null,
			institutionName: null,
			countryName: null,
			dateOfBirth: null,
			phone: null,
			dietaryRequirements: null,
			emergencyContact: null,
			committeeNames: [],
			seatPreferences: null,
			motivation: null,
			submittedAt: null
		});

		const rows = applicationCsvRows([application], [], 2);

		expect(rows[1]).toEqual([
			'Anna Kowalski',
			'',
			'',
			'',
			'Intermediate',
			'',
			'',
			'',
			'',
			'',
			'',
			'',
			'',
			'Under review',
			'',
			'',
			'',
			'',
			''
		]);
	});

	it('keeps the columns the same when an applicant named fewer preferences', () => {
		const rows = applicationCsvRows([exportRow({ committeeNames: ['UNSC'] })], [], 3);

		expect(rows[1].slice(9, 12)).toEqual(['UNSC', '', '']);
	});

	it('gives the headings on their own when nobody applied', () => {
		const rows = applicationCsvRows([], [CHAIRED_QUESTION], 1);

		expect(rows).toHaveLength(1);
		expect(rows[0]).toContain('Have you chaired before?');
	});
});

describe('applicationsCsvFileName', () => {
	it('names the file after the conference and the day it was taken', () => {
		expect(applicationsCsvFileName('thimun-2027', '2026-09-21')).toBe(
			'applications-thimun-2027-2026-09-21.csv'
		);
	});
});

/*
 * Everything below tests the reader's own list, `/applications`: the two roads
 * into a conference merged into one set of rows, what `?past=1` turns back on,
 * and the quiet lines a row is drawn with.
 */

/**
 * One conference every row below starts from: it runs in Amsterdam in February
 * 2027 and its application window shuts at the end of 2026. Tests spread it and
 * change only the field they are about.
 */
const DELFT_MUN_LIST: ApplicationListConference = {
	id: 'conference-delft',
	slug: 'delftmun-2027',
	name: 'DelftMUN 2027',
	organizationName: 'Delft MUN Society',
	logoPath: null,
	bannerPath: null,
	startDate: '2027-02-12',
	endDate: '2027-02-15',
	timezone: 'Europe/Amsterdam',
	isArchived: false,
	applicationsCloseAt: '2026-12-31T22:59:00Z',
	city: 'Delft',
	venueName: null,
	locationMode: 'in_person'
};

/** A second conference, which starts three weeks after the one above. */
const LSE_MUN_LIST: ApplicationListConference = {
	...DELFT_MUN_LIST,
	id: 'conference-lse',
	slug: 'lse-mun-2027',
	name: 'LSE MUN 2027',
	startDate: '2027-03-04',
	endDate: '2027-03-07',
	timezone: 'Europe/London'
};

/** One individual application of the reader's, for a test to change one field of. */
function listedApplication(changes: Partial<MyApplicationListItem> = {}): MyApplicationListItem {
	return {
		id: 'application-1',
		status: 'submitted',
		submittedAt: '2026-09-08T10:00:00Z',
		updatedAt: '2026-09-08T10:00:00Z',
		conference: DELFT_MUN_LIST,
		seat: null,
		...changes
	};
}

/** One delegation the reader belongs to, for a test to change one field of. */
function listedMembership(changes: Partial<MyDelegationListItem> = {}): MyDelegationListItem {
	return {
		id: 'delegation-1',
		name: 'LSE Team',
		status: 'accepted',
		conference: LSE_MUN_LIST,
		seat: null,
		...changes
	};
}

/** The conference each row is about, which is what the tests about order read. */
function conferenceNamesOf(entries: ApplicationListEntry[]): string[] {
	return entries.map((entry) => applicationListConference(entry).name);
}

describe('mergeIntoApplicationList', () => {
	it('puts both roads into a conference in one list, soonest conference first', () => {
		const entries = mergeIntoApplicationList(
			[listedApplication({ conference: LSE_MUN_LIST })],
			[listedMembership({ conference: DELFT_MUN_LIST })]
		);

		expect(conferenceNamesOf(entries)).toEqual(['DelftMUN 2027', 'LSE MUN 2027']);
	});

	it('says which road each row came by, and carries the id the page keys on', () => {
		const entries = mergeIntoApplicationList(
			[listedApplication({ id: 'application-7' })],
			[listedMembership({ id: 'delegation-3' })]
		);

		expect(entries[0]).toEqual({
			kind: 'individual',
			id: 'application-7',
			application: listedApplication({ id: 'application-7' })
		});
		expect(entries[1]).toEqual({
			kind: 'delegation',
			id: 'delegation-3',
			membership: listedMembership({ id: 'delegation-3' })
		});
	});

	it('sorts two conferences that start on the same day by name', () => {
		const zagreb = { ...DELFT_MUN_LIST, id: 'conference-zagreb', name: 'ZagrebMUN 2027' };
		const berlin = { ...DELFT_MUN_LIST, id: 'conference-berlin', name: 'BerlinMUN 2027' };

		const entries = mergeIntoApplicationList(
			[listedApplication({ id: 'application-z', conference: zagreb })],
			[listedMembership({ id: 'delegation-b', conference: berlin })]
		);

		expect(conferenceNamesOf(entries)).toEqual(['BerlinMUN 2027', 'ZagrebMUN 2027']);
	});

	it('falls back to the row id when the day and the name are the same', () => {
		// Two conferences really can share a name and a start date, and the two
		// queries behind the page answer in no fixed order, so the list still has
		// to come out the same way every time it is drawn.
		const entries = mergeIntoApplicationList(
			[listedApplication({ id: 'application-b' }), listedApplication({ id: 'application-a' })],
			[]
		);

		expect(entries.map((entry) => entry.id)).toEqual(['application-a', 'application-b']);
	});

	it('leaves the two lists it was given alone', () => {
		const applications = [listedApplication({ conference: LSE_MUN_LIST })];
		const memberships = [listedMembership({ conference: DELFT_MUN_LIST })];

		mergeIntoApplicationList(applications, memberships);

		expect(applications).toEqual([listedApplication({ conference: LSE_MUN_LIST })]);
		expect(memberships).toEqual([listedMembership({ conference: DELFT_MUN_LIST })]);
	});

	it('gives an empty list to somebody who has applied to nothing', () => {
		expect(mergeIntoApplicationList([], [])).toEqual([]);
	});
});

describe('applicationListConference', () => {
	it('reads the conference of an individual application', () => {
		const entries = mergeIntoApplicationList([listedApplication()], []);

		expect(applicationListConference(entries[0])).toEqual(DELFT_MUN_LIST);
	});

	it('reads the conference of a delegation membership', () => {
		const entries = mergeIntoApplicationList([], [listedMembership()]);

		expect(applicationListConference(entries[0])).toEqual(LSE_MUN_LIST);
	});
});

describe('withoutPastConferences', () => {
	it('hides a conference whose last day has gone and keeps one still to come', () => {
		const entries = mergeIntoApplicationList(
			[listedApplication({ conference: DELFT_MUN_LIST })],
			[listedMembership({ conference: LSE_MUN_LIST })]
		);

		const kept = withoutPastConferences(entries, new Date('2027-02-16T09:00:00Z'));

		expect(conferenceNamesOf(kept)).toEqual(['LSE MUN 2027']);
	});

	it('keeps a conference that is still running', () => {
		const entries = mergeIntoApplicationList([listedApplication()], []);

		const kept = withoutPastConferences(entries, new Date('2027-02-14T09:00:00Z'));

		expect(conferenceNamesOf(kept)).toEqual(['DelftMUN 2027']);
	});

	it('judges the last day where the conference is, not where the reader is', () => {
		// New Zealand runs thirteen hours ahead of UTC in February, so this moment
		// is the sixteenth in Auckland while it is still the fifteenth in London.
		const inAuckland = { ...DELFT_MUN_LIST, timezone: 'Pacific/Auckland' };
		const entries = mergeIntoApplicationList([listedApplication({ conference: inAuckland })], []);

		expect(withoutPastConferences(entries, new Date('2027-02-15T20:00:00Z'))).toEqual([]);
	});

	it('hides an archived conference whose dates are still ahead', () => {
		const archived = { ...DELFT_MUN_LIST, isArchived: true };
		const entries = mergeIntoApplicationList([], [listedMembership({ conference: archived })]);

		expect(withoutPastConferences(entries, new Date('2027-01-05T09:00:00Z'))).toEqual([]);
	});

	it('keeps everything while every conference is still ahead', () => {
		const entries = mergeIntoApplicationList([listedApplication()], [listedMembership()]);

		const kept = withoutPastConferences(entries, new Date('2027-01-05T09:00:00Z'));

		expect(conferenceNamesOf(kept)).toEqual(['DelftMUN 2027', 'LSE MUN 2027']);
	});
});

describe('applicationRowLine', () => {
	/** A conference whose window shuts on the evening of 15 January 2027 in Amsterdam. */
	const CLOSING_IN_JANUARY: ApplicationListConference = {
		...DELFT_MUN_LIST,
		applicationsCloseAt: '2027-01-15T22:59:00Z'
	};

	it('says when a sent application was submitted', () => {
		// `formatDateRange` writes September as "Sept", which is why the mock-up
		// in `05-pages/delegate/applications.md` says "Submitted 8 Sept 2026".
		const line = applicationRowLine(listedApplication(), new Date('2026-09-20T09:00:00Z'));

		expect(line).toBe('Submitted 8 Sept 2026');
	});

	it('reads the submission day in the conference timezone', () => {
		// Half past eleven at night in London is already the next day in
		// Amsterdam, and the conference's own day is the one the row shows.
		const lateAtNight = listedApplication({ submittedAt: '2026-09-08T23:30:00Z' });

		expect(applicationRowLine(lateAtNight, new Date('2026-09-20T09:00:00Z'))).toBe(
			'Submitted 9 Sept 2026'
		);
	});

	it('falls back to the last change when a sent application has no submission time', () => {
		// The database sets `submitted_at` as an application leaves draft, so this
		// only guards the column being nullable.
		const withoutSubmittedAt = listedApplication({
			submittedAt: null,
			updatedAt: '2026-09-10T10:00:00Z'
		});

		expect(applicationRowLine(withoutSubmittedAt, new Date('2026-09-20T09:00:00Z'))).toBe(
			'Submitted 10 Sept 2026'
		);
	});

	it('counts the days left on a draft whose window is still open', () => {
		const draft = listedApplication({
			status: 'draft',
			submittedAt: null,
			conference: CLOSING_IN_JANUARY
		});

		expect(applicationRowLine(draft, new Date('2027-01-12T09:00:00Z'))).toBe(
			'Draft · closes in 3 days'
		);
	});

	it('says "closes today" on the last day of the window', () => {
		const draft = listedApplication({
			status: 'draft',
			submittedAt: null,
			conference: { ...DELFT_MUN_LIST, applicationsCloseAt: '2027-01-12T22:59:00Z' }
		});

		expect(applicationRowLine(draft, new Date('2027-01-12T09:00:00Z'))).toBe(
			'Draft · closes today'
		);
	});

	it('says "closes tomorrow" the day before', () => {
		const draft = listedApplication({
			status: 'draft',
			submittedAt: null,
			conference: { ...DELFT_MUN_LIST, applicationsCloseAt: '2027-01-13T22:59:00Z' }
		});

		expect(applicationRowLine(draft, new Date('2027-01-12T09:00:00Z'))).toBe(
			'Draft · closes tomorrow'
		);
	});

	it('says a draft is closed once the window has shut', () => {
		const draft = listedApplication({
			status: 'draft',
			submittedAt: null,
			conference: CLOSING_IN_JANUARY
		});

		expect(applicationRowLine(draft, new Date('2027-01-16T09:00:00Z'))).toBe('Draft · closed');
	});

	it('says a draft is closed once the organisers have archived the conference', () => {
		const draft = listedApplication({
			status: 'draft',
			submittedAt: null,
			conference: { ...CLOSING_IN_JANUARY, isArchived: true }
		});

		expect(applicationRowLine(draft, new Date('2027-01-12T09:00:00Z'))).toBe('Draft · closed');
	});

	it('says only "Draft" when nothing bounds the window', () => {
		const draft = listedApplication({
			status: 'draft',
			submittedAt: null,
			conference: { ...DELFT_MUN_LIST, applicationsCloseAt: null }
		});

		expect(applicationRowLine(draft, new Date('2027-01-12T09:00:00Z'))).toBe('Draft');
	});

	it('says when a withdrawn application was submitted, because it stays on the list', () => {
		const withdrawn = listedApplication({ status: 'withdrawn' });

		expect(applicationRowLine(withdrawn, new Date('2026-09-20T09:00:00Z'))).toBe(
			'Submitted 8 Sept 2026'
		);
	});
});

describe('delegationRowLine', () => {
	it('names the delegation the reader belongs to', () => {
		expect(delegationRowLine(listedMembership())).toBe('Delegation · LSE Team');
	});
});

describe('canFinishApplication', () => {
	/** A draft that has never been sent, which is the only row that offers "Finish". */
	const DRAFT = listedApplication({ status: 'draft', submittedAt: null });

	it('offers "Finish" on a draft while the conference is still taking applications', () => {
		expect(canFinishApplication(DRAFT, new Date('2026-12-01T09:00:00Z'))).toBe(true);
	});

	it('offers nothing on an application that has already been sent', () => {
		expect(canFinishApplication(listedApplication(), new Date('2026-12-01T09:00:00Z'))).toBe(false);
	});

	it('offers nothing once the window has closed', () => {
		expect(canFinishApplication(DRAFT, new Date('2027-01-05T09:00:00Z'))).toBe(false);
	});

	it('offers nothing once the organisers have archived the conference', () => {
		const archived = listedApplication({
			status: 'draft',
			submittedAt: null,
			conference: { ...DELFT_MUN_LIST, isArchived: true }
		});

		expect(canFinishApplication(archived, new Date('2026-12-01T09:00:00Z'))).toBe(false);
	});

	it('offers "Finish" on a draft at a conference that bounds nothing', () => {
		const noClosingDate = listedApplication({
			status: 'draft',
			submittedAt: null,
			conference: { ...DELFT_MUN_LIST, applicationsCloseAt: null }
		});

		expect(canFinishApplication(noClosingDate, new Date('2026-12-01T09:00:00Z'))).toBe(true);
	});
});

describe('unpublishedApplicationsNotice', () => {
	it('says nothing when every application can be listed', () => {
		expect(unpublishedApplicationsNotice(0)).toBeNull();
	});

	it('speaks of one application in the singular', () => {
		expect(unpublishedApplicationsNotice(1)).toBe(
			'One of your applications is not listed because the organisers unpublished its conference. It comes back here if they publish it again.'
		);
	});

	it('counts several applications in the plural', () => {
		expect(unpublishedApplicationsNotice(3)).toBe(
			'3 of your applications are not listed because the organisers unpublished their conferences. They come back here if the conferences are published again.'
		);
	});
});
