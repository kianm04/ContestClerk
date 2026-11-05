import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape the actions are given.
import type { RequestEvent } from './$types';
import type { CreationDraft, CreationOrganization, PreviousConference } from '$lib/creation-draft';

// The organiser check, the queries and the storage are stood in for, so these
// tests are about what the actions decide. Working out what a save writes
// (`$lib/creation-save`) is pure and runs for real.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn() }));
vi.mock('$lib/server/conferences', () => ({
	uploadConferenceImage: vi.fn(),
	removeConferenceImage: vi.fn()
}));
vi.mock('$lib/server/creation', () => ({
	findPreviousConference: vi.fn(),
	getCreationDraft: vi.fn(),
	getCreationOrganization: vi.fn(),
	setCreationStep: vi.fn(),
	updateCreationDraft: vi.fn()
}));

import { removeConferenceImage, uploadConferenceImage } from '$lib/server/conferences';
import {
	findPreviousConference,
	getCreationDraft,
	getCreationOrganization,
	setCreationStep,
	updateCreationDraft
} from '$lib/server/creation';

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

const ORGANIZATION: CreationOrganization = {
	id: 'org-1',
	slug: 'delft-mun',
	name: 'Delft MUN',
	city: 'Delft',
	countryCode: 'NL',
	countryName: 'Netherlands',
	logoPath: null,
	websiteUrl: null,
	isStripeConnected: false,
	lastConference: null
};

const PREVIOUS = {
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

/** The form as the page sends it for `DRAFT`, unchanged. */
const FORM = {
	name: 'Delft MUN 2027',
	tagline: 'Three days of debate',
	description: '',
	contactEmail: '',
	websiteUrl: '',
	instagramUrl: ''
};

/** The few pieces of a request the actions read; the cast says "this is enough". */
function makeEvent(form: Record<string, string | File>): RequestEvent {
	const formData = new FormData();
	for (const [name, value] of Object.entries(form)) {
		formData.set(name, value);
	}

	return {
		url: new URL('http://localhost/create/delft-mun-2027/basics'),
		params: { slug: DRAFT.slug },
		locals: { supabase: {} },
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** Run an action, and give back what it returned or threw: a redirect is thrown. */
async function run(
	action: keyof typeof actions,
	form: Record<string, string | File>
): Promise<unknown> {
	try {
		return await actions[action](makeEvent(form));
	} catch (thrown) {
		return thrown;
	}
}

/** The patch and sources of the first draft update. */
function firstUpdate() {
	const [, , patch, sources] = vi.mocked(updateCreationDraft).mock.calls[0];
	return { patch, sources };
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(getCreationDraft).mockResolvedValue(DRAFT);
	vi.mocked(getCreationOrganization).mockResolvedValue(ORGANIZATION);
	vi.mocked(findPreviousConference).mockResolvedValue(PREVIOUS);
});

describe('save', () => {
	it('marks a changed name as the organiser’s own', async () => {
		const result = await run('save', { ...FORM, name: 'Delft Model UN' });

		expect(result).toMatchObject({ saved: true, draft: DRAFT, errors: {} });
		expect(firstUpdate().patch.name).toBe('Delft Model UN');
		expect(firstUpdate().sources.name).toBe('user');
	});

	it('leaves the name’s source alone when only the tagline changed', async () => {
		await run('save', { ...FORM, tagline: 'Debate in Delft' });

		expect(firstUpdate().sources).toMatchObject({ name: 'previous_conference', tagline: 'user' });
	});

	it('saves the good fields and sends back what is wrong with the rest', async () => {
		const result = await run('save', { ...FORM, contactEmail: 'board@', description: 'Hi' });

		expect(result).toMatchObject({ errors: { contactEmail: expect.any(String) } });
		expect(firstUpdate().patch).toMatchObject({ description: 'Hi' });
		expect(firstUpdate().patch).not.toHaveProperty('contactEmail');
	});
});

describe('continue', () => {
	it('refuses to move on without a name', async () => {
		const result = await run('continue', { ...FORM, name: '' });

		expect(result).toMatchObject({
			status: 400,
			data: { errors: { name: 'Please give the conference a name.' } }
		});
		expect(setCreationStep).not.toHaveBeenCalled();
	});

	it('saves, remembers the step and goes to When & where', async () => {
		const result = await run('continue', FORM);

		expect(result).toMatchObject({ status: 303, location: '/create/delft-mun-2027/when' });
		expect(setCreationStep).toHaveBeenCalledWith({}, 'draft-1', 'when');
	});
});

describe('regenerateName', () => {
	it('gives back the generated name, which is not the organiser’s own', async () => {
		vi.mocked(getCreationDraft).mockResolvedValue({
			...DRAFT,
			name: 'Delft Model UN',
			prefillSources: { ...DRAFT.prefillSources, name: 'user' }
		});

		const result = await run('regenerateName', { ...FORM, name: 'Delft Model UN' });

		expect(result).toMatchObject({ status: 303, location: '/create/delft-mun-2027/basics' });
		expect(firstUpdate().patch.name).toBe('Delft MUN 2027');
		expect(firstUpdate().sources.name).toBe('previous_conference');
	});

	it('uses the organisation’s name without a year while there are no dates', async () => {
		vi.mocked(findPreviousConference).mockResolvedValue(null);
		vi.mocked(getCreationDraft).mockResolvedValue({
			...DRAFT,
			name: 'Something else',
			prefillSources: { start_date: 'system_default', name: 'user' }
		});

		await run('regenerateName', { ...FORM, name: 'Something else' });

		expect(firstUpdate().patch.name).toBe('Delft MUN');
		expect(firstUpdate().sources.name).toBe('organization');
	});
});

describe('uploadLogo and removeBanner', () => {
	it('uploads a chosen logo and makes it the organiser’s own', async () => {
		const logo = new File(['png'], 'logo.png', { type: 'image/png' });

		const result = await run('uploadLogo', { logo });

		expect(result).toMatchObject({ status: 303, location: '/create/delft-mun-2027/basics' });
		expect(uploadConferenceImage).toHaveBeenCalledWith({}, 'draft-1', 'logo', logo);
		expect(firstUpdate().sources.logo_path).toBe('user');
	});

	it('refuses an upload with no file or the wrong kind of file', async () => {
		const text = new File(['hi'], 'notes.txt', { type: 'text/plain' });

		expect(await run('uploadLogo', {})).toMatchObject({ status: 400 });
		expect(await run('uploadBanner', { banner: text })).toMatchObject({ status: 400 });
		expect(uploadConferenceImage).not.toHaveBeenCalled();
	});

	it('removes only a banner in the draft’s own folder', async () => {
		vi.mocked(getCreationDraft).mockResolvedValue({
			...DRAFT,
			bannerPath: 'conferences/draft-1/banner.jpg'
		});
		await run('removeBanner', {});
		expect(removeConferenceImage).toHaveBeenCalledWith({}, 'draft-1', 'banner');

		vi.mocked(removeConferenceImage).mockClear();
		vi.mocked(getCreationDraft).mockResolvedValue({
			...DRAFT,
			bannerPath: 'conferences/conf-1/banner.jpg'
		});
		await run('removeBanner', {});
		expect(removeConferenceImage).not.toHaveBeenCalled();
	});
});
