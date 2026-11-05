import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
// The real word, not a copy of it: the action checks what the organiser typed
// against `$lib/accounts.ts`, so renaming it there has to fail here too.
import { DELETE_CONFIRMATION_WORD } from '$lib/accounts';
import type { Conference } from '$lib/conferences';
import type { ManagedOrganization } from '$lib/organizations';
import { publishChecklist } from '$lib/publish-checklist';
import type { PublishReviewFacts } from '$lib/publish-review';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the two actions themselves decide.
// `$lib/publish-checklist` and `$lib/publish-review` are not: they are pure,
// and running the real thing is what proves the page and the `publish` action
// agree about whether a conference is ready.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn(), requireManagePage: vi.fn() }));

vi.mock('$lib/server/publish-review', () => ({
	readPublishReviewFacts: vi.fn(),
	readConferenceChecklistCounts: vi.fn()
}));

vi.mock('$lib/server/conferences', () => ({
	setConferenceStatus: vi.fn(),
	deleteConference: vi.fn(),
	wasEverPublished: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireManagePage, requirePermission } from '$lib/server/access';
import { deleteConference, setConferenceStatus, wasEverPublished } from '$lib/server/conferences';
import { setFlash } from '$lib/server/flash';
import { readConferenceChecklistCounts, readPublishReviewFacts } from '$lib/server/publish-review';
import type { MyPermissions } from '$lib/permissions';

/** What the layout hands down for an organiser: `administrator` opens every page. */
const ADMINISTRATOR: MyPermissions = {
	held: [{ permission: 'administrator', scope: 'conference' }],
	committeeIds: [],
	rank: -1
};

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The organiser `requirePermission` answers with. Nothing here reads them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** The moment these tests run at, well before the conference. */
const NOW = new Date('2026-11-15T10:00:00Z');

/**
 * A brand-new draft. Every field the checklist looks at is still empty,
 * which is what makes it the conference that cannot be published yet.
 */
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

/** The same conference with every required item answered, and still no banner. */
const READY_CONFERENCE: Conference = {
	...CONFERENCE,
	description: 'Four days of debate on the Schie.',
	tagline: 'Debate in Delft',
	venueName: 'Riverside College',
	contactEmail: 'team@riverside-mun.example',
	applicationsOpenAt: '2026-11-01T09:00:00Z',
	applicationsCloseAt: '2027-01-15T22:00:00Z'
};

/** The conference once it is public. */
const PUBLISHED_CONFERENCE: Conference = { ...READY_CONFERENCE, status: 'published' };

/** The organisation that runs it. */
const ORGANIZATION: ManagedOrganization = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Riverside MUN Society',
	slug: 'riverside-mun-society',
	logoPath: null,
	isStripeConnected: false
};

/** Nothing counted yet, as a brand-new draft counts up. */
const EMPTY_COUNTS = {
	committeeCount: 0,
	committeesWithoutAvailableSeatsCount: 0,
	onlyCommitteeWithoutSeatsId: null,
	feeCount: 0,
	collectsPaymentsManually: false
};

/** Three committees, every one with a seat on offer. */
const READY_COUNTS = { ...EMPTY_COUNTS, committeeCount: 3, collectsPaymentsManually: true };

/** The facts of a conference with these counts, as the server module gathers them. */
function makeFacts(conference: Conference, counts = READY_COUNTS): PublishReviewFacts {
	return {
		conference,
		committees: [],
		fees: [],
		currency: 'EUR',
		collectsPaymentsManually: counts.collectsPaymentsManually,
		committeePreferenceCount: 2,
		askMotivation: true,
		checklist: publishChecklist(conference, { ...counts, isStripeConnected: false }, NOW),
		now: NOW
	};
}

/**
 * The few pieces of a request that `load` and the actions here actually read.
 * SvelteKit hands them a great many more, so the cast says "this is enough".
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost/manage/${CONFERENCE.slug}/publish`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/** That stand-in as the `load` function's event. `parent()` is how it reads the layout's data. */
function makeLoadEvent(conference: Conference): PageServerLoadEvent {
	return makeEvent({
		parent: async () => ({ conference, organization: ORGANIZATION, permissions: ADMINISTRATOR })
	}) as unknown as PageServerLoadEvent;
}

/** A form post to one of the actions, with the fields it was sent. */
function makeFormEvent(fields: Record<string, string> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		request: { formData: async () => formData }
	}) as unknown as RequestEvent;
}

/** The fields the "Delete draft" form sends when the word was typed correctly. */
const TYPED_DELETE = { confirmation: DELETE_CONFIRMATION_WORD };

/**
 * Run something that is expected to redirect, and give back the redirect.
 * SvelteKit's `redirect` throws rather than returns, so catching it is the
 * only way to see where it was sending the reader.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/**
 * What an action returns when it refuses: `fail` gives back `{ status, data }`.
 * The two actions name their message differently, because the page shows each
 * by its own button.
 */
type ActionResult = {
	status?: number;
	data?: { publishError?: string; deleteError?: string };
};

