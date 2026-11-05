import { redirect } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
import type {
	ApplicationListConference,
	MyApplicationListItem,
	MyDelegationListItem
} from '$lib/applications';
import type { ApplicationCard } from '$lib/application-cards';
import type { ApplicationTabCounts, MyApplicationsQuery } from '$lib/my-applications-query';

// The gate, the three queries and the facts lookup are stood in for, so these
// tests are about what `load` itself does: pick the right gate, ask the
// queries at once, ask for the cards' facts about the conferences and
// delegations it found, and hand the page the cards the address asks for, the
// numbers on the tabs, and how many rows are hidden behind an unpublished
// conference. `requireOnboarded` has its own tests in `src/lib/server/access`,
// and the queries' policies are tested in `tests/db/`.
//
// `$lib/applications`, `$lib/application-cards` and `$lib/my-applications-query`
// are deliberately *not* stood in for: merging the lists, building the cards
// and picking them out by tab are the behaviour this page is made of, and a
// stand-in for them would leave nothing worth checking here.
vi.mock('$lib/server/access', () => ({
	requireUser: vi.fn(),
	requireOnboarded: vi.fn()
}));

vi.mock('$lib/server/applications', () => ({ listMyApplications: vi.fn() }));

vi.mock('$lib/server/delegations', () => ({ listMyDelegationMemberships: vi.fn() }));

vi.mock('$lib/server/unpublished-conference-applications', () => ({
	countMyApplicationsAtUnpublishedConferences: vi.fn()
}));

vi.mock('$lib/server/application-card-facts', () => ({ readApplicationCardFacts: vi.fn() }));

import { requireOnboarded, requireUser } from '$lib/server/access';
import { readApplicationCardFacts } from '$lib/server/application-card-facts';
import { listMyApplications } from '$lib/server/applications';
import { listMyDelegationMemberships } from '$lib/server/delegations';
import { countMyApplicationsAtUnpublishedConferences } from '$lib/server/unpublished-conference-applications';

/** Somebody signed in who has finished onboarding, as `requireOnboarded` returns them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** The Supabase client. `load` only hands it on, so nothing here ever calls it. */
const SUPABASE = {};

/** The facts lookup's answer when it found nothing, so each card is drawn from the lists alone. */
const NO_FACTS = { conferences: [], seats: [], invoices: [], delegations: [] };

/**
 * The moment every test pretends it is. `load` reads the clock itself, so it is
 * held still to keep "which conferences are over" the same on every run, the
 * way `routes/manage/[slug]`'s tests hold it still.
 */
const NOW = new Date('2026-06-01T09:00:00Z');

/** A conference that finished months before `NOW`. */
const FINISHED_CONFERENCE: ApplicationListConference = {
	id: 'conference-1',
	slug: 'delftmun-2026',
	name: 'DelftMUN 2026',
	organizationName: 'Delft MUN Society',
	logoPath: null,
	bannerPath: null,
	startDate: '2026-02-12',
	endDate: '2026-02-15',
	timezone: 'Europe/Amsterdam',
	isArchived: false,
	applicationsCloseAt: '2026-01-15T23:00:00Z',
	city: 'Delft',
	venueName: null,
	locationMode: 'in_person'
};

/** A conference that has not happened yet at `NOW`. */
const UPCOMING_CONFERENCE: ApplicationListConference = {
	id: 'conference-2',
	slug: 'lse-mun-2026',
	name: 'LSE MUN 2026',
	organizationName: 'LSE MUN Society',
	logoPath: null,
	bannerPath: null,
	startDate: '2026-08-10',
	endDate: '2026-08-14',
	timezone: 'Europe/London',
	isArchived: false,
	applicationsCloseAt: '2026-07-01T23:00:00Z',
	city: 'London',
	venueName: null,
	locationMode: 'in_person'
};

/** An application of the reader's own, waiting on the organisers' decision. */
const SUBMITTED_APPLICATION: MyApplicationListItem = {
	id: 'application-1',
	status: 'submitted',
	submittedAt: '2026-05-02T12:00:00Z',
	updatedAt: '2026-05-02T12:00:00Z',
	conference: UPCOMING_CONFERENCE,
	seat: null
};

/** A delegation the reader is in, at the conference that is already over. */
const PAST_MEMBERSHIP: MyDelegationListItem = {
	id: 'membership-1',
	name: 'LSE Team',
	status: 'accepted',
	conference: FINISHED_CONFERENCE,
	seat: { seatName: 'France', committeeHeading: 'UNSC', countryCode: 'FR' }
};

/**
 * The few pieces of a request that `load` here actually reads.
 *
 * SvelteKit hands it a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeLoadEvent(overrides: Record<string, unknown> = {}): PageServerLoadEvent {
	return {
		url: new URL('http://localhost/applications'),
		locals: { supabase: SUPABASE },
		...overrides
	} as unknown as PageServerLoadEvent;
}

/**
 * The redirect `requireOnboarded` throws at a visitor who is not signed in, with
 * this page as the one to come back to afterwards.
 *
 * SvelteKit's `redirect` works by throwing rather than by returning, so the only
 * way to get hold of one to throw again is to catch it here.
 */
