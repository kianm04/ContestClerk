import { redirect } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';
import type { Conference } from '$lib/conferences';

// The gate and the query are stood in for, so these tests are about what
// `load` itself decides: who it is for, and where it sends them.
// `requireOnboarded` has its own tests in `src/lib/server/access`.
//
// `$lib/schedule-conference` is deliberately not stood in for:
// `pickScheduleConference` is pure, and running the real one is what proves
// this page agrees with it about which conference comes first.
vi.mock('$lib/server/access', () => ({ requireOnboarded: vi.fn() }));
vi.mock('$lib/server/my-conferences', () => ({ listMyConferences: vi.fn() }));

import { requireOnboarded } from '$lib/server/access';
import { listMyConferences } from '$lib/server/my-conferences';

/** The Supabase client. `load` only hands it on. */
const SUPABASE = {};

/** Somebody signed in who has finished onboarding, as `requireOnboarded` returns them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** Eight in the morning in London on 1 March 2027. */
const NOW = new Date('2027-03-01T08:00:00.000Z');

/** A conference the reader was at in February, over by now. */
const ENDED = {
	id: 'conf-a',
	slug: 'delftmun-2027',
	name: 'DelftMUN 2027',
	startDate: '2027-02-12',
	endDate: '2027-02-14',
	timezone: 'Europe/Amsterdam'
} as unknown as Conference;

/** A conference whose first day is today. */
const RUNNING_TODAY = {
	id: 'conf-b',
	slug: 'lse-mun-2027',
	name: 'LSE MUN 2027',
	startDate: '2027-03-01',
	endDate: '2027-03-03',
	timezone: 'Europe/London'
} as unknown as Conference;

/**
 * The few pieces of a request that `load` here actually reads.
 *
 * SvelteKit hands it a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeLoadEvent(): PageServerLoadEvent {
	return {
		url: new URL('http://localhost/schedule'),
		locals: { supabase: SUPABASE }
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
		redirect(303, '/login?next=%2Fschedule');
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
	vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(listMyConferences).mockResolvedValue([ENDED, RUNNING_TODAY]);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('load', () => {
	it('sends a visitor who is not signed in to the sign in page, with this page to come back to', async () => {
		vi.mocked(requireOnboarded).mockRejectedValue(loginRedirect());

		const thrown = await catchRedirect(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/login?next=%2Fschedule');
		expect(listMyConferences).not.toHaveBeenCalled();
	});

	it('sends the reader on to the schedule of the conference running today', async () => {
		const thrown = await catchRedirect(() => load(makeLoadEvent()));

		expect(listMyConferences).toHaveBeenCalledWith(SUPABASE, SIGNED_IN_USER.id);
		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/conferences/lse-mun-2027/schedule');
	});

	it('sends a reader whose conferences are all over to the last one', async () => {
		vi.mocked(listMyConferences).mockResolvedValue([ENDED]);

		const thrown = await catchRedirect(() => load(makeLoadEvent()));

		expect(thrown.location).toBe('/conferences/delftmun-2027/schedule');
	});

	it('keeps a reader who is part of no conference here, to be told so', async () => {
		vi.mocked(listMyConferences).mockResolvedValue([]);

		expect(await load(makeLoadEvent())).toEqual({});
	});
});
