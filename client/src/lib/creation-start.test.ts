import { describe, expect, it } from 'vitest';
import { formatDateRange } from './dates';
import type { CreationOrganization, PreviousConference } from './creation-draft';
import { prefillDraft } from './creation-prefill';
import {
	editionComparison,
	hasCreationStartErrors,
	organizationCardLines,
	organizationStepPreview,
	suggestionFacts,
	readCreationStart,
	validateCreationStart,
	type CreationStartValues
} from './creation-start';

function values(overrides: Partial<CreationStartValues> = {}): CreationStartValues {
	return { organization: 'new', name: 'Delft MUN', city: '', countryCode: '', ...overrides };
}

describe('readCreationStart', () => {
	it('reads the choice and the new organisation, trimmed', () => {
		const formData = new FormData();
		formData.set('organization', ' new ');
		formData.set('organizationName', ' Delft MUN ');
		formData.set('organizationCity', 'Delft');
		formData.set('organizationCountry', 'nl');

		expect(readCreationStart(formData)).toEqual({
			organization: 'new',
			name: 'Delft MUN',
			city: 'Delft',
			countryCode: 'NL'
		});
	});
});

describe('validateCreationStart', () => {
	it('asks a new organisation for a name of a sensible length', () => {
		expect(validateCreationStart(values({ name: '' }), []).name).toBeDefined();
		expect(validateCreationStart(values({ name: 'x'.repeat(121) }), []).name).toBeDefined();
		expect(validateCreationStart(values(), [])).toEqual({});
	});

	it('keeps a new organisation’s city within the length the database allows', () => {
		expect(validateCreationStart(values({ city: 'x'.repeat(121) }), []).city).toBe(
			'Keep the city under 120 characters.'
		);
		expect(validateCreationStart(values({ city: 'x'.repeat(120) }), [])).toEqual({});
		expect(validateCreationStart(values({ city: '' }), [])).toEqual({});
	});

	it('accepts no country or a real one', () => {
		expect(validateCreationStart(values({ countryCode: 'NL' }), [])).toEqual({});
		expect(validateCreationStart(values({ countryCode: 'XX' }), []).countryCode).toBeDefined();
	});

	it('only trusts an organisation the reader belongs to', () => {
		expect(validateCreationStart(values({ organization: 'org-1' }), ['org-1'])).toEqual({});
		expect(
			validateCreationStart(values({ organization: 'org-2' }), ['org-1']).organization
		).toBeDefined();
		expect(
			validateCreationStart(values({ organization: '' }), ['org-1']).organization
		).toBeDefined();
	});
});

describe('hasCreationStartErrors', () => {
	it('is true when anything needs fixing', () => {
		expect(hasCreationStartErrors({})).toBe(false);
		expect(hasCreationStartErrors({ name: 'Enter a name.' })).toBe(true);
	});
});

const organization: CreationOrganization = {
	id: 'org-1',
	slug: 'delft-mun',
	name: 'Delft MUN',
	city: 'Delft',
	countryCode: 'NL',
	countryName: 'Netherlands',
	logoPath: null,
	websiteUrl: null,
	isStripeConnected: false,
	lastConference: { name: 'Delft MUN 2026', startDate: '2026-04-17', endDate: '2026-04-19' }
};

const previous = {
	id: 'conf-1',
	slug: 'delft-mun-2026',
	name: 'Delft MUN 2026',
	startDate: '2026-04-17',
	endDate: '2026-04-19',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	timezone: 'Europe/Amsterdam',
	locationMode: 'in_person',
	city: 'Delft',
	countryCode: 'NL',
	countryName: 'Netherlands',
	venueStatus: 'tba',
	venueName: null,
	venueAddress: null,
	bannerPath: null,
	logoPath: null,
	tagline: null,
	description: null,
	contactEmail: null,
	websiteUrl: null,
	instagramUrl: null,
	currency: 'EUR',
	level: 'university',
	committeeCount: 1,
	questionCount: 1,
	fees: [],
	collectsPaymentsManually: false,
	acceptsIndividualApplications: true,
	acceptsDelegations: false,
	committeePreferenceCount: 2,
	askMotivation: false,
	positionPaperRequired: false,
	applicationCloseRule: 'fixed',
	applicationCloseOffsetDays: 0
} satisfies PreviousConference;