function loginRedirect(): unknown {
	try {
		redirect(303, '/login?next=%2Fapplications');
	} catch (thrown) {
		return thrown;
	}

	throw new Error('Nothing was thrown, so there is no redirect to hand on.');
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * Since `redirect` throws, catching it is the only way to see where it was
 * sending the reader.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** What `load` answered, as much of it as these tests look at. */
type LoadedPage = {
	cards: ApplicationCard[];
	counts: ApplicationTabCounts;
	query: MyApplicationsQuery;
	hasAnyApplication: boolean;
	unpublishedCount: number;
};

/**
 * Run `load` and hand back its answer.
 *
 * The cast says which of the values `load` returns these tests look at;
 * SvelteKit types the return of a `load` loosely enough that it needs one.
 */
async function loadPage(url?: string): Promise<LoadedPage> {
	const event = url ? makeLoadEvent({ url: new URL(url) }) : makeLoadEvent();

	return (await load(event)) as LoadedPage;
}

/** The ids of the cards, in the order the page draws them. */
function cardIds(page: LoadedPage): string[] {
	return page.cards.map((card) => card.id);
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);

	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(listMyApplications).mockResolvedValue([]);
	vi.mocked(listMyDelegationMemberships).mockResolvedValue([]);
	vi.mocked(countMyApplicationsAtUnpublishedConferences).mockResolvedValue(0);
	vi.mocked(readApplicationCardFacts).mockResolvedValue(NO_FACTS);
	vi.mocked(requireUser).mockClear();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('load', () => {
	it('sends a visitor to the sign in page, with this page to come back to', async () => {
		vi.mocked(requireOnboarded).mockRejectedValue(loginRedirect());

		const thrown = await catchRedirect(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/login?next=%2Fapplications');
		expect(listMyApplications).not.toHaveBeenCalled();
		expect(listMyDelegationMemberships).not.toHaveBeenCalled();
		expect(countMyApplicationsAtUnpublishedConferences).not.toHaveBeenCalled();
		expect(readApplicationCardFacts).not.toHaveBeenCalled();
	});

	it('uses the onboarding gate rather than the plain signed-in check', async () => {
		const event = makeLoadEvent();

		await load(event);

		expect(requireOnboarded).toHaveBeenCalledWith(event.locals, event.url);
		expect(requireUser).not.toHaveBeenCalled();
	});

	it('asks all three queries for the signed-in reader', async () => {
		await loadPage();

		expect(listMyApplications).toHaveBeenCalledWith(SUPABASE, 'user-1');
		expect(listMyDelegationMemberships).toHaveBeenCalledWith(SUPABASE, 'user-1');
		expect(countMyApplicationsAtUnpublishedConferences).toHaveBeenCalledWith(SUPABASE, 'user-1');
	});

	it('hands the page how many rows an unpublished conference hides', async () => {
		vi.mocked(countMyApplicationsAtUnpublishedConferences).mockResolvedValue(2);

		const result = await loadPage();

		expect(result.unpublishedCount).toBe(2);
	});

	it("asks for the facts about every entry's conference and every delegation", async () => {
		vi.mocked(listMyApplications).mockResolvedValue([SUBMITTED_APPLICATION]);
		vi.mocked(listMyDelegationMemberships).mockResolvedValue([PAST_MEMBERSHIP]);

		await loadPage();

		// In the merged list's order: February's conference before August's.
		expect(readApplicationCardFacts).toHaveBeenCalledWith(
			SUPABASE,
			'user-1',
			['conference-1', 'conference-2'],
			['membership-1']
		);
	});

	it('shows only conferences still to come under "All", which is where the page opens', async () => {
		vi.mocked(listMyApplications).mockResolvedValue([SUBMITTED_APPLICATION]);
		vi.mocked(listMyDelegationMemberships).mockResolvedValue([PAST_MEMBERSHIP]);

		const result = await loadPage();

		expect(result.query.tab).toBe('all');
		expect(cardIds(result)).toEqual(['application-1']);
	});

	it('shows only the conferences that are over under "Past"', async () => {
		vi.mocked(listMyApplications).mockResolvedValue([SUBMITTED_APPLICATION]);
		vi.mocked(listMyDelegationMemberships).mockResolvedValue([PAST_MEMBERSHIP]);

		const result = await loadPage('http://localhost/applications?show=past');

		expect(result.query.tab).toBe('past');
		expect(cardIds(result)).toEqual(['membership-1']);
	});

	it('counts the tabs over every card, not only the ones on screen', async () => {
		vi.mocked(listMyApplications).mockResolvedValue([SUBMITTED_APPLICATION]);

		const result = await loadPage('http://localhost/applications?show=accepted');

		expect(result.cards).toEqual([]);
		expect(result.counts).toEqual({ 'needs-action': 0, 'under-review': 1, accepted: 0 });
	});

	it('says the reader has applications even when the search matches none of them', async () => {
		vi.mocked(listMyApplications).mockResolvedValue([SUBMITTED_APPLICATION]);

		const result = await loadPage('http://localhost/applications?q=nothing+like+this');

		expect(result.query.q).toBe('nothing like this');
		expect(result.cards).toEqual([]);
		expect(result.hasAnyApplication).toBe(true);
	});

	it('says the reader has no applications when both lists are empty', async () => {
		const result = await loadPage();

		expect(result.hasAnyApplication).toBe(false);
	});
});
