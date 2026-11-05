import { describe, expect, it } from 'vitest';
import type { CreationDraft, CreationOrganization, PreviousConference } from './creation-draft';
import {
	applyCascades,
	cascadedName,
	markUserOverrides,
	prefillDraft,
	regeneratedName
} from './creation-prefill';

const now = new Date('2026-10-04T12:00:00Z');

function organization(overrides: Partial<CreationOrganization> = {}): CreationOrganization {
	return {
		id: 'org-1',
		slug: 'delft-mun',
		name: 'Delft MUN',
		city: 'Rotterdam',
		countryCode: 'NL',
		countryName: 'Netherlands',
		logoPath: 'organizations/org-1/logo.png',
		websiteUrl: 'https://delftmun.nl',
		isStripeConnected: false,
		lastConference: null,
		...overrides
	};
}

function previous(overrides: Partial<PreviousConference> = {}): PreviousConference {
	return {
		id: 'conf-1',
		slug: 'delft-mun-2026',
		name: 'Delft MUN 2026',
		// A Friday to a Sunday.
		startDate: '2026-04-17',
		endDate: '2026-04-19',
		conferenceTimeStatus: 'known',
		startTime: '09:30',
		endTime: '18:00',
		timezone: 'Europe/Amsterdam',
		locationMode: 'in_person',
		city: 'Delft',
		countryCode: 'NL',
		countryName: 'Netherlands',
		venueStatus: 'known',
		venueName: 'Aula',
		venueAddress: null,
		bannerPath: 'conferences/conf-1/banner.jpg',
		logoPath: null,
		tagline: 'Delft MUN 2026: diplomacy in April 2026',
		description: null,
		contactEmail: 'sg@delftmun.nl',
		websiteUrl: null,
		instagramUrl: null,
		currency: 'EUR',
		level: 'university',
		committeeCount: 4,
		questionCount: 1,
		fees: [],
		collectsPaymentsManually: true,
		acceptsIndividualApplications: true,
		acceptsDelegations: false,
		committeePreferenceCount: 2,
		askMotivation: true,
		positionPaperRequired: true,
		applicationCloseRule: 'relative',
		applicationCloseOffsetDays: -21,
		...overrides
	};
}

/** A saved draft built from a prefill, so the cascades see a real row. */
function draftFrom(
	prefill: ReturnType<typeof prefillDraft>,
	overrides: Partial<CreationDraft> = {}
): CreationDraft {
	return {
		...prefill.values,
		id: 'draft-1',
		slug: 'draft',
		organizationId: 'org-1',
		status: 'draft',
		creationStep: 'basics',
		countryName: null,
		venueAddress: null,
		applicationsOpenAt: null,
		prefillSources: prefill.sources,
		updatedAt: now.toISOString(),
		...overrides
	};
}

describe('prefillDraft', () => {
	it('takes the previous edition over the organisation', () => {
		const { values, sources } = prefillDraft({
			organization: organization(),
			previous: previous(),
			now
		});

		expect(values.name).toBe('Delft MUN 2027');
		expect(values.startDate).toBe('2027-04-16');
		expect(values.endDate).toBe('2027-04-18');
		expect(values.city).toBe('Delft');
		expect(values.tagline).toBe('Delft MUN 2027: diplomacy in April 2027');
		expect(values.conferenceTimeStatus).toBe('known');
		expect(values.startTime).toBe('09:30');
		expect(values.level).toBe('university');
		expect(values.acceptsDelegations).toBe(false);
		expect(values.applicationCloseOffsetDays).toBe(-21);
		expect(values.applicationsCloseAt).not.toBeNull();
		expect(values.bannerPath).toBe('conferences/conf-1/banner.jpg');
		expect(values.collectsPaymentsManually).toBe(true);
		expect(sources).toMatchObject({
			name: 'previous_conference',
			start_date: 'previous_conference',
			city: 'previous_conference',
			banner_path: 'previous_conference',
			logo_path: 'organization',
			website_url: 'organization'
		});
	});

	it('starts the venue as to be announced and applications closed', () => {
		const { values } = prefillDraft({ organization: organization(), previous: previous(), now });

		expect(values.venueStatus).toBe('tba');
		expect(values.venueName).toBeNull();
		expect(values.applicationOpenMode).toBe('manual');
		expect(values.feeStatus).toBe('undecided');
	});

	it('uses the organisation, then safe defaults, without an earlier edition', () => {
		const { values, sources } = prefillDraft({ organization: organization(), previous: null, now });

		expect(values.name).toBe('Delft MUN');
		expect(sources.name).toBe('organization');
		expect(values.city).toBe('Rotterdam');
		expect(sources.city).toBe('organization');
		expect(values.timezone).toBe('Europe/Amsterdam');
		expect(values.currency).toBe('EUR');
		expect(sources.currency).toBe('system_default');
		expect(values.level).toBe('mixed');
		expect(values.tagline).toBeNull();
		expect(values.conferenceTimeStatus).toBe('tba');
		expect(values.committeePreferenceCount).toBe(3);
		expect(values.applicationCloseOffsetDays).toBe(-14);
	});

	it('stores a placeholder a year ahead when there are no dates to suggest', () => {
		const { values, sources } = prefillDraft({ organization: organization(), previous: null, now });

		expect(values.startDate).toBe('2027-10-04');
		expect(values.endDate).toBe('2027-10-06');
		expect(sources.start_date).toBe('system_default');
	});

	it('falls back to the system timezone when nothing says where it is', () => {
		const { values, sources } = prefillDraft({
			organization: organization({ city: null, countryCode: null }),
			previous: null,
			now
		});

		expect(values.city).toBeNull();
		expect(values.timezone).toBe('Europe/Amsterdam');
		expect(sources.timezone).toBe('system_default');
	});

	it('copies times of day only when the previous edition knew them', () => {
		const { values, sources } = prefillDraft({
			organization: organization(),
			previous: previous({ conferenceTimeStatus: 'tba', startTime: null, endTime: null }),
			now
		});

		expect(values.conferenceTimeStatus).toBe('tba');
		expect(sources.start_time).toBeUndefined();
	});
});

