import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
import type { ManagedCommittee } from '$lib/committees';
import type { Conference } from '$lib/conferences';
import { NO_ALLOCATION_FACTS } from '$lib/dashboard-allocation';
import { NO_UNPAID_INVOICES } from '$lib/dashboard-invoices';
import { NO_WAITING_FACTS } from '$lib/dashboard-waiting';
import type { Flash } from '$lib/flash';
import type { ConferenceDashboard } from '$lib/manage';
import type { ManagedOrganization } from '$lib/organizations';
import type { SetupProgress } from '$lib/setup-steps';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the two actions themselves decide.
// `requirePermission` has its own tests in `src/lib/server/access`, each
// section's wording its own in `src/lib/dashboard-*.test.ts`, and what the
// database allows is tested in `tests/db/`.
//
// The `$lib/dashboard-*` modules are deliberately not stood in for: they are
// pure, and running the real ones is what proves `load` hands them the right
// facts.
vi.mock('$lib/server/access', () => ({ requirePermission: vi.fn(), requireManagePage: vi.fn() }));

vi.mock('$lib/server/manage', () => ({ loadConferenceDashboard: vi.fn() }));

vi.mock('$lib/server/dashboard-cards', () => ({ loadPhaseCards: vi.fn() }));

vi.mock('$lib/server/conferences', () => ({
	setConferenceStatus: vi.fn(),
	hasSeatedDelegates: vi.fn()
}));

vi.mock('$lib/server/creation', () => ({ setCreationStep: vi.fn() }));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requirePermission } from '$lib/server/access';
import { hasSeatedDelegates, setConferenceStatus } from '$lib/server/conferences';
import { setCreationStep } from '$lib/server/creation';
import { loadPhaseCards, type PhaseCards } from '$lib/server/dashboard-cards';
import { setFlash } from '$lib/server/flash';
import { loadConferenceDashboard } from '$lib/server/manage';
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

/** A brand-new draft, in the shape the pages display it. */
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

/** The organisation that runs it. */
const ORGANIZATION: ManagedOrganization = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Riverside MUN Society',
	slug: 'riverside-mun-society',
	logoPath: null,
	isStripeConnected: false
};

/** Everything at zero, as a conference nobody has applied to yet counts up. */
const EMPTY_DASHBOARD: ConferenceDashboard = {
	stats: {
		applicationsTotal: 0,
		applicationsToReview: 0,
		delegationsTotal: 0,
		delegationsToReview: 0,
		seatsAvailable: 0,
		seatsFilled: 0,
		seatsReserved: 0,
		invoicesPaidCents: 0,
		invoicesUnpaidCents: 0,
		currency: 'EUR'
	},
	checklistCounts: {
		committeeCount: 0,
		committeesWithoutAvailableSeatsCount: 0,
		onlyCommitteeWithoutSeatsId: null,
		feeCount: 0,
		collectsPaymentsManually: false
	},
	recentApplications: []
};

/** The conference once it is public, which is when it has a dashboard. */
const PUBLISHED_CONFERENCE: Conference = {
	...CONFERENCE,
	status: 'published',
	applicationsOpenAt: '2026-11-01T09:00:00Z',
	applicationsCloseAt: '2027-01-15T22:00:00Z'
};

/** A draft with nothing done yet, as the layout reads it for `/create`'s new conference. */
const NOTHING_DONE: SetupProgress = {
	details: false,
	committees: false,
	applicationForm: false,
	fees: false,
	team: false
};

/** The phase's own sections, empty, as a phase that draws none of them reads them. */
const EMPTY_CARDS: PhaseCards = {
	committees: [],
	isAnybodySeated: false,
	waiting: NO_WAITING_FACTS,
	allocation: NO_ALLOCATION_FACTS,
	unpaidInvoices: NO_UNPAID_INVOICES,
	rooms: [],
	todayEvents: [],
	awardCounts: { proposed: 0, confirmed: 0 }
};

/** The Security Council: both seats taken and no chair yet. */
const FULL_COMMITTEE: ManagedCommittee = {
	id: 'unsc-id',
	slug: 'unsc',
	name: 'Security Council',
	abbreviation: 'UNSC',
	description: null,
	topics: [],
	level: 'intermediate',
	room: null,
	position: 0,
	defaultSpeakingTimeSeconds: 60,
	seatCounts: { available: 2, filled: 1, reserved: 1, total: 2 },
	chairNames: [],
	hasBackgroundGuide: false,
	positionPaperCount: 0
};

