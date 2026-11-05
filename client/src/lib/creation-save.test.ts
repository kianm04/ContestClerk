import { describe, expect, it } from 'vitest';
import type { CreationDraft } from './creation-draft';
import { planDraftSave } from './creation-save';

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

const now = new Date('2026-10-04T12:00:00Z');

describe('planDraftSave', () => {
	it('marks what changed as the organiser’s own and leaves the rest alone', () => {
		const plan = planDraftSave(DRAFT, { name: 'Delft MUN', tagline: 'Three days of debate' }, now);

		expect(plan.sources.name).toBe('user');
		expect(plan.sources.tagline).toBe('previous_conference');
	});

	it('adds the values that follow, such as the year of a generated name', () => {
		const plan = planDraftSave(DRAFT, { startDate: '2028-04-14', endDate: '2028-04-16' }, now);

		expect(plan.patch).toMatchObject({
			startDate: '2028-04-14',
			name: 'Delft MUN 2028',
			applicationsCloseAt: '2028-03-31T21:59:00.000Z'
		});
	});

	it('lets the caller name a source it knows better', () => {
		const plan = planDraftSave(DRAFT, { startDate: '2028-04-14', endDate: '2028-04-16' }, now, {
			start_date: 'previous_conference',
			end_date: 'previous_conference'
		});

		expect(plan.sources.start_date).toBe('previous_conference');
	});
});
