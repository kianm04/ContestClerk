import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
// The real rules, not copies of them: renaming a field or changing a message in
// `$lib/delegations.ts` has to fail here too.
import {
	emptyDelegationForm,
	type DelegationFormErrors,
	type DelegationFormValues
} from '$lib/delegations';
import { formatConferenceDay, type Conference } from '$lib/conferences';
import type { MyProfile, MyProfileDetails } from '$lib/profiles';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the action themselves decide.
// `requireOnboarded` has its own tests in `src/lib/server/access`, and what the
// rows themselves allow is tested in `tests/db/`.
//
// `$lib/delegations` and `$lib/conferences` are deliberately not stood in for:
// they are pure, and running the real rules is what proves the page and the
// checks agree about who may register a delegation and what the form must have
// in it.
vi.mock('$lib/server/access', () => ({ requireOnboarded: vi.fn() }));

vi.mock('$lib/server/conferences', () => ({ getConferenceBySlug: vi.fn() }));

vi.mock('$lib/server/profiles', () => ({ getMyProfile: vi.fn() }));

vi.mock('$lib/server/delegations', () => ({
	findMyRouteIntoConference: vi.fn(),
	createDelegation: vi.fn()
}));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireOnboarded } from '$lib/server/access';
import { getConferenceBySlug } from '$lib/server/conferences';
import { createDelegation, findMyRouteIntoConference } from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';
import { getMyProfile } from '$lib/server/profiles';

/** The Supabase client. `load` and the action only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The head delegate `requireOnboarded` answers with. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/**
 * The conference every test registers a delegation at.
 *
 * Its window opens in the past and closes far enough ahead that these tests
 * still pass in years to come, because `canCreateDelegation` runs for real
 * against the clock of whichever machine runs them.
 */
const CONFERENCE = {
	id: '11111111-1111-1111-1111-111111111111',
	slug: 'riverside-mun-2027',
	name: 'Riverside MUN 2027',
	city: 'Delft',
	countryCode: 'NL',
	countryName: 'Netherlands',
	startDate: '2027-02-12',
	endDate: '2027-02-15',
	timezone: 'Europe/Amsterdam',
	status: 'published',
	applicationsOpenAt: '2020-01-01T00:00:00Z',
	applicationsCloseAt: '2099-12-15T22:59:00Z',
	acceptsIndividualApplications: true,
	acceptsDelegations: true,
	minAge: null,
	maxAge: null
} as unknown as Conference;

/** A window that has not opened yet, and the day the refusal names. */
const OPENS_AT = '2099-01-10T09:00:00Z';
const OPENS_ON_DAY = formatConferenceDay(OPENS_AT, CONFERENCE.timezone);

/** A window that shut long ago, and the day that refusal names. */
const CLOSED_AT = '2020-02-01T22:59:00Z';
const CLOSED_ON_DAY = formatConferenceDay(CLOSED_AT, CONFERENCE.timezone);

/** The same conference before its window opens, and after it has shut. */
const NOT_YET_OPEN_CONFERENCE: Conference = { ...CONFERENCE, applicationsOpenAt: OPENS_AT };
const CLOSED_CONFERENCE: Conference = { ...CONFERENCE, applicationsCloseAt: CLOSED_AT };

/** The public half of the head's profile, which the form is prefilled from. */
const PROFILE: MyProfile = {
	fullName: 'Daniel Park',
	avatarPath: null,
	institutionName: 'Delft University',
	countryCode: 'NL',
	experienceLevel: 'intermediate',
	pronouns: '',
	bio: '',
	onboardingCompletedAt: '2026-01-05T10:00:00Z'
};

/** The private half. Nothing on this page reads it; `getMyProfile` answers with both. */
const DETAILS: MyProfileDetails = {
	email: 'daniel@example.com',
	dateOfBirth: '',
	phone: '',
	dietaryRequirements: '',
	emergencyContactName: '',
	emergencyContactPhone: ''
};

/** The id `createDelegation` answers with, and the page the head lands on after it. */
const NEW_DELEGATION_ID = '77777777-7777-7777-7777-777777777777';
const DELEGATION_PATH = `/delegations/${NEW_DELEGATION_ID}`;

/** The address of this page, and of the conference every refusal goes back to. */
const NEW_DELEGATION_PATH = '/conferences/riverside-mun-2027/delegations/new';
const CONFERENCE_PATH = '/conferences/riverside-mun-2027';

/**
 * The few pieces of a request that `load` and the action actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${NEW_DELEGATION_PATH}`),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/** That stand-in, as the `load` function's own event type. */