/**
 * A moment while applications are open, which is when most of these tests run.
 *
 * The clock is held still because two of the things being tested read it: the
 * phase `load` works out, and the last day the `archive` action compares
 * against.
 */
const BEFORE_THE_CONFERENCE = new Date('2026-11-15T10:00:00Z');

/** The day after the conference's last one, in its own timezone. */
const AFTER_THE_CONFERENCE = new Date('2027-03-08T12:00:00Z');

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost/manage/${CONFERENCE.slug}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/**
 * That stand-in, as the `load` function's own event type.
 *
 * `parent()` is how a page's `load` reads what the layout above it returned. It
 * is an async function on the event, so the stand-in is one too. The layout
 * reads `setupProgress` for a draft only, and hands `null` for every other
 * conference. `flash` is the message the root layout took from its cookie.
 */
function makeLoadEvent(
	conference: Conference = PUBLISHED_CONFERENCE,
	setupProgress: SetupProgress | null = null,
	flash: Flash | null = null
): PageServerLoadEvent {
	return makeEvent({
		parent: async () => ({
			conference,
			organization: ORGANIZATION,
			setupProgress,
			flash,
			permissions: ADMINISTRATOR
		})
	}) as unknown as PageServerLoadEvent;
}

/** A form post to one of the actions. Neither reads a field: both work from the slug. */
function makeFormEvent(): RequestEvent {
	return makeEvent({
		request: { formData: async () => new FormData() }
	}) as unknown as RequestEvent;
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing rather than by returning, so
 * catching it is the only way to see where it was sending the reader.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What an action returns when it refuses: `fail` gives back `{ status, data }`. */
type ActionResult = {
	status?: number;
	data?: { message?: string };
};

beforeEach(() => {
	// The clock is held still so that the phase and the archive rule are the
	// same on every run, the way `FlashToast`'s tests hold it still for their timer.
	vi.useFakeTimers();
	vi.setSystemTime(BEFORE_THE_CONFERENCE);

	vi.mocked(requirePermission).mockResolvedValue({
		user: SIGNED_IN_USER,
		conference: CONFERENCE
	});
	vi.mocked(loadConferenceDashboard).mockResolvedValue(EMPTY_DASHBOARD);
	vi.mocked(loadPhaseCards).mockResolvedValue(EMPTY_CARDS);
	vi.mocked(hasSeatedDelegates).mockResolvedValue(false);
	vi.mocked(setConferenceStatus).mockResolvedValue(undefined);
	vi.mocked(setCreationStep).mockClear().mockResolvedValue(undefined);
	vi.mocked(setFlash).mockClear();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('load', () => {
	it('works from the conference the layout already read, and does not check again', async () => {
		await load(makeLoadEvent());

		expect(loadConferenceDashboard).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id);
		expect(loadPhaseCards).toHaveBeenCalledWith(
			SUPABASE,
			PUBLISHED_CONFERENCE,
			'applications',
			expect.any(Date)
		);
		// The layout read the reader's permissions once; the page checks its own
		// line against them instead of asking the database a second time.
		expect(requirePermission).not.toHaveBeenCalled();
	});

	it('sends a draft back into the creation flow, without reading the dashboard', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent(CONFERENCE, NOTHING_DONE)));

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/create/riverside-mun-2027');
		expect(loadConferenceDashboard).not.toHaveBeenCalled();
		expect(loadPhaseCards).not.toHaveBeenCalled();
	});

	it('leaves the message it was sent with again, so the step page still shows it', async () => {
		const flash: Flash = { tone: 'success', message: 'Riverside MUN 2027 is no longer public.' };

		await catchRedirect(() => load(makeLoadEvent(CONFERENCE, NOTHING_DONE, flash)));

		// The root layout read the cookie and deleted it before this `load` ran.
		expect(setFlash).toHaveBeenCalledWith(COOKIES, flash);
	});

	it('leaves no message when it was sent none', async () => {
		await catchRedirect(() => load(makeLoadEvent(CONFERENCE, NOTHING_DONE)));

		expect(setFlash).not.toHaveBeenCalled();
	});

	it('sends a draft with every setup step done to the creation flow as well', async () => {
		const progress = { ...NOTHING_DONE, details: true, committees: true, applicationForm: true };
		const redirect = await catchRedirect(() => load(makeLoadEvent(CONFERENCE, progress)));

		// `/create/<slug>` picks the step the draft reached, Launch included.
		expect(redirect.location).toBe('/create/riverside-mun-2027');
	});

	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. */
	it('writes the summary, the figures and the "Needs you" lines of the phase', async () => {
		vi.mocked(loadPhaseCards).mockResolvedValue({
			...EMPTY_CARDS,
			committees: [FULL_COMMITTEE],
			isAnybodySeated: true
		});

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({
			summary: expect.stringMatching(/^Applications are open\. They close on Friday 15 January/),
			figures: [
				{ value: '0', label: 'Applications' },
				{ value: '0 of 0', label: 'Seats filled' },
				{ value: '0', label: 'Delegation requests' },
				{ label: 'Paid' }
			],
			attentionTitle: 'Needs you',
			attention: [
				{ key: 'no-chair', title: 'UNSC has no chair' },
				{ key: 'full-committee-unsc-id', title: 'Security Council has no free seats' },
				{ key: 'no-fees', title: 'No fees yet: delegates will not be invoiced' }
			],
			isFirstAttentionLinePrimary: true,
			// Somebody holds a seat, so "Unpublish" would only ever be refused.
			quietAction: null,
			sections: { phase: 'applications', waiting: [] }
		});
	});

	it('offers "Unpublish" before the conference while nobody holds a seat', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ quietAction: 'unpublish' });
	});

	it('offers "Archive" once a published conference is over, under "Wrapping up"', async () => {
		vi.setSystemTime(AFTER_THE_CONFERENCE);

		const result = await load(makeLoadEvent());

		expect(loadPhaseCards).toHaveBeenCalledWith(
			SUPABASE,
			PUBLISHED_CONFERENCE,
			'after',
			expect.any(Date)
		);
		expect(result).toMatchObject({
			summary: 'The conference ended on Sunday 7 March.',
			attentionTitle: 'Wrapping up',
			quietAction: 'archive',
			sections: { phase: 'after' }
		});
	});
});

