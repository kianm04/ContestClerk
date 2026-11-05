import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
import type { Conference } from '$lib/conferences';

// The committee query is stood in for, so these tests are about what `load`
// itself decides. The pure modules it calls run for real.
vi.mock('$lib/server/publish-review', () => ({ listReviewCommittees: vi.fn() }));

import { listReviewCommittees } from '$lib/server/publish-review';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** The moment these tests run at, while applications are open. */
const NOW = new Date('2026-11-15T10:00:00Z');

/** A conference that has just been published. */
const CONFERENCE: Conference = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	description: 'Four days of debate on the Schie.',
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
	status: 'published',
	timezone: 'Europe/Amsterdam',
	expectedDelegates: null,
	applicationsOpenAt: '2026-11-01T09:00:00Z',
	applicationsCloseAt: '2027-01-15T22:00:00Z',
	committeeCount: 1,
	committeeNames: ['DISEC'],
	tagline: 'Debate in Delft',
	venueName: 'Riverside College',
	venueAddress: null,
	contactEmail: 'team@riverside-mun.example',
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

/** One committee with nobody to chair it yet. */
const COMMITTEE_WITHOUT_CHAIR = {
	name: 'Disarmament and International Security',
	abbreviation: 'DISEC',
	availableSeatCount: 12,
	chairCount: 0
};

/**
 * The few pieces of a request that `load` actually reads. SvelteKit hands it
 * a great many more, so the cast says "this is enough". `parent()` is how it
 * reads the layout's data.
 */
function makeLoadEvent(conference: Conference): PageServerLoadEvent {
	return {
		params: { slug: conference.slug },
		locals: { supabase: {} },
		parent: async () => ({ conference, permissions: ADMINISTRATOR })
	} as unknown as PageServerLoadEvent;
}

beforeEach(() => {
	// The clock is held still so that "open for applications" means the same
	// on every run.
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	vi.mocked(listReviewCommittees).mockClear();
	vi.mocked(listReviewCommittees).mockResolvedValue([COMMITTEE_WITHOUT_CHAIR]);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('load', () => {
	it('says the conference is open and lists the next steps, chairs first', async () => {
		const result = await load(makeLoadEvent(CONFERENCE));

		expect(result).toMatchObject({
			headline: {
				title: 'Riverside MUN 2027 is open for applications.',
				sentence: 'Anyone with the link can read the page and apply until 15 Jan 2027.'
			},
			nextSteps: [
				{ key: 'chairs', detail: 'DISEC has no chair yet.' },
				{ key: 'schedule' },
				{ key: 'documents' }
			],
			preview: { name: 'Riverside MUN 2027', committeeChips: ['DISEC'] }
		});
	});

	it('leaves the chairs out once every committee has one', async () => {
		vi.mocked(listReviewCommittees).mockResolvedValue([
			{ ...COMMITTEE_WITHOUT_CHAIR, chairCount: 2 }
		]);

		const result = await load(makeLoadEvent(CONFERENCE));

		expect(result).toMatchObject({
			nextSteps: [{ key: 'schedule' }, { key: 'documents' }]
		});
	});

	it('sends a draft to the dashboard without reading anything', async () => {
		const draft: Conference = { ...CONFERENCE, status: 'draft' };

		await expect(load(makeLoadEvent(draft))).rejects.toMatchObject({
			status: 303,
			location: '/manage/riverside-mun-2027'
		});
		expect(listReviewCommittees).not.toHaveBeenCalled();
	});
});
