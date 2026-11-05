import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { CreationDraft, PreviousConference } from '$lib/creation-draft';

// The organiser check and the queries are stood in for, so these tests are
// about what the actions decide. Working out what a save writes, cascades
// included, is pure and runs for real.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn() }));
vi.mock('$lib/server/creation', () => ({
	findPreviousConference: vi.fn(),
	getCreationDraft: vi.fn(),
	setCreationStep: vi.fn(),
	updateCreationDraft: vi.fn()
}));

import {
	findPreviousConference,
	getCreationDraft,
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
	startDate: '2027-04-16',
	endDate: '2027-04-18',
	timesTba: 'on',
	locationMode: 'in_person',
	city: 'Delft',
	countryCode: 'NL',
	venueName: '',
	venueAddress: '',
	timezone: 'Europe/Amsterdam'
};

/** The few pieces of a request the actions read; the cast says "this is enough". */
function makeEvent(form: Record<string, string>): RequestEvent {
	const formData = new FormData();
	for (const [name, value] of Object.entries(form)) {
		formData.set(name, value);
	}

	return {
		url: new URL('http://localhost/create/delft-mun-2027/when'),
		params: { slug: DRAFT.slug },
		locals: { supabase: {} },
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** Run an action, and give back what it returned or threw: a redirect is thrown. */
async function run(action: keyof typeof actions, form: Record<string, string>): Promise<unknown> {
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
	vi.mocked(findPreviousConference).mockResolvedValue(PREVIOUS);
});

/** Run `load` with the previous edition the layout found. */
async function runLoad(previous: PreviousConference | null) {
	const event = { parent: async () => ({ previous }) } as unknown as PageServerLoadEvent;
	// The generated type allows for a `load` that returns nothing; this one always returns.
	return (await load(event)) as {
		suggestion: Record<string, unknown> | null;
		timezoneOptions: unknown[];
	};
}

describe('load', () => {
	it('suggests next year’s dates from the previous edition', async () => {
		const data = await runLoad(PREVIOUS);

		expect(data.suggestion).toMatchObject({
			startDate: '2027-04-16',
			endDate: '2027-04-18',
			previousName: 'Delft MUN 2026',
			range: '16 – 18 Apr 2027',
			span: 'Fri – Sun (3 days)'
		});
		expect(data.timezoneOptions.length).toBeGreaterThan(10);
	});

	it('suggests nothing without a previous edition', async () => {
		expect((await runLoad(null)).suggestion).toBeNull();
	});
});

describe('save', () => {
	it('lets the timezone, the name’s year and the closing date follow', async () => {
		vi.mocked(getCreationDraft).mockResolvedValue({
			...DRAFT,
			city: null,
			countryCode: null,
			timezone: 'UTC'
		});

		await run('save', { ...FORM, startDate: '2028-04-14', endDate: '2028-04-16', timezone: 'UTC' });

		expect(firstUpdate().patch).toMatchObject({
			city: 'Delft',
			countryCode: 'NL',
			timezone: 'Europe/Amsterdam',
			name: 'Delft MUN 2028',
			applicationsCloseAt: '2028-03-31T21:59:00.000Z'
		});
		expect(firstUpdate().sources.timezone).toBe('organization');
	});

	it('leaves a timezone the organiser chose alone', async () => {
		vi.mocked(getCreationDraft).mockResolvedValue({
			...DRAFT,
			timezone: 'Europe/London',
			prefillSources: { ...DRAFT.prefillSources, timezone: 'user' }
		});

		await run('save', { ...FORM, city: 'Paris', countryCode: 'FR', timezone: 'Europe/London' });

		expect(firstUpdate().patch).not.toHaveProperty('timezone');
	});

	it('drops the city, country and venue of an online conference', async () => {
		await run('save', { ...FORM, locationMode: 'online', venueName: 'Aula' });

		expect(firstUpdate().patch).toMatchObject({
			locationMode: 'online',
			city: null,
			countryCode: null,
			venueStatus: 'tba',
			venueName: null
		});
	});

	it('makes first dates the organiser’s own and keeps empty ones a placeholder', async () => {
		const undecided = { ...DRAFT, prefillSources: { start_date: 'system_default' as const } };
		vi.mocked(getCreationDraft).mockResolvedValue(undecided);

		await run('save', { ...FORM, startDate: '', endDate: '' });
		expect(firstUpdate().patch).not.toHaveProperty('startDate');
		expect(firstUpdate().sources.start_date).toBe('system_default');

		vi.mocked(updateCreationDraft).mockClear();
		await run('save', FORM);
		expect(firstUpdate().sources).toMatchObject({ start_date: 'user', end_date: 'user' });
	});
});

describe('continue', () => {
	it('refuses half a date range or a last day before the first', async () => {
		expect(await run('continue', { ...FORM, endDate: '' })).toMatchObject({
			status: 400,
			data: { errors: { endDate: 'Please pick both days.' } }
		});
		expect(await run('continue', { ...FORM, endDate: '2027-04-15' })).toMatchObject({
			status: 400,
			data: { errors: { endDate: 'The last day cannot be before the first day.' } }
		});
		expect(setCreationStep).not.toHaveBeenCalled();
	});

	it('goes on to Setup with nothing decided', async () => {
		const result = await run('continue', { ...FORM, startDate: '', endDate: '' });

		expect(result).toMatchObject({ status: 303, location: '/create/delft-mun-2027/setup' });
		expect(setCreationStep).toHaveBeenCalledWith({}, 'draft-1', 'setup');
	});
});

describe('useSuggestedDates', () => {
	it('saves next year’s dates as coming from the last conference', async () => {
		vi.mocked(getCreationDraft).mockResolvedValue({
			...DRAFT,
			startDate: '2027-06-04',
			endDate: '2027-06-06',
			prefillSources: { ...DRAFT.prefillSources, start_date: 'user', end_date: 'user' }
		});

		const result = await run('useSuggestedDates', {});

		expect(result).toMatchObject({ status: 303, location: '/create/delft-mun-2027/when' });
		expect(firstUpdate().patch).toMatchObject({ startDate: '2027-04-16', endDate: '2027-04-18' });
		expect(firstUpdate().sources).toMatchObject({
			start_date: 'previous_conference',
			end_date: 'previous_conference'
		});
	});

	it('changes nothing without a previous edition', async () => {
		vi.mocked(findPreviousConference).mockResolvedValue(null);

		expect(await run('useSuggestedDates', {})).toMatchObject({ status: 303 });
		expect(updateCreationDraft).not.toHaveBeenCalled();
	});
});
