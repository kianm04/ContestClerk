import { redirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeDashboard } from '$lib/home';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';

// Both the gate and the queries are stood in for, so these tests are about the
// four things `load` itself does: pick the right gate, read `?all=`, ask for the
// signed-in person's own dashboard, and hand back what came back.
// `requireOnboarded` has its own tests in `src/lib/server/access`, and the
// queries in `src/lib/server/home.test.ts` and `tests/db/`.
vi.mock('$lib/server/access', () => ({
	requireUser: vi.fn(),
	requireOnboarded: vi.fn()
}));

// `readShowAll` is the real one: what `load` reads from the address is the
// thing these tests are about, and it is pure.
vi.mock('$lib/server/home', async (importActual) => ({
	...(await importActual<typeof import('$lib/server/home')>()),
	loadHomeDashboard: vi.fn()
}));

import { requireOnboarded, requireUser } from '$lib/server/access';
import { loadHomeDashboard } from '$lib/server/home';

/** Somebody signed in who has finished onboarding, as `requireOnboarded` returns them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** The Supabase client. `load` only hands it on, so nothing here ever calls it. */
const SUPABASE = {};

/** A dashboard with nothing in it, which is what a brand-new account would see. */
const EMPTY_DASHBOARD: HomeDashboard = {
	upcomingConferences: [],
	tasks: [],
	todayItems: [],
	todayEvents: [],
	upcomingEvents: [],
	announcements: [],
	myApplications: [],
	quickSessions: [],
	exploreConferences: [],
	hasManagedConferences: false,
	chairsSomething: false,
	// Never been to a conference, so the find hero says "Find your first conference".
	hasTakenPart: false,
	// Six conferences are open, which the "Find your first conference" hero says.
	openConferenceCount: 6,
	heroSeats: null,
	showAll: null
};

/**
 * The few pieces of a request that `load` here actually reads.
 *
 * SvelteKit hands it a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeLoadEvent(overrides: Record<string, unknown> = {}): PageServerLoadEvent {
	return {
		url: new URL('http://localhost/home'),
		locals: { supabase: SUPABASE },
		...overrides
	} as unknown as PageServerLoadEvent;
}

/**
 * The redirect `requireOnboarded` throws at somebody who has not answered the
 * welcome questions yet.
 *
 * SvelteKit's `redirect` works by throwing rather than by returning, so the
 * only way to get hold of one to throw again is to catch it here.
 */
function welcomeRedirect(): unknown {
	try {
		redirect(303, '/welcome?next=%2Fhome');
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

beforeEach(() => {
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(loadHomeDashboard).mockResolvedValue(EMPTY_DASHBOARD);
	vi.mocked(requireUser).mockClear();
	vi.mocked(loadHomeDashboard).mockClear();
});

describe('load', () => {
	it('hands back exactly what the dashboard query gave it', async () => {
		const dashboard: HomeDashboard = {
			...EMPTY_DASHBOARD,
			hasManagedConferences: true,
			chairsSomething: true,
			hasTakenPart: true,
			heroSeats: { held: 41, onOffer: 120 }
		};

		vi.mocked(loadHomeDashboard).mockResolvedValue(dashboard);

		const result = await load(makeLoadEvent());

		// `toEqual` rather than `toMatchObject`: `load` adds nothing of its own,
		// so the page reads the dashboard as the query built it.
		expect(result).toEqual(dashboard);
	});

	it('asks for the signed-in person’s own dashboard, at one moment for the whole page', async () => {
		await load(makeLoadEvent());

		expect(loadHomeDashboard).toHaveBeenCalledWith(SUPABASE, 'user-1', expect.any(Date), null);
	});

	it('lifts the "Also coming up" limit when the address says ?all=conferences', async () => {
		await load(makeLoadEvent({ url: new URL('http://localhost/home?all=conferences') }));

		expect(loadHomeDashboard).toHaveBeenCalledWith(
			SUPABASE,
			'user-1',
			expect.any(Date),
			'conferences'
		);
	});

	it('lifts the "Quick sessions" limit when the address says ?all=quick', async () => {
		await load(makeLoadEvent({ url: new URL('http://localhost/home?all=quick') }));

		expect(loadHomeDashboard).toHaveBeenCalledWith(SUPABASE, 'user-1', expect.any(Date), 'quick');
	});

	it('reads anything else in ?all= as no list at all', async () => {
		// A typed or stale address names no list the page has, so the page is
		// drawn as it normally is rather than failing.
		await load(makeLoadEvent({ url: new URL('http://localhost/home?all=everything') }));

		expect(loadHomeDashboard).toHaveBeenCalledWith(SUPABASE, 'user-1', expect.any(Date), null);
	});

	it('uses the onboarding gate rather than the plain signed-in check', async () => {
		const event = makeLoadEvent();

		await load(event);

		expect(requireOnboarded).toHaveBeenCalledWith(event.locals, event.url);
		expect(requireUser).not.toHaveBeenCalled();
	});

	it('lets the welcome redirect through for a half-finished account', async () => {
		vi.mocked(requireOnboarded).mockRejectedValue(welcomeRedirect());

		const thrown = await catchRedirect(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/welcome?next=%2Fhome');
		expect(loadHomeDashboard).not.toHaveBeenCalled();
	});
});
