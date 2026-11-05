import { describe, expect, it } from 'vitest';
import type { CreationDraft } from './creation-draft';
import {
	closingWarning,
	draftWithWhen,
	readWhen,
	suggestedDatesSave,
	validateWhen,
	whenFormValues,
	whenPatch,
	type WhenValues
} from './creation-when';

/** A draft a returning organiser has just started: dates chosen, the name generated. */
const DRAFT: CreationDraft = {
	id: 'draft-1',
	slug: 'delft-mun-2027',
	name: 'Delft MUN 2027',
	tagline: 'Three days of debate',
	description: null,
	organizationId: 'org-1',
	status: 'draft',
	creationStep: 'basics',
	locationMode: 'in_person',
	city: 'Delft',
	countryCode: 'NL',
	countryName: 'Netherlands',
	venueStatus: 'tba',
	venueName: null,
	venueAddress: null,
	startDate: '2027-04-16',
	endDate: '2027-04-18',
	timezone: 'Europe/Amsterdam',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	currency: 'EUR',
	level: 'university',
	logoPath: null,
	bannerPath: null,
	contactEmail: null,
	websiteUrl: null,
	instagramUrl: null,
	feeStatus: 'undecided',
	collectsPaymentsManually: false,
	applicationOpenMode: 'manual',
	applicationsOpenAt: null,
	applicationCloseRule: 'relative',
	applicationCloseOffsetDays: -14,
	applicationsCloseAt: '2027-04-02T21:59:00.000Z',
	acceptsIndividualApplications: true,
	acceptsDelegations: true,
	committeePreferenceCount: 3,
	askMotivation: false,
	positionPaperRequired: false,
	prefillSources: {
		name: 'previous_conference',
		tagline: 'previous_conference',
		start_date: 'previous_conference',
		end_date: 'previous_conference',
		timezone: 'organization',
		city: 'organization',
		country_code: 'organization'
	},
	updatedAt: '2026-10-04T10:00:00Z'
};

/** The form for that draft, unchanged. */
const VALUES: WhenValues = {
	startDate: '2027-04-16',
	endDate: '2027-04-18',
	isTimesTba: true,
	startTime: '',
	endTime: '',
	locationMode: 'in_person',
	city: 'Delft',
	countryCode: 'NL',
	venueName: '',
	venueAddress: '',
	timezone: 'Europe/Amsterdam'
};

const now = new Date('2026-10-04T12:00:00Z');

describe('readWhen', () => {
	it('reads the fields, the switch, and minutes of a time', () => {
		const formData = new FormData();
		formData.set('startDate', '2027-04-16');
		formData.set('endDate', '2027-04-18');
		formData.set('startTime', '09:30:00');
		formData.set('endTime', '17:00');
		formData.set('locationMode', 'hybrid');
		formData.set('city', ' Delft ');
		formData.set('countryCode', 'nl');
		formData.set('timezone', 'Europe/Amsterdam');

		expect(readWhen(formData)).toEqual({
			...VALUES,
			isTimesTba: false,
			startTime: '09:30',
			endTime: '17:00',
			locationMode: 'hybrid'
		});
	});

	it('reads "Times not decided yet" when it is sent', () => {
		const formData = new FormData();
		formData.set('timesTba', 'on');

		expect(readWhen(formData).isTimesTba).toBe(true);
	});
});

describe('validateWhen', () => {
	it('finds nothing wrong with a good form, or with no dates at all', () => {
		expect(validateWhen(VALUES, { isContinuing: true })).toEqual({});
		expect(validateWhen({ ...VALUES, startDate: '', endDate: '' }, { isContinuing: true })).toEqual(
			{}
		);
	});

	it('asks for both days only when moving on', () => {
		const half = { ...VALUES, endDate: '' };

		expect(validateWhen(half, { isContinuing: false })).toEqual({});
		expect(validateWhen(half, { isContinuing: true }).endDate).toBe('Please pick both days.');
		expect(validateWhen({ ...VALUES, startDate: '' }, { isContinuing: true }).startDate).toBe(
			'Please pick both days.'
		);
	});

	it('refuses a last day before the first', () => {
		const errors = validateWhen({ ...VALUES, endDate: '2027-04-15' }, { isContinuing: false });

		expect(errors.endDate).toBe('The last day cannot be before the first day.');
	});

	it('refuses things that are not days, times, modes, countries or timezones', () => {
		const errors = validateWhen(
			{
				...VALUES,
				startDate: 'soon',
				startTime: 'noon',
				endTime: '5pm',
				locationMode: 'moon',
				countryCode: 'XX',
				timezone: 'Mars/Olympus'
			},
			{ isContinuing: false }
		);

		expect(Object.keys(errors).sort()).toEqual([
			'countryCode',
			'endTime',
			'locationMode',
			'startDate',
			'startTime',
			'timezone'
		]);
	});

	it('refuses a last day that is not a day', () => {
		expect(validateWhen({ ...VALUES, endDate: 'later' }, { isContinuing: false }).endDate).toBe(
			'Please pick a day.'
		);
	});
});

