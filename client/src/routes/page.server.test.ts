import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conference } from '$lib/conferences';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';

// The one lookup is stood in for, so these tests are about what `load` does
// with what comes back rather than about the database. What the query itself
// fetches belongs in `tests/db/`.
vi.mock('$lib/server/conferences', () => ({
	listConferencesToExplore: vi.fn()
}));

import { listConferencesToExplore } from '$lib/server/conferences';

/**
 * A stand-in for the visitor's Supabase client. This page asks it nothing
 * itself; it only passes it on to the lookup, so an empty object is enough,
 * and the tests check that this very object arrives.
 */
const SUPABASE = {};

/** One conference for the lookup to answer with. Only its name is read here. */
const THIMUN = { id: 'conference-1', name: 'THIMUN 2027' } as Conference;

/**
 * The few pieces of a page visit that `load` here actually reads.
 *
 * `claims` is what `getVerifiedClaims` answers: the signed-in account, or
 * `null` for a visitor.
 */
function makeLoadEvent(address = 'http://localhost/', claims: unknown = null): PageServerLoadEvent {
	return {
		url: new URL(address),
		locals: { supabase: SUPABASE, getVerifiedClaims: async () => claims }
	} as unknown as PageServerLoadEvent;
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

beforeEach(() => {
	vi.mocked(listConferencesToExplore).mockResolvedValue([THIMUN]);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('load', () => {
	it('sends somebody who is already signed in to their own home page', async () => {
		const thrown = await catchRedirect(() =>
			load(makeLoadEvent('http://localhost/', { sub: 'user-1', email: 'daniel@example.com' }))
		);

		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/home');
		// Somebody being sent away is asked nothing on the way out.
		expect(listConferencesToExplore).not.toHaveBeenCalled();
	});

	it("shows a visitor the delegate's view of the example by default", async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ showcaseView: 'delegate' });
	});

	it("shows the organiser's view when the switch asked for it", async () => {
		const result = await load(makeLoadEvent('http://localhost/?view=organiser'));

		expect(result).toMatchObject({ showcaseView: 'organiser' });
	});

	it('shows a visitor the soonest few conferences taking applications', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ conferences: [THIMUN] });
		// A visitor is part of no conference, so nothing is left out, and the
		// section has room for four.
		expect(listConferencesToExplore).toHaveBeenCalledWith(SUPABASE, [], expect.any(Date), 4);
	});

	it('shows the page with no conferences rather than an error when the lookup fails', async () => {
		vi.mocked(listConferencesToExplore).mockRejectedValue(new Error('The database is away.'));
		// The failure is logged, not shown; the test keeps it out of the test output.
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ conferences: [] });
		expect(console.error).toHaveBeenCalled();
	});

	it('builds the sharing picture from the address the request came in on', async () => {
		const result = await load(makeLoadEvent('https://munmeet.app/'));

		// Nothing is configured anywhere: the address the page was asked for is the
		// address the picture is served from.
		expect(result).toMatchObject({ shareImageUrl: 'https://munmeet.app/og-default.jpg' });
	});
});
