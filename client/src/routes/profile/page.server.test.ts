import { redirect } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileAward } from '$lib/awards';
import type { ConferenceHistoryEntry, MyProfile, MyProfileDetails } from '$lib/profiles';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';

// The gate and both queries are stood in for, so these tests are about the
// things `load` itself does: pick the right gate, ask for the signed-in
// person's own rows, work the completeness out and hand everything back.
// `requireOnboarded` has its own tests in `src/lib/server/access`, and the
// queries have theirs in `tests/db/`.
//
// `profileCompleteness` is deliberately not stood in for. "Load works the
// completeness out" is one of the things being tested here, and the real
// function is the only way to see that it did.
vi.mock('$lib/server/access', () => ({
	requireUser: vi.fn(),
	requireOnboarded: vi.fn()
}));

vi.mock('$lib/server/profiles', () => ({
	getMyProfile: vi.fn(),
	listMyConferenceHistory: vi.fn()
}));

vi.mock('$lib/server/awards', () => ({
	listMyAwards: vi.fn()
}));

import { requireOnboarded, requireUser } from '$lib/server/access';
import { listMyAwards } from '$lib/server/awards';
import { getMyProfile, listMyConferenceHistory } from '$lib/server/profiles';

/** Somebody signed in who has finished onboarding, as `requireOnboarded` returns them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** The Supabase client. `load` only hands it on, so nothing here ever calls it. */
const SUPABASE = {};

/** A profile with all four required fields filled in. */
const COMPLETE_PROFILE: MyProfile = {
	fullName: 'Daniel Park',
	avatarPath: null,
	institutionName: 'Delft University',
	countryCode: 'NL',
	experienceLevel: 'intermediate',
	pronouns: 'he/him',
	bio: 'Third year politics student.',
	onboardingCompletedAt: '2026-01-04T09:00:00.000Z'
};

/** The private half of the same person. */
const DETAILS: MyProfileDetails = {
	email: 'daniel@example.com',
	dateOfBirth: '2005-03-14',
	phone: '',
	dietaryRequirements: '',
	emergencyContactName: '',
	emergencyContactPhone: ''
};

/** One published award, as the awards query gives it back. */
const AWARD: ProfileAward = {
	id: 'award-1',
	title: 'Best Delegate',
	committeeLabel: 'UNSC',
	conferenceName: 'THIMUN 2027',
	publishedDay: '2027-02-15'
};

/** One seat at one conference, as the history query gives it back. */
const HISTORY_ENTRY: ConferenceHistoryEntry = {
	id: 'seat-1',
	conferenceName: 'DelftMUN 2026',
	conferenceSlug: 'delftmun-2026',
	conferenceLogoPath: null,
	conferenceStartDate: '2026-02-12',
	conferenceEndDate: '2026-02-15',
	committeeHeading: 'UNSC',
	committeeSlug: 'security-council',
	seatName: 'France',
	seatCountryCode: 'FR',
	role: 'Delegate'
};

/**
 * The few pieces of a request that `load` here actually reads.
 *
 * SvelteKit hands it a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeLoadEvent(overrides: Record<string, unknown> = {}): PageServerLoadEvent {
	return {
		url: new URL('http://localhost/profile'),
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
		redirect(303, '/welcome?next=%2Fprofile');
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

/**
 * Run `load` and hand back the page data, having said out loud that there is
 * some.
 *
 * SvelteKit types a `load` function as returning either its data or nothing at
 * all, because a `load` is allowed to redirect instead of answering. Every test
 * below reaches for one field of the answer, so each of them goes through this
 * rather than repeating the same check.
 */
async function loadProfilePage(event: PageServerLoadEvent) {
	const result = await load(event);

	if (!result) {
		throw new Error('`load` returned nothing, so there is no page data to look at.');
	}

	return result;
}

beforeEach(() => {
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(getMyProfile).mockResolvedValue({ profile: COMPLETE_PROFILE, details: DETAILS });
	vi.mocked(listMyConferenceHistory).mockResolvedValue([HISTORY_ENTRY]);
	vi.mocked(listMyAwards).mockReset();
	vi.mocked(listMyAwards).mockResolvedValue([AWARD]);
	vi.mocked(requireUser).mockClear();
});

describe('load', () => {
	it('hands back the profile, the details and the history it was given', async () => {
		const result = await loadProfilePage(makeLoadEvent());

		expect(result.profile).toEqual(COMPLETE_PROFILE);
		expect(result.details).toEqual(DETAILS);
		expect(result.history).toEqual([HISTORY_ENTRY]);
		expect(result.awards).toEqual([AWARD]);
	});

	it('works out that a profile with every required field is complete', async () => {
		const result = await loadProfilePage(makeLoadEvent());

		expect(result.completeness).toEqual({ isComplete: true, missingFields: [] });
	});

	it('names the required field a half-filled profile is missing', async () => {
		vi.mocked(getMyProfile).mockResolvedValue({
			profile: { ...COMPLETE_PROFILE, institutionName: '' },
			details: DETAILS
		});

		const result = await loadProfilePage(makeLoadEvent());

		expect(result.completeness).toEqual({
			isComplete: false,
			missingFields: ['institutionName']
		});
	});

	it('asks for the signed-in person’s own rows and nobody else’s', async () => {
		await load(makeLoadEvent());

		expect(getMyProfile).toHaveBeenCalledWith(SUPABASE, 'user-1');
		expect(listMyConferenceHistory).toHaveBeenCalledWith(SUPABASE, 'user-1');
		expect(listMyAwards).toHaveBeenCalledWith(SUPABASE, expect.any(Date));
	});

	it('uses the onboarding gate rather than the plain signed-in check', async () => {
		const event = makeLoadEvent();

		await load(event);

		expect(requireOnboarded).toHaveBeenCalledWith(event.locals, event.url);
		expect(requireUser).not.toHaveBeenCalled();
	});

	it('lets the welcome redirect through, and asks for nothing when it fires', async () => {
		vi.mocked(requireOnboarded).mockRejectedValue(welcomeRedirect());

		const thrown = await catchRedirect(() => load(makeLoadEvent()));

		expect(thrown.status).toBe(303);
		expect(thrown.location).toBe('/welcome?next=%2Fprofile');
		expect(getMyProfile).not.toHaveBeenCalled();
		expect(listMyConferenceHistory).not.toHaveBeenCalled();
		expect(listMyAwards).not.toHaveBeenCalled();
	});
});