describe('whenPatch', () => {
	it('saves dates, times as a pair, the place and a to-be-announced venue', () => {
		const values = { ...VALUES, isTimesTba: false, startTime: '09:00', endTime: '17:00' };
		const { patch, venueAddress, hasPickedFirstDates } = whenPatch(values, {}, DRAFT);

		expect(patch).toEqual({
			startDate: '2027-04-16',
			endDate: '2027-04-18',
			conferenceTimeStatus: 'known',
			startTime: '09:00',
			endTime: '17:00',
			locationMode: 'in_person',
			city: 'Delft',
			countryCode: 'NL',
			venueStatus: 'tba',
			venueName: null
		});
		expect(venueAddress).toBeNull();
		expect(hasPickedFirstDates).toBe(false);
	});

	it('keeps times to be announced while the switch is on or a time is missing', () => {
		const switchedOn = whenPatch({ ...VALUES, startTime: '09:00', endTime: '17:00' }, {}, DRAFT);
		const halfTimes = whenPatch({ ...VALUES, isTimesTba: false, startTime: '09:00' }, {}, DRAFT);

		for (const { patch } of [switchedOn, halfTimes]) {
			expect(patch).toMatchObject({ conferenceTimeStatus: 'tba', startTime: null, endTime: null });
		}
	});

	it('leaves the placeholder alone when the dates are empty or wrong', () => {
		const empty = whenPatch({ ...VALUES, startDate: '', endDate: '' }, {}, DRAFT);
		const wrong = whenPatch(
			VALUES,
			{ endDate: 'The last day cannot be before the first day.' },
			DRAFT
		);

		expect(empty.patch).not.toHaveProperty('startDate');
		expect(wrong.patch).not.toHaveProperty('endDate');
	});

	it('says when the first dates of a draft without dates were picked', () => {
		const undecided = { ...DRAFT, prefillSources: { start_date: 'system_default' as const } };

		expect(whenPatch(VALUES, {}, undecided).hasPickedFirstDates).toBe(true);
	});

	it('names a venue, with its address', () => {
		const values = { ...VALUES, venueName: 'Aula', venueAddress: 'Mekelweg 5' };
		const { patch, venueAddress } = whenPatch(values, {}, DRAFT);

		expect(patch).toMatchObject({ venueStatus: 'known', venueName: 'Aula' });
		expect(venueAddress).toBe('Mekelweg 5');
	});

	it('drops the city, country and venue of an online conference', () => {
		const values = { ...VALUES, locationMode: 'online', venueName: 'Aula' };
		const { patch, venueAddress } = whenPatch(values, {}, DRAFT);

		expect(patch).toMatchObject({
			locationMode: 'online',
			city: null,
			countryCode: null,
			venueStatus: 'tba',
			venueName: null
		});
		expect(venueAddress).toBeNull();
	});

	it('leaves the place alone when the mode is not one', () => {
		const { patch, venueAddress } = whenPatch({ ...VALUES, locationMode: '' }, {}, DRAFT);

		expect(patch).not.toHaveProperty('city');
		expect(venueAddress).toBeUndefined();
	});

	it('lets a timezone follow the place unless the organiser chose another', () => {
		const moved = { ...VALUES, city: 'New York', countryCode: 'US', timezone: 'America/New_York' };
		const chosen = { ...VALUES, timezone: 'Europe/London' };

		expect(whenPatch(moved, {}, DRAFT).patch).not.toHaveProperty('timezone');
		expect(whenPatch(chosen, {}, DRAFT).patch.timezone).toBe('Europe/London');
	});

	it('keeps saving a timezone the organiser chose before', () => {
		const draft = {
			...DRAFT,
			prefillSources: { ...DRAFT.prefillSources, timezone: 'user' as const }
		};
		const values = { ...VALUES, city: 'New York', countryCode: 'US', timezone: 'America/New_York' };

		expect(whenPatch(values, {}, draft).patch.timezone).toBe('America/New_York');
	});
});