function makeLoadEvent(): PageServerLoadEvent {
	return makeEvent() as unknown as PageServerLoadEvent;
}

/**
 * A post to the page's one action.
 *
 * A tick box that is not ticked sends nothing at all, so an unticked consent
 * box is simply left out of `fields`.
 */
function makeActionEvent(fields: Record<string, string> = {}): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		request: { formData: async () => formData }
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

/** What the action returns when it refuses: `fail` gives back `{ status, data }`. */
type ActionResult = {
	status?: number;
	data?: {
		values?: DelegationFormValues;
		errors?: DelegationFormErrors;
	};
};

/** A form with everything a new delegation needs in it. */
const COMPLETE_FORM = {
	name: 'Delft University delegation',
	institutionName: 'Delft University',
	countryCode: 'NL',
	requestedSeats: '12',
	note: 'We would like to sit together if that is possible.',
	consent: 'on'
};

/**
 * Check that the reader was sent back to the conference with this reason.
 *
 * Every one of the six refusals ends the same way, which is the first
 * acceptance criterion in `05-pages/delegation/new.md`, so the three
 * expectations are written once here rather than six times below.
 */
function expectSentBackWith(redirect: { status: number; location: string }, message: string): void {
	expect(setFlash).toHaveBeenCalledWith(COOKIES, { tone: 'warning', message });
	expect(redirect.status).toBe(303);
	expect(redirect.location).toBe(CONFERENCE_PATH);
}

beforeEach(() => {
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(getConferenceBySlug).mockResolvedValue(CONFERENCE);
	vi.mocked(getMyProfile).mockResolvedValue({ profile: PROFILE, details: DETAILS });
	vi.mocked(findMyRouteIntoConference).mockResolvedValue(null);
	vi.mocked(createDelegation).mockResolvedValue(NEW_DELEGATION_ID);
	vi.mocked(setFlash).mockClear();
});

describe('load', () => {
	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. Every test of `load`
	   here reads it the same way. */
	it('prefills the name, the institution and the country from the profile', async () => {
		const result = await load(makeLoadEvent());

		// Compared against the real `emptyDelegationForm` rather than against a
		// copy of what it does, so this test is about `load` using it.
		expect(result).toMatchObject({ values: emptyDelegationForm(PROFILE) });
		expect(result).toMatchObject({
			values: { name: 'Delft University', institutionName: 'Delft University', countryCode: 'NL' }
		});
	});

	it('opens the form empty for a profile that names no institution or country', async () => {
		vi.mocked(getMyProfile).mockResolvedValue({
			profile: { ...PROFILE, institutionName: '', countryCode: '' },
			details: DETAILS
		});

		// `05-pages/delegation/new.md` asks for an empty box here rather than a
		// failure: members are added later, and nothing is missing yet.
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ values: { name: '', institutionName: '', countryCode: '' } });
	});

	it('is a 404 when there is no such conference', async () => {
		vi.mocked(getConferenceBySlug).mockResolvedValue(null);

		await expect(load(makeLoadEvent())).rejects.toMatchObject({ status: 404 });
	});
});

describe('load sends somebody back to the conference', () => {
	it('when the conference is not published', async () => {
		vi.mocked(getConferenceBySlug).mockResolvedValue({ ...CONFERENCE, status: 'draft' });

		const redirect = await catchRedirect(() => load(makeLoadEvent()));

		expectSentBackWith(redirect, 'Riverside MUN 2027 is not taking delegations.');
	});

	it('when the conference does not accept delegations', async () => {
		vi.mocked(getConferenceBySlug).mockResolvedValue({
			...CONFERENCE,
			acceptsDelegations: false
		});

		const redirect = await catchRedirect(() => load(makeLoadEvent()));

		expectSentBackWith(redirect, 'Riverside MUN 2027 does not accept delegations.');
	});

	it('when they have already applied on their own', async () => {
		vi.mocked(findMyRouteIntoConference).mockResolvedValue({
			kind: 'application',
			applicationId: '99999999-9999-9999-9999-999999999999'
		});

		const redirect = await catchRedirect(() => load(makeLoadEvent()));

		expectSentBackWith(redirect, 'You already applied to Riverside MUN 2027 as an individual.');
	});

	it('when they are already in a delegation here', async () => {
		vi.mocked(findMyRouteIntoConference).mockResolvedValue({
			kind: 'delegation',
			delegationId: '88888888-8888-8888-8888-888888888888',
			delegationName: 'Delft University'
		});

		const redirect = await catchRedirect(() => load(makeLoadEvent()));

		expectSentBackWith(redirect, 'You are already part of the Delft University delegation.');
	});

	it('when applications have not opened yet', async () => {
		vi.mocked(getConferenceBySlug).mockResolvedValue(NOT_YET_OPEN_CONFERENCE);

		const redirect = await catchRedirect(() => load(makeLoadEvent()));

		// The day is read in the conference's own timezone, so this page and the
		// apply page never name two different days for the same moment.
		expectSentBackWith(redirect, `Applications for Riverside MUN 2027 open on ${OPENS_ON_DAY}.`);
	});

	it('when applications have closed', async () => {
		vi.mocked(getConferenceBySlug).mockResolvedValue(CLOSED_CONFERENCE);

		const redirect = await catchRedirect(() => load(makeLoadEvent()));

		expectSentBackWith(redirect, `Applications for Riverside MUN 2027 closed on ${CLOSED_ON_DAY}.`);
	});
});

