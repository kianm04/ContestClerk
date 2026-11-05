import { error } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+layout.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { LayoutServerLoadEvent } from './$types';
import type { Conference } from '$lib/conferences';
import type { ManagedOrganization } from '$lib/organizations';

// Both the gate and the lookup are stood in for, so these tests are about the
// three things this `load` itself decides: which slug it checks, which
// organisation it then asks for, and what it hands back. `requireTeamMember` has
// its own tests in `src/lib/server/access`, and the queries in `tests/db/`.
vi.mock('$lib/server/access', () => ({ requireTeamMember: vi.fn() }));

vi.mock('$lib/server/organizations', () => ({ getManagedOrganization: vi.fn() }));

// The sidebar's three lookups (the manage redesign) are stood in for too. Their
// queries are tested in `tests/db/`, and what the sidebar draws from them in
// `$lib/manage-sidebar.test.ts` and `$lib/setup-steps.test.ts`.
vi.mock('$lib/server/manage-layout', () => ({
	loadSetupProgress: vi.fn(),
	loadSidebarCount: vi.fn(),
	loadSwitcherConferences: vi.fn()
}));

import { requireTeamMember } from '$lib/server/access';
import type { MyPermissions } from '$lib/permissions';
import {
	loadSetupProgress,
	loadSidebarCount,
	loadSwitcherConferences
} from '$lib/server/manage-layout';
import { getManagedOrganization } from '$lib/server/organizations';
import type { SetupProgress } from '$lib/setup-steps';

/** A draft with its details and committees done. */
const SETUP_PROGRESS: SetupProgress = {
	details: true,
	committees: true,
	applicationForm: false,
	fees: false,
	team: false
};

/** The one conference the switcher offers. */
const SWITCHER_CONFERENCES = [
	{
		slug: 'riverside-mun-2027',
		name: 'Riverside MUN 2027',
		startDate: '2027-03-04',
		endDate: '2027-03-07'
	}
];

/** The Supabase client. `load` only hands it on, so nothing here ever calls it. */
const SUPABASE = {};

/** The organiser `requireTeamMember` answers with. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** The conference being managed, in the shape the pages display it. */
const CONFERENCE: Conference = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	description: null,
	organizationName: 'Riverside MUN Society',
	organizationSlug: 'riverside-mun-society',
	city: 'Delft',
	countryCode: 'NL',
	countryName: 'Netherlands',
	locationMode: 'in_person',
	venueStatus: 'tba',
	conferenceTimeStatus: 'tba',
	startTime: null,
	endTime: null,
	feeStatus: 'undecided',
	applicationOpenMode: 'on_publish',
	startDate: '2027-03-04',
	endDate: '2027-03-07',
	websiteUrl: null,
	bannerPath: null,
	logoPath: null,
	level: 'high_school',
	status: 'draft',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: null,
	applicationsOpenAt: null,
	applicationsCloseAt: null,
	committeeCount: 0,
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

/** What the organiser holds: everything, as an owner of the organisation does. */
const PERMISSIONS: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** The organisation that conference belongs to. */
const ORGANIZATION: ManagedOrganization = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Riverside MUN Society',
	slug: 'riverside-mun-society',
	logoPath: null,
	isStripeConnected: false
};

/**
 * The few pieces of a page visit that `load` here actually reads.
 *
 * SvelteKit hands it a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeLoadEvent(slug = 'riverside-mun-2027'): LayoutServerLoadEvent {
	return {
		params: { slug },
		url: new URL(`http://localhost/manage/${slug}`),
		locals: { supabase: SUPABASE }
	} as unknown as LayoutServerLoadEvent;
}

/**
 * The 404 `requireTeamMember` throws at a signed-in person whose permissions
 * open no page of this conference.
 *
 * SvelteKit's `error` works by throwing rather than by returning, so catching
 * one here is the only way to get hold of it to throw again.
 */
function notFound(): unknown {
	try {
		error(404, 'Not found');
	} catch (thrown) {
		return thrown;
	}

	throw new Error('Nothing was thrown, so there is no 404 to hand on.');
}

/**
 * Run something that is expected to throw, and give back what it threw.
 *
 * SvelteKit says "you may not see this page" by throwing rather than by
 * returning, so catching it is the only way to read the status back.
 */
async function catchThrown(run: () => unknown): Promise<{ status: number }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number };
	}

	throw new Error('Nothing was thrown, so nothing was refused.');
}

beforeEach(() => {
	vi.mocked(requireTeamMember).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE,
		permissions: PERMISSIONS
	});
	vi.mocked(getManagedOrganization).mockResolvedValue(ORGANIZATION);
	vi.mocked(loadSetupProgress).mockResolvedValue(SETUP_PROGRESS);
	vi.mocked(loadSidebarCount).mockResolvedValue(null);
	vi.mocked(loadSwitcherConferences).mockResolvedValue(SWITCHER_CONFERENCES);
});

describe('load', () => {
	it('checks the team gate for the slug in the address', async () => {
		const event = makeLoadEvent();

		await load(event);

		expect(requireTeamMember).toHaveBeenCalledWith(event.locals, event.url, 'riverside-mun-2027');
	});

	it('looks the organisation up by the slug on the conference row', async () => {
		await load(makeLoadEvent());

		expect(getManagedOrganization).toHaveBeenCalledWith(SUPABASE, 'riverside-mun-society');
	});

	it('hands the conference, its organisation and the sidebar to every page below', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toEqual({
			conference: CONFERENCE,
			permissions: PERMISSIONS,
			organization: ORGANIZATION,
			setupProgress: SETUP_PROGRESS,
			sidebarCount: null,
			switcherConferences: SWITCHER_CONFERENCES,
			// The conference is a draft, which says so whatever the date.
			statusLine: { text: 'Draft · not public', tone: 'neutral' }
		});
	});

	it('lists the conferences the signed-in reader may switch to', async () => {
		await load(makeLoadEvent());

		expect(loadSwitcherConferences).toHaveBeenCalledWith(SUPABASE);
	});

	it("lets a 404 through for somebody who is not on this conference's team", async () => {
		vi.mocked(requireTeamMember).mockRejectedValue(notFound());

		const thrown = await catchThrown(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(404);
		expect(getManagedOrganization).not.toHaveBeenCalled();
	});

	it('throws when the organisation cannot be read, because that is our fault', async () => {
		vi.mocked(getManagedOrganization).mockResolvedValue(null);

		await expect(load(makeLoadEvent())).rejects.toThrow(
			'The organisation riverside-mun-society could not be read.'
		);
	});
});