describe('the unpublish action', () => {
	beforeEach(() => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: PUBLISHED_CONFERENCE
		});
	});

	it('refuses once anybody holds a seat', async () => {
		vi.mocked(hasSeatedDelegates).mockResolvedValue(true);

		const result = (await actions.unpublish(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'You cannot unpublish once delegates are seated. Archive it after the conference instead.'
		);
		expect(setConferenceStatus).not.toHaveBeenCalled();
		expect(setCreationStep).not.toHaveBeenCalled();
	});

	it('takes the conference back to a draft while no seat is held', async () => {
		const redirect = await catchRedirect(() => actions.unpublish(makeFormEvent()));

		expect(setConferenceStatus).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, 'draft');
		// So the creation steps reopen it at Launch rather than at Basics.
		expect(setCreationStep).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, 'launch');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Riverside MUN 2027 is no longer public.'
		});
		expect(redirect.location).toBe('/manage/riverside-mun-2027');
	});

	it('asks the organiser gate again', async () => {
		await catchRedirect(() => actions.unpublish(makeFormEvent()));

		expect(requirePermission).toHaveBeenCalled();
	});
});

describe('the archive action', () => {
	beforeEach(() => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: PUBLISHED_CONFERENCE
		});
	});

	it('refuses while the conference has not finished', async () => {
		const result = (await actions.archive(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('You can archive after the last day.');
		expect(setConferenceStatus).not.toHaveBeenCalled();
	});

	it('refuses a draft that is over, because a draft was never in the directory', async () => {
		// `CONFERENCE` is the draft. Its dates are the same, so the only thing
		// standing in the way here is the status.
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: CONFERENCE
		});
		vi.setSystemTime(AFTER_THE_CONFERENCE);

		const result = (await actions.archive(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Only a published conference can be archived.');
		expect(setConferenceStatus).not.toHaveBeenCalled();
	});

	it('refuses on the last day itself, which is still part of the conference', async () => {
		vi.setSystemTime(new Date('2027-03-07T12:00:00Z'));

		const result = (await actions.archive(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(setConferenceStatus).not.toHaveBeenCalled();
	});

	it('archives once the last day is behind us', async () => {
		vi.setSystemTime(AFTER_THE_CONFERENCE);

		const redirect = await catchRedirect(() => actions.archive(makeFormEvent()));

		expect(setConferenceStatus).toHaveBeenCalledWith(SUPABASE, CONFERENCE.id, 'archived');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Riverside MUN 2027 is archived.'
		});
		expect(redirect.location).toBe('/manage/riverside-mun-2027');
	});

	it('asks the organiser gate again', async () => {
		await actions.archive(makeFormEvent());

		expect(requirePermission).toHaveBeenCalled();
	});
});