describe('the default action', () => {
	it('registers the delegation and sends the head to it', async () => {
		const redirect = await catchRedirect(() => actions.default(makeActionEvent(COMPLETE_FORM)));

		expect(createDelegation).toHaveBeenCalledWith(SUPABASE, {
			conferenceId: CONFERENCE.id,
			name: 'Delft University delegation',
			institutionName: 'Delft University',
			countryCode: 'NL',
			// A number by the time it reaches the database, although the box it came
			// out of only ever sends text.
			requestedSeats: 12,
			note: 'We would like to sit together if that is possible.'
		});
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Delegation created. Share the join code with your members.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(DELEGATION_PATH);
	});

	it('stores an empty note as nothing at all', async () => {
		await catchRedirect(() => actions.default(makeActionEvent({ ...COMPLETE_FORM, note: '' })));

		expect(createDelegation).toHaveBeenCalledWith(
			SUPABASE,
			expect.objectContaining({ note: null })
		);
	});

	it('shows every message at once and writes nothing', async () => {
		// An empty form: no name, no institution, no country, no seats and no
		// consent. That is five of the six messages `new.md` quotes; the sixth is
		// about a note over 1000 characters, which an empty box cannot be.
		const result = (await actions.default(makeActionEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.name).toBe('Give your delegation a name.');
		expect(result.data?.errors?.institutionName).toBe(
			'Enter the name of your school, university or club.'
		);
		expect(result.data?.errors?.countryCode).toBe('Pick a country.');
		expect(result.data?.errors?.requestedSeats).toBe('Ask for between 1 and 200 seats.');
		expect(result.data?.errors?.consent).toBe(
			"Please confirm that organisers may see your members' details."
		);
		expect(createDelegation).not.toHaveBeenCalled();
	});

	it('keeps every value when the submit fails', async () => {
		const typed = {
			...COMPLETE_FORM,
			name: '',
			requestedSeats: '900'
		};

		const result = (await actions.default(makeActionEvent(typed))) as ActionResult;

		expect(result.status).toBe(400);
		// Everything comes back exactly as it was sent, so no box is emptied by a
		// refusal and nothing has to be typed twice.
		expect(result.data?.values).toEqual({
			name: '',
			institutionName: 'Delft University',
			countryCode: 'NL',
			requestedSeats: '900',
			note: 'We would like to sit together if that is possible.',
			hasConsented: true
		});
		expect(result.data?.errors?.requestedSeats).toBe('Ask for between 1 and 200 seats.');
		expect(createDelegation).not.toHaveBeenCalled();
	});

	it('sends the head back when the window shut while the form was open', async () => {
		vi.mocked(getConferenceBySlug).mockResolvedValue(CLOSED_CONFERENCE);

		const redirect = await catchRedirect(() => actions.default(makeActionEvent(COMPLETE_FORM)));

		expectSentBackWith(redirect, `Applications for Riverside MUN 2027 closed on ${CLOSED_ON_DAY}.`);
		expect(createDelegation).not.toHaveBeenCalled();
	});

	it('sends the head back when they joined a delegation while the form was open', async () => {
		vi.mocked(findMyRouteIntoConference).mockResolvedValue({
			kind: 'delegation',
			delegationId: '88888888-8888-8888-8888-888888888888',
			delegationName: 'Delft University'
		});

		const redirect = await catchRedirect(() => actions.default(makeActionEvent(COMPLETE_FORM)));

		expectSentBackWith(redirect, 'You are already part of the Delft University delegation.');
		expect(createDelegation).not.toHaveBeenCalled();
	});

	it('asks the gate again, because an action is its own request', async () => {
		await catchRedirect(() => actions.default(makeActionEvent(COMPLETE_FORM)));

		expect(requireOnboarded).toHaveBeenCalled();
	});
});
