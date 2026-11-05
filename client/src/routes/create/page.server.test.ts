import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { CreationOrganization, PreviousConference } from '$lib/creation-draft';

// The gate and the queries are stood in for, so these tests are about what
// `load` and `start` decide. The queries have their own tests beside them, and
// what the database allows is tested in `tests/db/`. The prefill is pure and
// runs for real.
vi.mock('$lib/server/access', () => ({ requireOnboarded: vi.fn() }));
vi.mock('$lib/server/organizations', () => ({ createOrganization: vi.fn() }));
vi.mock('$lib/server/creation', () => ({
	findPreviousConference: vi.fn(),
	getCreationOrganization: vi.fn(),
	listCreationOrganizations: vi.fn(),
	startCreationDraft: vi.fn()
}));

import { requireOnboarded } from '$lib/server/access';
import {
	findPreviousConference,
	getCreationOrganization,
	listCreationOrganizations,
	startCreationDraft
} from '$lib/server/creation';
import { createOrganization } from '$lib/server/organizations';

const USER = { id: 'user-1', email: 'daniel@example.com' };

const ORGANIZATION: CreationOrganization = {
	id: '22222222-2222-2222-2222-222222222222',
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

/** The few pieces of a request `load` and `start` read; the cast says "this is enough". */
function makeEvent(path: string, form?: Record<string, string>): Record<string, unknown> {
	const formData = new FormData();
	for (const [name, value] of Object.entries(form ?? {})) {
		formData.set(name, value);
	}

	return {
		url: new URL(`http://localhost${path}`),
		locals: { supabase: {} },
		request: { formData: async () => formData }
	};
}

/** Run `start`, and give back what it threw: SvelteKit's redirect is thrown. */
async function start(form: Record<string, string>): Promise<unknown> {
	try {
		return await actions.start(makeEvent('/create?/start', form) as unknown as RequestEvent);
	} catch (thrown) {
		return thrown;
	}
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(requireOnboarded).mockResolvedValue(USER as never);
	vi.mocked(listCreationOrganizations).mockResolvedValue([ORGANIZATION]);
	vi.mocked(getCreationOrganization).mockResolvedValue(ORGANIZATION);
	vi.mocked(findPreviousConference).mockResolvedValue(PREVIOUS);
	vi.mocked(startCreationDraft).mockResolvedValue('delft-mun-2027-abcd');
});

describe('load', () => {
	it('starts with nothing chosen when there are organisations to choose from', async () => {
		const data = await load(makeEvent('/create') as unknown as PageServerLoadEvent);

		expect(data).toMatchObject({
			shell: { slug: null, step: 'organization', title: 'Create a conference' },
			choice: '',
			chosenOrganization: null,
			suggestion: null
		});
	});

	it('chooses a new organisation for somebody who has none', async () => {
		vi.mocked(listCreationOrganizations).mockResolvedValue([]);

		const data = await load(makeEvent('/create') as unknown as PageServerLoadEvent);

		expect(data?.choice).toBe('new');
	});

	it('suggests the next edition of the chosen organisation', async () => {
		const data = await load(
			makeEvent(`/create?organization=${ORGANIZATION.id}`) as unknown as PageServerLoadEvent
		);

		expect(findPreviousConference).toHaveBeenCalledWith({}, ORGANIZATION.id, null);
		expect(data?.chosenOrganization).toEqual(ORGANIZATION);
		expect(data?.suggestion?.values.name).toBe('Delft MUN 2027');
		expect(data?.suggestion?.sources.name).toBe('previous_conference');
	});

	it('ignores an organisation the reader does not belong to', async () => {
		const data = await load(
			makeEvent('/create?organization=someone-else') as unknown as PageServerLoadEvent
		);

		expect(data?.choice).toBe('');
		expect(findPreviousConference).not.toHaveBeenCalled();
	});
});

describe('start', () => {
	it('makes a prefilled draft for a chosen organisation and goes to Basics', async () => {
		const result = await start({ organization: ORGANIZATION.id });

		expect(result).toMatchObject({ status: 303, location: '/create/delft-mun-2027-abcd/basics' });
		const [, input] = vi.mocked(startCreationDraft).mock.calls[0];
		expect(input).toMatchObject({ organizationId: ORGANIZATION.id, userId: USER.id });
		expect(input.values.name).toBe('Delft MUN 2027');
		expect(createOrganization).not.toHaveBeenCalled();
	});

	it('makes the new organisation first, with where it is based', async () => {
		vi.mocked(createOrganization).mockResolvedValue(ORGANIZATION.id);
		vi.mocked(findPreviousConference).mockResolvedValue(null);

		const result = await start({
			organization: 'new',
			organizationName: 'Delft MUN',
			organizationCity: 'Delft',
			organizationCountry: 'NL'
		});

		expect(createOrganization).toHaveBeenCalledWith(
			{},
			{ name: 'Delft MUN', userId: USER.id, city: 'Delft', countryCode: 'NL' }
		);
		expect(result).toMatchObject({ status: 303 });
	});

	it('sends the form back when nothing was chosen or the name is missing', async () => {
		expect(await start({ organization: '' })).toMatchObject({
			status: 400,
			data: { errors: { organization: expect.any(String) } }
		});
		expect(await start({ organization: 'new', organizationName: '' })).toMatchObject({
			status: 400,
			data: { errors: { name: expect.any(String) } }
		});
		expect(startCreationDraft).not.toHaveBeenCalled();
	});

	it('refuses an organisation the reader does not belong to', async () => {
		expect(await start({ organization: 'someone-else' })).toMatchObject({ status: 400 });
		expect(startCreationDraft).not.toHaveBeenCalled();
	});
});