describe('markUserOverrides', () => {
	it('marks the changed fields as typed, in column names', () => {
		const marked = markUserOverrides(
			{ name: 'previous_conference', country_code: 'organization' },
			{ name: 'Delft MUN 2027', countryCode: 'NL', city: 'Delft' },
			{ name: 'Delft MUN XX', countryCode: 'BE', city: 'Delft' }
		);

		expect(marked).toEqual({ name: 'user', country_code: 'user' });
	});

	it('ignores fields that carry no source', () => {
		expect(markUserOverrides({}, { venueStatus: 'tba' }, { venueStatus: 'known' })).toEqual({});
	});
});

describe('applyCascades', () => {
	it('moves the year of a generated name with the start date', () => {
		const prefill = prefillDraft({ organization: organization(), previous: previous(), now });
		const draft = draftFrom(prefill, {
			startDate: '2028-04-14',
			endDate: '2028-04-16',
			prefillSources: { ...prefill.sources, start_date: 'user' }
		});

		expect(applyCascades(draft, now).name).toBe('Delft MUN 2028');
	});

	it('adds the year to a name without one once dates are chosen', () => {
		const prefill = prefillDraft({ organization: organization(), previous: null, now });
		const undecided = draftFrom(prefill);
		const decided = draftFrom(prefill, {
			startDate: '2027-03-05',
			endDate: '2027-03-07',
			prefillSources: { ...prefill.sources, start_date: 'user' }
		});

		expect(applyCascades(undecided, now).name).toBeUndefined();
		expect(applyCascades(decided, now).name).toBe('Delft MUN 2027');
	});

	it('never overwrites a typed name or timezone', () => {
		const prefill = prefillDraft({ organization: organization(), previous: previous(), now });
		const draft = draftFrom(prefill, {
			name: 'My own name 2026',
			countryCode: 'GB',
			city: 'London',
			startDate: '2028-04-14',
			prefillSources: { ...prefill.sources, name: 'user', timezone: 'user', start_date: 'user' }
		});

		const changes = applyCascades(draft, now);
		expect(changes.name).toBeUndefined();
		expect(changes.timezone).toBeUndefined();
	});

	it('moves a generated timezone with the place', () => {
		const prefill = prefillDraft({ organization: organization(), previous: previous(), now });
		const draft = draftFrom(prefill, { city: 'London', countryCode: 'GB' });

		expect(applyCascades(draft, now).timezone).toBe('Europe/London');
	});

	it('recomputes a relative closing date and returns nothing that did not change', () => {
		const prefill = prefillDraft({ organization: organization(), previous: previous(), now });

		expect(applyCascades(draftFrom(prefill), now)).toEqual({});

		const moved = applyCascades(
			draftFrom(prefill, {
				startDate: '2027-05-14',
				prefillSources: { ...prefill.sources, start_date: 'user', name: 'user' }
			}),
			now
		);
		expect(moved.applicationsCloseAt).toBe('2027-04-23T21:59:00.000Z');
	});

	it('moves placeholder dates that fell behind a year ahead again', () => {
		const prefill = prefillDraft({ organization: organization(), previous: null, now });
		const later = new Date('2028-01-01T00:00:00Z');

		expect(applyCascades(draftFrom(prefill), later)).toMatchObject({
			startDate: '2028-12-31',
			endDate: '2029-01-02'
		});
	});
});

describe('cascadedName', () => {
	it('gives a generated name the start date’s year, and nothing when that changes nothing', () => {
		const prefill = prefillDraft({ organization: organization(), previous: previous(), now });
		const moved = draftFrom(prefill, {
			startDate: '2028-04-14',
			endDate: '2028-04-16',
			prefillSources: { ...prefill.sources, start_date: 'user' }
		});

		expect(cascadedName(moved)).toBe('Delft MUN 2028');
		expect(cascadedName(draftFrom(prefill))).toBeNull();
		expect(
			cascadedName({ ...moved, prefillSources: { ...moved.prefillSources, name: 'user' } })
		).toBeNull();
	});
});

describe('regeneratedName', () => {
	it('gives next edition name from the previous one', () => {
		expect(regeneratedName(previous(), organization(), '2027-04-16')).toEqual({
			name: 'Delft MUN 2027',
			source: 'previous_conference'
		});
	});

	it('gives the organisation name and the year without one', () => {
		expect(regeneratedName(null, organization(), '2027-04-16')).toEqual({
			name: 'Delft MUN 2027',
			source: 'organization'
		});
	});
});