beforeEach(() => {
	// The clock is held still so that "as soon as you publish" means the same
	// on every run.
	vi.useFakeTimers();
	vi.setSystemTime(NOW);

	vi.mocked(requirePermission).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE
	});
	vi.mocked(readConferenceChecklistCounts).mockResolvedValue(EMPTY_COUNTS);
	vi.mocked(readPublishReviewFacts).mockResolvedValue(makeFacts(CONFERENCE, EMPTY_COUNTS));
	vi.mocked(setConferenceStatus).mockResolvedValue(undefined);
	vi.mocked(deleteConference).mockResolvedValue(undefined);
	vi.mocked(wasEverPublished).mockResolvedValue(false);
	vi.mocked(setFlash).mockClear();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('load', () => {
	it('asks the permissions the layout read whether this page opens for the reader', async () => {
		await load(makeLoadEvent(CONFERENCE));

		expect(requireManagePage).toHaveBeenCalledWith(ADMINISTRATOR, 'publish');
	});

	it('sends a conference that is no longer a draft to its dashboard', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent(PUBLISHED_CONFERENCE)));

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/manage/riverside-mun-2027');
		expect(readPublishReviewFacts).not.toHaveBeenCalled();
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('names the required steps still open on a brand-new draft', async () => {
		const result = await load(makeLoadEvent(CONFERENCE));

		expect(result).toMatchObject({
			summary: '3 steps left before you can publish.',
			missingLines: [{ key: 'committees' }, { key: 'details' }, { key: 'application-window' }]
		});
	});

	it('says everything is in place once it is, and still suggests a banner', async () => {
		vi.mocked(readPublishReviewFacts).mockResolvedValue(makeFacts(READY_CONFERENCE));

		const result = await load(makeLoadEvent(READY_CONFERENCE));

		expect(result).toMatchObject({
			summary: 'Everything required is in place.',
			missingLines: [],
			rows: [
				{ label: 'Conference' },
				{ label: 'Committees' },
				{ label: 'Applications' },
				{ label: 'Fees' }
			],
			worthDoing: [{ key: 'banner' }],
			preview: { name: 'Riverside MUN 2027' }
		});
	});

	it('offers "Delete draft" only while the draft has never been public', async () => {
		expect(await load(makeLoadEvent(CONFERENCE))).toMatchObject({ isDeletable: true });

		vi.mocked(wasEverPublished).mockResolvedValue(true);

		expect(await load(makeLoadEvent(CONFERENCE))).toMatchObject({ isDeletable: false });
	});

	it('reads the facts with the organisation’s Stripe connection', async () => {
		await load(makeLoadEvent(CONFERENCE));

		expect(readPublishReviewFacts).toHaveBeenCalledWith(SUPABASE, CONFERENCE, false, NOW);
	});
});

describe('the publish action', () => {
	it('refuses while a required item is still open, and changes nothing', async () => {
		const result = (await actions.publish(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.publishError).toBe('Finish the required checklist items first.');
		expect(setConferenceStatus).not.toHaveBeenCalled();
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('refuses a conference that is already public', async () => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: PUBLISHED_CONFERENCE
		});

		const result = (await actions.publish(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.publishError).toBe('Only a draft can be published.');
		expect(setConferenceStatus).not.toHaveBeenCalled();
	});

	it('publishes without a banner, says so, and shows the Published page', async () => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: READY_CONFERENCE
		});
		vi.mocked(readConferenceChecklistCounts).mockResolvedValue(READY_COUNTS);

		const redirect = await catchRedirect(() => actions.publish(makeFormEvent()));

		expect(setConferenceStatus).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, 'published');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Riverside MUN 2027 is now public.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/manage/riverside-mun-2027/published');
	});

	it('asks the organiser gate again, because an action is its own request', async () => {
		await actions.publish(makeFormEvent());

		expect(requirePermission).toHaveBeenCalled();
	});
});

describe('the deleteDraft action', () => {
	it('refuses a conference that has been public', async () => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: PUBLISHED_CONFERENCE
		});

		const result = (await actions.deleteDraft(makeFormEvent(TYPED_DELETE))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.deleteError).toBe('Only a draft can be deleted.');
		expect(deleteConference).not.toHaveBeenCalled();
	});

	it('refuses a draft that has been public before, which the database would refuse too', async () => {
		vi.mocked(wasEverPublished).mockResolvedValue(true);

		const result = (await actions.deleteDraft(makeFormEvent(TYPED_DELETE))) as ActionResult;

		expect(wasEverPublished).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(result.status).toBe(400);
		expect(result.data?.deleteError).toBe(
			'A conference that has been public cannot be deleted. Publish it again and archive it after its last day.'
		);
		expect(deleteConference).not.toHaveBeenCalled();
	});

	it('refuses a draft when the word was not typed, which is the guard on a page with no JavaScript', async () => {
		const result = (await actions.deleteDraft(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.deleteError).toBe(`Type ${DELETE_CONFIRMATION_WORD} to confirm.`);
		expect(deleteConference).not.toHaveBeenCalled();
	});

	it('deletes a draft and comes back to the organiser area', async () => {
		const redirect = await catchRedirect(() => actions.deleteDraft(makeFormEvent(TYPED_DELETE)));

		expect(deleteConference).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Riverside MUN 2027 is deleted.'
		});
		// Not back to the conference's own page: it has just stopped existing.
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/manage');
	});

	it('asks the organiser gate again', async () => {
		await catchRedirect(() => actions.deleteDraft(makeFormEvent(TYPED_DELETE)));

		expect(requirePermission).toHaveBeenCalled();
	});
});