describe('whenFormValues', () => {
	it('fills the form from the draft', () => {
		expect(whenFormValues(DRAFT)).toEqual(VALUES);
	});

	it('leaves placeholder dates empty and shows known times', () => {
		const values = whenFormValues({
			...DRAFT,
			conferenceTimeStatus: 'known',
			startTime: '09:00:00',
			endTime: '17:00:00',
			prefillSources: { start_date: 'system_default' }
		});

		expect(values).toMatchObject({
			startDate: '',
			endDate: '',
			isTimesTba: false,
			startTime: '09:00',
			endTime: '17:00'
		});
	});
});

describe('draftWithWhen', () => {
	it('is the draft with the form’s dates, place and timezone', () => {
		const draft = draftWithWhen(DRAFT, {
			...VALUES,
			startDate: '2027-05-07',
			endDate: '2027-05-09',
			city: 'Paris',
			countryCode: 'FR',
			timezone: 'Europe/Paris'
		});

		expect(draft).toMatchObject({
			startDate: '2027-05-07',
			city: 'Paris',
			countryName: 'France',
			timezone: 'Europe/Paris'
		});
	});

	it('counts the first dates of an undecided draft as chosen', () => {
		const undecided = { ...DRAFT, prefillSources: { start_date: 'system_default' as const } };

		expect(draftWithWhen(undecided, VALUES).prefillSources.start_date).toBe('user');
		expect(
			draftWithWhen(undecided, { ...VALUES, startDate: '', endDate: '' }).prefillSources
		).toEqual({ start_date: 'system_default' });
	});

	it('has no place when online, and keeps the draft’s timezone over a wrong one', () => {
		const draft = draftWithWhen(DRAFT, { ...VALUES, locationMode: 'online', timezone: 'Nowhere' });

		expect(draft).toMatchObject({ city: null, countryName: null, timezone: 'Europe/Amsterdam' });
	});

	it('moves a generated name to the year of the new dates, and leaves a typed one alone', () => {
		const nextYear = { ...VALUES, startDate: '2028-04-14', endDate: '2028-04-16' };
		const typed = { ...DRAFT, prefillSources: { ...DRAFT.prefillSources, name: 'user' as const } };

		expect(draftWithWhen(DRAFT, nextYear).name).toBe('Delft MUN 2028');
		expect(draftWithWhen(typed, nextYear).name).toBe('Delft MUN 2027');
	});
});

describe('closingWarning', () => {
	it('says nothing while the closing date lies ahead', () => {
		expect(closingWarning(DRAFT, now)).toBeNull();
	});

	it('says nothing without dates or with a fixed closing date', () => {
		const soon = { ...DRAFT, startDate: '2026-10-10' };

		expect(
			closingWarning({ ...soon, prefillSources: { start_date: 'system_default' } }, now)
		).toBeNull();
		expect(closingWarning({ ...soon, applicationCloseRule: 'fixed' }, now)).toBeNull();
	});

	it('warns when the closing date has gone and suggests a later one', () => {
		const warning = closingWarning({ ...DRAFT, startDate: '2026-10-10' }, now);

		expect(warning).toEqual({ closesOn: '26 Sept', offsetDays: -14, suggestedOffset: -3 });
	});
});

describe('suggestedDatesSave', () => {
	// A Friday to a Sunday.
	const previous = {
		startDate: '2026-04-17',
		endDate: '2026-04-19',
		conferenceTimeStatus: 'known' as const,
		startTime: '10:00:00',
		endTime: '17:00:00'
	};

	it('saves next year’s dates and the old times, from the last conference', () => {
		expect(suggestedDatesSave(previous)).toEqual({
			patch: {
				startDate: '2027-04-16',
				endDate: '2027-04-18',
				conferenceTimeStatus: 'known',
				startTime: '10:00',
				endTime: '17:00'
			},
			sources: {
				start_date: 'previous_conference',
				end_date: 'previous_conference',
				start_time: 'previous_conference',
				end_time: 'previous_conference'
			}
		});
	});

	it('leaves the times alone when the last conference had none', () => {
		const save = suggestedDatesSave({
			...previous,
			conferenceTimeStatus: 'tba',
			startTime: null,
			endTime: null
		});

		expect(save?.patch).toEqual({ startDate: '2027-04-16', endDate: '2027-04-18' });
	});

	it('suggests nothing from dates that are not dates', () => {
		expect(suggestedDatesSave({ ...previous, startDate: 'soon' })).toBeNull();
	});
});
