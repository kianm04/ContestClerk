import { redirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';

// Both the gate and the query are stood in for, so these tests are about the
// three things `load` itself does: pick the right gate, read `?past=1` out of
// the address, and hand back what the query answered. `requireOnboarded` has
// its own tests in `src/lib/server/access`, and the query's policies are tested
// in `tests/db/`.
vi.mock('$lib/server/access', () => ({
	requireUser: vi.fn(),
	requireOnboarded: vi.fn()
}));

vi.mock('$lib/server/my-committees', () => ({ listMyCommittees: vi.fn() }));

import { requireOnboarded, requireUser } from '$lib/server/access';
import { listMyCommittees } from '$lib/server/my-committees';

/** Somebody signed in who has finished onboarding, as `requireOnboarded` returns them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** The Supabase client. `load` only hands it on, so nothing here ever calls it. */
const SUPABASE = {};

/** One committee somebody sits in, in the shape `listMyCommittees` answers. */
const SEATED_ROW = {
	committee: {
		id: 'committee-1',
		name: 'United Nations Security Council',
		abbreviation: 'UNSC',
		slug: 'unsc',
		room: 'Room 1',
		position: 1
	},
	conference: {
		id: 'conference-1',
		name: 'DelftMUN 2026',
		slug: 'delftmun-2026',
		startDate: '2026-02-12',
		endDate: '2026-02-15',
		timezone: 'Europe/Amsterdam',
		isArchived: false
	},
	role: 'delegate' as const,
	seat: { name: 'France', countryCode: 'FR' },
	nextEvent: null,
	isLive: false
};

/**
 * The few pieces of a request that `load` here actually reads.
 *
 * SvelteKit hands it a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeLoadEvent(overrides: Record<string, unknown> = {}): PageServerLoadEvent {
	return {
		url: new URL('http://localhost/committees'),
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
		redirect(303, '/login?next=%2Fcommittees');
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

/** The `includesPast` argument `listMyCommittees` was last called with. */
function includesPastOfLastCall(): boolean {
	const calls = vi.mocked(listMyCommittees).mock.calls;

	return calls[calls.length - 1][3];
}

beforeEach(() => {
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(listMyCommittees).mockResolvedValue([]);
	vi.mocked(requireUser).mockClear();
});

describe('load', () => {
	it('sends a visitor to the sign in page, with this page to come back to', async () => {
		vi.mocked(requireOnboarded).mockRejectedValue(loginRedirect());

		const thrown = await catchRedirect(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/login?next=%2Fcommittees');
		expect(listMyCommittees).not.toHaveBeenCalled();
	});

	it('uses the onboarding gate rather than the plain signed-in check', async () => {
		const event = makeLoadEvent();

		await load(event);

		expect(requireOnboarded).toHaveBeenCalledWith(event.locals, event.url);
		expect(requireUser).not.toHaveBeenCalled();
	});

	it('hides past conferences when the address says nothing', async () => {
		// The cast says which of the values `load` returns this test looks at;
		// SvelteKit types the return of a `load` loosely enough that it needs one.
		const result = (await load(makeLoadEvent())) as { includesPast: boolean };

		expect(listMyCommittees).toHaveBeenCalledWith(SUPABASE, 'user-1', expect.any(Date), false);
		expect(result.includesPast).toBe(false);
	});

	it('includes past conferences for ?past=1', async () => {
		const url = new URL('http://localhost/committees?past=1');

		const result = (await load(makeLoadEvent({ url }))) as { includesPast: boolean };

		expect(includesPastOfLastCall()).toBe(true);
		expect(result.includesPast).toBe(true);
	});

	it('treats anything other than ?past=1 as "hide them"', async () => {
		await load(makeLoadEvent({ url: new URL('http://localhost/committees?past=yes') }));
		expect(includesPastOfLastCall()).toBe(false);

		await load(makeLoadEvent({ url: new URL('http://localhost/committees?past=0') }));
		expect(includesPastOfLastCall()).toBe(false);
	});

	it('hands back exactly the committees the query answered', async () => {
		vi.mocked(listMyCommittees).mockResolvedValue([SEATED_ROW]);

		const result = (await load(makeLoadEvent())) as { rows: unknown[] };

		expect(result.rows).toEqual([SEATED_ROW]);
	});
});
