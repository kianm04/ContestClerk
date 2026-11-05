import { describe, expect, it } from 'vitest';
import {
	applicationWindowNotice,
	COMMITTEE_PREFERENCE_OPTIONS,
	hasApplicationWindowErrors,
	hasFormSettingsErrors,
	MAX_COMMITTEE_PREFERENCES,
	OPENING_CHOICE_OPTIONS,
	openingChoiceFor,
	openingOnPublish,
	openingToStore,
	readApplicationWindowForm,
	readFormSettingsForm,
	validateApplicationWindowForm,
	validateFormSettingsForm,
	type ApplicationWindowValues,
	type FormSettingsValues
} from './application-form-settings';
import type { Conference } from './conferences';

/**
 * A conference whose application window is open: it opened on 1 October 2026 at
 * 09:00 in Amsterdam and closes on 15 December at 23:59, and it starts on
 * 24 January 2027.
 *
 * The two moments are stored in UTC, an hour behind Amsterdam in December and
 * two hours behind it in October, which is the whole reason the notice reads
 * them in the conference's own timezone rather than in UTC.
 *
 * A `Conference` has a lot of fields and these tests only care about six of
 * them, so it sits here once rather than in every test.
 */
const OPEN_CONFERENCE: Conference = {
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
	expectedDelegates: null,
	applicationsOpenAt: '2026-10-01T07:00:00Z',
	applicationsCloseAt: '2026-12-15T22:59:00Z',
	committeeCount: 4,
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
	minAge: null,
	maxAge: null,
	positionPaperRequired: false,
	positionPaperDeadline: null,
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

/** A conference that is `OPEN_CONFERENCE` apart from the fields a test names. */
function conference(changes: Partial<Conference> = {}): Conference {
	return { ...OPEN_CONFERENCE, ...changes };
}

/** The window of `OPEN_CONFERENCE` written out, which three of the four states show. */
const WINDOW_TEXT = '1 Oct 2026 09:00 – 15 Dec 2026 23:59 (Europe/Amsterdam)';

/** A moment inside the window, in November 2026. */
const DURING_THE_WINDOW = new Date('2026-11-01T12:00:00Z');

describe('COMMITTEE_PREFERENCE_OPTIONS', () => {
	it('offers none and then every number up to the limit', () => {
		const values = COMMITTEE_PREFERENCE_OPTIONS.map((option) => option.value);

		expect(values).toEqual(['0', '1', '2', '3']);
		expect(values.at(-1)).toBe(String(MAX_COMMITTEE_PREFERENCES));
	});

	it('names each number with its noun, in the singular for one', () => {
		const labels = COMMITTEE_PREFERENCE_OPTIONS.map((option) => option.label);

		expect(labels).toEqual(['None', '1 preference', '2 preferences', '3 preferences']);
	});
});

describe('OPENING_CHOICE_OPTIONS', () => {
	it('offers opening on publishing first, and a chosen date second', () => {
		expect(OPENING_CHOICE_OPTIONS).toEqual([
			{ value: 'publish', label: 'As soon as I publish' },
			{ value: 'date', label: 'On a date I choose' }
		]);
	});
});

describe('readApplicationWindowForm', () => {
	it('reads the opening choice, both times and both tick boxes', () => {
		const formData = new FormData();
		formData.set('opensWhen', 'date');
		formData.set('applicationsOpenAt', '2026-10-01T09:00');
		formData.set('applicationsCloseAt', '2026-12-15T23:59');
		formData.set('acceptsIndividualApplications', 'on');
		formData.set('acceptsDelegations', 'on');

		expect(readApplicationWindowForm(formData)).toEqual({
			opensWhen: 'date',
			applicationsOpenAt: '2026-10-01T09:00',
			applicationsCloseAt: '2026-12-15T23:59',
			acceptsIndividualApplications: true,
			acceptsDelegations: true
		});
	});

	it('counts a tick box the form left out as unticked', () => {
		const formData = new FormData();
		formData.set('acceptsIndividualApplications', 'on');

		const values = readApplicationWindowForm(formData);

		expect(values.acceptsIndividualApplications).toBe(true);
		expect(values.acceptsDelegations).toBe(false);
	});

	it('counts a time the form left out as empty text', () => {
		const values = readApplicationWindowForm(new FormData());

		expect(values.applicationsOpenAt).toBe('');
		expect(values.applicationsCloseAt).toBe('');
	});

	it('counts anything but a chosen date as opening on publishing', () => {
		const formData = new FormData();
		formData.set('opensWhen', 'tomorrow');

		expect(readApplicationWindowForm(formData).opensWhen).toBe('publish');
		expect(readApplicationWindowForm(new FormData()).opensWhen).toBe('publish');
	});
});

describe('openingOnPublish', () => {
	const NOW = new Date('2026-11-01T12:00:00Z');

	it('keeps an opening that has already passed, so saving again changes nothing', () => {
		expect(openingOnPublish('2026-10-01T07:00:00Z', NOW)).toBe('2026-10-01T07:00:00Z');
	});

	it('opens now when no opening was ever set, never leaving it empty', () => {
		expect(openingOnPublish(null, NOW)).toBe('2026-11-01T12:00:00.000Z');
	});

	it('opens now in place of an opening that is still ahead', () => {
		expect(openingOnPublish('2026-12-01T09:00:00Z', NOW)).toBe('2026-11-01T12:00:00.000Z');
	});
});

describe('openingToStore', () => {
	const CONTEXT = {
		savedOpensAt: '2026-10-01T07:00:00Z',
		timezone: 'Europe/Amsterdam',
		now: new Date('2026-11-01T12:00:00Z')
	};

	/** The window sections as they would arrive with a date chosen. */
	const DATE_CHOSEN: ApplicationWindowValues = {
		opensWhen: 'date',
		applicationsOpenAt: '2026-12-01T09:00',
		applicationsCloseAt: '',
		acceptsIndividualApplications: true,
		acceptsDelegations: true
	};

	it('reads a chosen date in the conference timezone', () => {
		// 09:00 in Amsterdam in December is 08:00 in UTC.
		expect(openingToStore(DATE_CHOSEN, CONTEXT)).toBe('2026-12-01T08:00:00.000Z');
	});

	it('ignores the date box when the window opens on publishing', () => {
		const values: ApplicationWindowValues = { ...DATE_CHOSEN, opensWhen: 'publish' };

		expect(openingToStore(values, CONTEXT)).toBe('2026-10-01T07:00:00Z');
	});

	it('answers nothing for a chosen date left empty', () => {
		const values: ApplicationWindowValues = { ...DATE_CHOSEN, applicationsOpenAt: '' };

		expect(openingToStore(values, CONTEXT)).toBeNull();
	});
});

describe('openingChoiceFor', () => {
	const NOW = new Date('2026-11-01T12:00:00Z');

	it('starts on a chosen date while the saved opening is still ahead', () => {
		expect(openingChoiceFor('2026-12-01T09:00:00Z', NOW)).toBe('date');
	});

	it('starts on opening when published once the opening has passed or was never set', () => {
		expect(openingChoiceFor('2026-10-01T07:00:00Z', NOW)).toBe('publish');
		expect(openingChoiceFor(null, NOW)).toBe('publish');
	});
});

describe('validateApplicationWindowForm', () => {
	/**
	 * The conference's first day, which the closing time has to stay before,
	 * and the opening "As soon as I publish" stands for.
	 */
	const CONTEXT = { startDate: '2027-01-24', openingOnPublishLocal: '2026-11-01T13:00' };

	/** A window the form could really have been filled in with. */
	function windowValues(changes: Partial<ApplicationWindowValues> = {}): ApplicationWindowValues {
		return {
			opensWhen: 'date',
			applicationsOpenAt: '2026-10-01T09:00',
			applicationsCloseAt: '2026-12-15T23:59',
			acceptsIndividualApplications: true,
			acceptsDelegations: true,
			...changes
		};
	}

	it('accepts a window that is filled in properly', () => {
		expect(validateApplicationWindowForm(windowValues(), CONTEXT)).toEqual({});
	});

	it('accepts a window with no closing time', () => {
		const openOnly = windowValues({ applicationsCloseAt: '' });
		const onPublishOnly = windowValues({ opensWhen: 'publish', applicationsCloseAt: '' });

		expect(validateApplicationWindowForm(openOnly, CONTEXT)).toEqual({});
		expect(validateApplicationWindowForm(onPublishOnly, CONTEXT)).toEqual({});
	});

	it('asks for the date when a date is chosen and the box is left empty', () => {
		const values = windowValues({ applicationsOpenAt: '' });

		expect(validateApplicationWindowForm(values, CONTEXT).applicationsOpenAt).toBe(
			'Please choose when applications open.'
		);
	});

	it('ignores an empty date box when the window opens on publishing', () => {
		const values = windowValues({ opensWhen: 'publish', applicationsOpenAt: '' });

		expect(validateApplicationWindowForm(values, CONTEXT)).toEqual({});
	});

	it('compares the closing time with the opening on publishing, not the date box', () => {
		// The box says October, but publishing opens on 1 November at 13:00, so a
		// window closing in the last days of October would close before it opens.
		const values = windowValues({
			opensWhen: 'publish',
			applicationsCloseAt: '2026-10-30T23:59'
		});

		expect(validateApplicationWindowForm(values, CONTEXT).applicationsCloseAt).toBe(
			'Closing must be after opening.'
		);
	});

	it('refuses a window that closes before it opens', () => {
		const values = windowValues({
			applicationsOpenAt: '2026-12-15T23:59',
			applicationsCloseAt: '2026-10-01T09:00'
		});

		expect(validateApplicationWindowForm(values, CONTEXT).applicationsCloseAt).toBe(
			'Closing must be after opening.'
		);
	});

	it('refuses a window that closes at the very minute it opens', () => {
		const values = windowValues({
			applicationsOpenAt: '2026-10-01T09:00',
			applicationsCloseAt: '2026-10-01T09:00'
		});

		expect(validateApplicationWindowForm(values, CONTEXT).applicationsCloseAt).toBe(
			'Closing must be after opening.'
		);
	});

	it('accepts a closing time on the day before the conference starts', () => {
		const values = windowValues({ applicationsCloseAt: '2027-01-23T23:59' });

		expect(validateApplicationWindowForm(values, CONTEXT).applicationsCloseAt).toBeUndefined();
	});

	it('refuses a closing time on the first day of the conference', () => {
		// The dashboard checklist asks for a window that closes strictly before
		// the conference begins, so a window that closes that morning is refused
		// here too rather than being called valid and left unticked there.
		const values = windowValues({ applicationsCloseAt: '2027-01-24T00:00' });

		expect(validateApplicationWindowForm(values, CONTEXT).applicationsCloseAt).toBe(
			'Applications must close before the conference starts.'
		);
	});

	it('refuses a closing time after the conference has started', () => {
		const values = windowValues({ applicationsCloseAt: '2027-01-26T09:00' });

		expect(validateApplicationWindowForm(values, CONTEXT).applicationsCloseAt).toBe(
			'Applications must close before the conference starts.'
		);
	});

	it('says the times are the wrong way round when both closing rules fail', () => {
		// Both are wrong: the window closes during the conference, and it closes
		// before it opens. The message about the pair the organiser just typed is
		// the one to show.
		const values = windowValues({
			applicationsOpenAt: '2027-02-01T09:00',
			applicationsCloseAt: '2027-01-25T09:00'
		});

		expect(validateApplicationWindowForm(values, CONTEXT).applicationsCloseAt).toBe(
			'Closing must be after opening.'
		);
	});

	it('refuses a conference that accepts nobody', () => {
		const values = windowValues({
			acceptsIndividualApplications: false,
			acceptsDelegations: false
		});

		expect(validateApplicationWindowForm(values, CONTEXT).whoCanApply).toBe(
			'Accept individuals, delegations, or both.'
		);
	});

	it('accepts a conference that takes only one of the two kinds of applicant', () => {
		const individualsOnly = windowValues({ acceptsDelegations: false });
		const delegationsOnly = windowValues({ acceptsIndividualApplications: false });

		expect(validateApplicationWindowForm(individualsOnly, CONTEXT).whoCanApply).toBeUndefined();
		expect(validateApplicationWindowForm(delegationsOnly, CONTEXT).whoCanApply).toBeUndefined();
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const values = windowValues({
			applicationsCloseAt: '2027-01-26T09:00',
			acceptsIndividualApplications: false,
			acceptsDelegations: false
		});
		const errors = validateApplicationWindowForm(values, CONTEXT);

		expect(Object.keys(errors).sort()).toEqual(['applicationsCloseAt', 'whoCanApply']);
	});
});

describe('hasApplicationWindowErrors', () => {
	it('says nothing is wrong with an empty set of messages', () => {
		expect(hasApplicationWindowErrors({})).toBe(false);
	});

	it('says something is wrong as soon as one field has a message', () => {
		expect(
			hasApplicationWindowErrors({ whoCanApply: 'Accept individuals, delegations, or both.' })
		).toBe(true);
	});
});

describe('readFormSettingsForm', () => {
	it('reads the preference count, the deadline and both tick boxes', () => {
		const formData = new FormData();
		formData.set('committeePreferenceCount', '3');
		formData.set('askMotivation', 'on');
		formData.set('positionPaperRequired', 'on');
		formData.set('positionPaperDeadline', '2027-01-10T23:59');

		expect(readFormSettingsForm(formData)).toEqual({
			committeePreferenceCount: '3',
			askMotivation: true,
			positionPaperRequired: true,
			positionPaperDeadline: '2027-01-10T23:59'
		});
	});

	it('counts a tick box the form left out as unticked', () => {
		const values = readFormSettingsForm(new FormData());

		expect(values.askMotivation).toBe(false);
		expect(values.positionPaperRequired).toBe(false);
	});

	it('counts a field the form left out as empty text', () => {
		const values = readFormSettingsForm(new FormData());

		expect(values.committeePreferenceCount).toBe('');
		expect(values.positionPaperDeadline).toBe('');
	});
});

describe('validateFormSettingsForm', () => {
	/** What the conference itself says, for a conference nobody has applied to yet. */
	const CONTEXT = {
		applicationsOpenAtLocal: '2026-10-01T09:00',
		endDate: '2027-01-29',
		savedPreferenceCount: 2,
		hasApplications: false
	};

	/** Settings the form could really have been filled in with. */
	function settingsValues(changes: Partial<FormSettingsValues> = {}): FormSettingsValues {
		return {
			committeePreferenceCount: '2',
			askMotivation: true,
			positionPaperRequired: true,
			positionPaperDeadline: '2027-01-10T23:59',
			...changes
		};
	}

	/** The message the preference count earns on a conference nobody has applied to. */
	function preferenceCountError(count: string): string | undefined {
		const values = settingsValues({ committeePreferenceCount: count });

		return validateFormSettingsForm(values, CONTEXT).committeePreferenceCount;
	}

	it('accepts settings that are filled in properly', () => {
		expect(validateFormSettingsForm(settingsValues(), CONTEXT)).toEqual({});
	});

	it('accepts asking for no preferences and for the most it allows', () => {
		expect(preferenceCountError('0')).toBeUndefined();
		expect(preferenceCountError('3')).toBeUndefined();
	});

	it('refuses a preference count that is not one of the numbers offered', () => {
		const message = 'Please choose how many committee preferences to ask for.';

		expect(preferenceCountError('4')).toBe(message);
		expect(preferenceCountError('-1')).toBe(message);
		expect(preferenceCountError('1.5')).toBe(message);
		expect(preferenceCountError('two')).toBe(message);
	});

	it('refuses an unanswered preference count rather than reading it as none', () => {
		expect(preferenceCountError('')).toBe(
			'Please choose how many committee preferences to ask for.'
		);
	});

	it('refuses asking for fewer preferences once people have applied', () => {
		const values = settingsValues({ committeePreferenceCount: '1' });
		const context = { ...CONTEXT, hasApplications: true, savedPreferenceCount: 2 };

		expect(validateFormSettingsForm(values, context).committeePreferenceCount).toBe(
			'You cannot ask for fewer preferences after people applied.'
		);
	});

	it('allows asking for more preferences once people have applied', () => {
		const values = settingsValues({ committeePreferenceCount: '3' });
		const context = { ...CONTEXT, hasApplications: true, savedPreferenceCount: 2 };

		expect(validateFormSettingsForm(values, context).committeePreferenceCount).toBeUndefined();
	});

	it('allows asking for fewer preferences while nobody has applied', () => {
		const values = settingsValues({ committeePreferenceCount: '0' });
		const context = { ...CONTEXT, hasApplications: false, savedPreferenceCount: 2 };

		expect(validateFormSettingsForm(values, context).committeePreferenceCount).toBeUndefined();
	});

	it('asks for a deadline when position papers are required', () => {
		const values = settingsValues({ positionPaperDeadline: '' });

		expect(validateFormSettingsForm(values, CONTEXT).positionPaperDeadline).toBe(
			'Please set a deadline for position papers.'
		);
	});

	it('leaves an empty deadline box alone when position papers are not required', () => {
		const values = settingsValues({ positionPaperRequired: false, positionPaperDeadline: '' });

		expect(validateFormSettingsForm(values, CONTEXT)).toEqual({});
	});

	it("accepts a deadline on the conference's last day", () => {
		const values = settingsValues({ positionPaperDeadline: '2027-01-29T23:59' });

		expect(validateFormSettingsForm(values, CONTEXT).positionPaperDeadline).toBeUndefined();
	});

	it('refuses a deadline after the conference has ended', () => {
		const values = settingsValues({ positionPaperDeadline: '2027-01-30T09:00' });

		expect(validateFormSettingsForm(values, CONTEXT).positionPaperDeadline).toBe(
			'The deadline must be before the conference ends.'
		);
	});

	it('refuses a deadline at the very minute applications open', () => {
		const values = settingsValues({ positionPaperDeadline: '2026-10-01T09:00' });

		expect(validateFormSettingsForm(values, CONTEXT).positionPaperDeadline).toBe(
			'The deadline must be after applications open.'
		);
	});

	it('accepts a deadline a minute after applications open', () => {
		const values = settingsValues({ positionPaperDeadline: '2026-10-01T09:01' });

		expect(validateFormSettingsForm(values, CONTEXT).positionPaperDeadline).toBeUndefined();
	});

	it('says nothing about a deadline before an opening time that is not set', () => {
		const values = settingsValues({ positionPaperDeadline: '2026-01-01T09:00' });
		const context = { ...CONTEXT, applicationsOpenAtLocal: '' };

		expect(validateFormSettingsForm(values, context).positionPaperDeadline).toBeUndefined();
	});

	it('still checks a deadline that is left in the box when papers are not required', () => {
		const values = settingsValues({
			positionPaperRequired: false,
			positionPaperDeadline: '2027-02-01T09:00'
		});

		expect(validateFormSettingsForm(values, CONTEXT).positionPaperDeadline).toBe(
			'The deadline must be before the conference ends.'
		);
	});

	it('collects every problem at once rather than stopping at the first', () => {
		const values = settingsValues({
			committeePreferenceCount: '4',
			positionPaperDeadline: ''
		});
		const errors = validateFormSettingsForm(values, CONTEXT);

		expect(Object.keys(errors).sort()).toEqual([
			'committeePreferenceCount',
			'positionPaperDeadline'
		]);
	});
});

describe('hasFormSettingsErrors', () => {
	it('says nothing is wrong with an empty set of messages', () => {
		expect(hasFormSettingsErrors({})).toBe(false);
	});

	it('says something is wrong as soon as one field has a message', () => {
		expect(
			hasFormSettingsErrors({ positionPaperDeadline: 'Please set a deadline for position papers.' })
		).toBe(true);
	});
});

describe('applicationWindowNotice', () => {
	it('asks for a window when neither time is set', () => {
		const values = conference({ applicationsOpenAt: null, applicationsCloseAt: null });

		expect(applicationWindowNotice(values, DURING_THE_WINDOW)).toEqual({
			tone: 'warning',
			title: 'Set an opening and closing time',
			text: ''
		});
	});

	it('says when applications open while that is still ahead', () => {
		const beforeTheWindow = new Date('2026-09-01T12:00:00Z');

		expect(applicationWindowNotice(conference(), beforeTheWindow)).toEqual({
			tone: 'info',
			title: 'Open on 1 Oct 2026',
			text: WINDOW_TEXT
		});
	});

	it('says when applications closed once that has happened', () => {
		const afterTheWindow = new Date('2027-01-01T12:00:00Z');

		expect(applicationWindowNotice(conference(), afterTheWindow)).toEqual({
			tone: 'info',
			title: 'Closed on 15 Dec 2026',
			text: WINDOW_TEXT
		});
	});

	it('says applications are open between the two times', () => {
		expect(applicationWindowNotice(conference(), DURING_THE_WINDOW)).toEqual({
			tone: 'success',
			title: 'Applications are open now',
			text: WINDOW_TEXT
		});
	});

	it('describes a draft the same way it describes a published conference', () => {
		// This page is the organiser's own, so what the window is set to is worth
		// saying whether or not anybody else can see the conference yet.
		const draft = conference({ status: 'draft' });

		expect(applicationWindowNotice(draft, DURING_THE_WINDOW)).toEqual(
			applicationWindowNotice(conference(), DURING_THE_WINDOW)
		);
	});

	it('reads both times in the conference timezone and names the zone once', () => {
		// The window is stored in UTC, two hours behind Amsterdam in October and
		// one behind it in December. Read in New York the same two moments are on
		// the same days but five or six hours earlier in the day.
		const inNewYork = conference({ timezone: 'America/New_York' });

		expect(applicationWindowNotice(inNewYork, DURING_THE_WINDOW).text).toBe(
			'1 Oct 2026 03:00 – 15 Dec 2026 17:59 (America/New_York)'
		);
	});

	it('writes no window at all when only one of the two times is set', () => {
		const openOnly = conference({ applicationsCloseAt: null });
		const closeOnly = conference({ applicationsOpenAt: null });

		expect(applicationWindowNotice(openOnly, DURING_THE_WINDOW)).toEqual({
			tone: 'success',
			title: 'Applications are open now',
			text: ''
		});
		expect(applicationWindowNotice(closeOnly, DURING_THE_WINDOW)).toEqual({
			tone: 'success',
			title: 'Applications are open now',
			text: ''
		});
	});
});