const now = new Date('2026-10-04T12:00:00Z');

describe('organizationCardLines', () => {
	it('says where an organisation is based and its latest conference', () => {
		expect(organizationCardLines(organization)).toEqual([
			'Delft, Netherlands',
			'Latest: Delft MUN 2026'
		]);
		expect(
			organizationCardLines({
				...organization,
				city: null,
				countryName: null,
				lastConference: null
			})
		).toEqual([]);
	});
});

describe('suggestionFacts', () => {
	it('adds the country name and the sources to the prefilled values', () => {
		const suggestion = prefillDraft({ organization, previous, now });
		const facts = suggestionFacts(suggestion);

		expect(facts.countryName).toBe('Netherlands');
		expect(facts.prefillSources).toBe(suggestion.sources);
		expect(facts.name).toBe('Delft MUN 2027');
	});
});

describe('organizationStepPreview', () => {
	it('shows nothing known before a choice', () => {
		const preview = organizationStepPreview({ chosen: null, newOrganization: null, now });

		expect(preview).toMatchObject({ name: 'Your conference', organizedBy: 'your organisation' });
		expect(preview.facts.map((fact) => fact.text)).toEqual([
			'Dates to be announced',
			'Location to be announced'
		]);
	});

	it('follows a new organisation’s fields as they are typed', () => {
		const preview = organizationStepPreview({
			chosen: null,
			newOrganization: { name: ' Leiden MUN ', city: 'Leiden', countryCode: 'NL' },
			now
		});

		expect(preview).toMatchObject({ name: 'Leiden MUN', organizedBy: 'Leiden MUN' });
		expect(preview.facts.map((fact) => fact.text)).toContain('Leiden, Netherlands');
		expect(preview.facts.map((fact) => fact.text)).toContain('Europe/Amsterdam');
		expect(preview.facts.some((fact) => fact.kind === 'level')).toBe(false);
	});

	it('keeps the empty words while a new organisation has no name', () => {
		const preview = organizationStepPreview({
			chosen: null,
			newOrganization: { name: '', city: '', countryCode: 'XX' },
			now
		});

		expect(preview).toMatchObject({ name: 'Your conference', organizedBy: 'your organisation' });
		expect(preview.facts.map((fact) => fact.text)).toContain('Location to be announced');
	});

	it('shows the prefilled next edition of a chosen organisation', () => {
		const suggestion = prefillDraft({ organization, previous, now });
		const preview = organizationStepPreview({
			chosen: { organization, suggestion },
			newOrganization: null,
			now
		});

		expect(preview).toMatchObject({
			name: 'Delft MUN 2027',
			organizedBy: 'Delft MUN',
			tagline: null,
			description: null
		});
	});
});

describe('editionComparison', () => {
	it('sets the previous edition beside the suggested next one, with its chips', () => {
		const comparison = editionComparison(previous, prefillDraft({ organization, previous, now }));

		expect(comparison.previous).toEqual({
			name: 'Delft MUN 2026',
			dates: formatDateRange('2026-04-17', '2026-04-19'),
			place: 'Delft, Netherlands'
		});
		expect(comparison.next.name).toEqual({ text: 'Delft MUN 2027', chip: 'Generated name' });
		// The same weekdays a year on: Friday 16 to Sunday 18 April 2027.
		expect(comparison.next.dates).toEqual({
			text: formatDateRange('2027-04-16', '2027-04-18'),
			chip: 'Suggested dates'
		});
		expect(comparison.next.place).toEqual({
			text: 'Delft, Netherlands',
			chip: 'Based on last conference'
		});
	});
});
