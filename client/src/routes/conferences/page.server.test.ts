import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_CONFERENCE_QUERY, type Conference } from '$lib/conferences';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';

// The two lookups are stood in for, so these tests are about what `load` does
// with what comes back rather than about the database. What the queries
// themselves fetch belongs in `tests/db/`.
vi.mock('$lib/server/conferences', () => ({
	listConferences: vi.fn(),
	listCountries: vi.fn()
}));

import { listConferences, listCountries } from '$lib/server/conferences';

/**
 * A stand-in for the visitor's Supabase client. This page asks it nothing
 * itself; it only passes it on to the two lookups, so an empty object is
 * enough, and the tests check that this very object arrives.
 */
const SUPABASE = {};

/** One conference for the list to hold, so the page has something to pass on. */
const THIMUN: Conference = {
	id: '11111111-1111-1111-1111-111111111111',
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
	minAge: null,
	maxAge: null,
	positionPaperRequired: false,
	positionPaperDeadline: null,
	acceptsIndividualApplications: true,
	acceptsDelegations: true
};

/** The countries the filter dropdown is built from. */
const COUNTRIES = [{ code: 'NL', name: 'Netherlands' }];

/** The few pieces of a page visit that `load` here actually reads. */
function makeLoadEvent(address = 'http://localhost/conferences'): PageServerLoadEvent {
	return {
		url: new URL(address),
		locals: { supabase: SUPABASE }
	} as unknown as PageServerLoadEvent;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(listConferences).mockResolvedValue({ rows: [THIMUN], total: 1 });
	vi.mocked(listCountries).mockResolvedValue(COUNTRIES);
});

describe('load', () => {
	it('asks for exactly what the address describes', async () => {
		await load(
			makeLoadEvent(
				'http://localhost/conferences?q=munich&country=DE&region=europe&region=asia&within=6' +
					'&level=university&open=1&sort=newest&page=2'
			)
		);

		expect(listConferences).toHaveBeenCalledWith(
			SUPABASE,
			{
				q: 'munich',
				country: 'DE',
				regions: ['europe', 'asia'],
				withinMonths: 6,
				level: 'university',
				openOnly: true,
				sort: 'newest',
				page: 2
			},
			expect.any(Date)
		);
	});

	it('asks for the whole directory when the address carries nothing', async () => {
		await load(makeLoadEvent());

		expect(listConferences).toHaveBeenCalledWith(
			SUPABASE,
			EMPTY_CONFERENCE_QUERY,
			expect.any(Date)
		);
	});

	it('ignores nonsense in the address', async () => {
		await load(makeLoadEvent('http://localhost/conferences?page=fish&country=zz&sort=sideways'));

		// The first page, any country and the usual order: unreadable values are
		// dropped rather than turned into an error page.
		expect(listConferences).toHaveBeenCalledWith(
			SUPABASE,
			EMPTY_CONFERENCE_QUERY,
			expect.any(Date)
		);
	});

	it('reads both lookups at the same moment', async () => {
		await load(makeLoadEvent());

		const listedAt = vi.mocked(listConferences).mock.calls[0][2];
		const countriesListedAt = vi.mocked(listCountries).mock.calls[0][1];

		// One moment for the whole page, so the "Applications open" badge on a card
		// and the `open` filter that found it cannot disagree.
		expect(countriesListedAt).toBe(listedAt);
	});

	it('hands the page the results, the countries and the filters they came from', async () => {
		const result = await load(makeLoadEvent('http://localhost/conferences?country=NL'));

		expect(result).toMatchObject({
			rows: [THIMUN],
			total: 1,
			countries: COUNTRIES,
			// The filters go back to the page as the server read them, so the form
			// shows exactly what the results were built from.
			query: { ...EMPTY_CONFERENCE_QUERY, country: 'NL' },
			now: vi.mocked(listConferences).mock.calls[0][2]
		});
	});

	it('builds the sharing picture from the address the request came in on', async () => {
		const result = await load(makeLoadEvent('https://munmeet.app/conferences?page=2'));

		// Nothing is configured anywhere: the address the page was asked for is the
		// address the picture is served from.
		expect(result).toMatchObject({ shareImageUrl: 'https://munmeet.app/og-default.jpg' });
	});
});
