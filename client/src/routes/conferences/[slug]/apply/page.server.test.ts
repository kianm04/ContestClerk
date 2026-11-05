import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the two actions are
// given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
// The real rules, not copies of them: renaming a field or changing a message in
// `$lib/applications.ts` has to fail here too.
import {
	toApplicationFormValues,
	type ApplicationFormErrors,
	type ApplicationFormValues,
	type MyApplication
} from '$lib/applications';
import type { ApplicationQuestion } from '$lib/application-questions';
import type { Conference } from '$lib/conferences';
import type { MyProfile, MyProfileDetails } from '$lib/profiles';
import type { ApplicationFormSettings } from '$lib/server/application-form-settings';
// A type-only import, which is erased before the file runs, so it does not
// reach the stand-in for this module below.
import type { CommitteeWithSeats } from '$lib/server/committees';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the two actions themselves decide.
// `requireOnboarded` has its own tests in `src/lib/server/access`, and what the
// rows themselves allow is tested in `tests/db/`.
//
// `$lib/applications`, `$lib/profiles` and `$lib/fees` are deliberately not
// stood in for: they are pure, and running the real rules is what proves the
// page and the checks agree about who may apply, what a draft may look like and
// what a submitted application must have in it.
vi.mock('$lib/server/access', () => ({ requireOnboarded: vi.fn() }));

vi.mock('$lib/server/conferences', () => ({ getConferenceBySlug: vi.fn() }));

vi.mock('$lib/server/committees', () => ({ listCommitteesWithSeatCounts: vi.fn() }));

vi.mock('$lib/server/application-questions', () => ({ listApplicationQuestions: vi.fn() }));

vi.mock('$lib/server/application-form-settings', () => ({ readApplicationFormSettings: vi.fn() }));

vi.mock('$lib/server/profiles', () => ({ getMyProfile: vi.fn() }));

vi.mock('$lib/server/applications', () => ({
	getMyApplicationFor: vi.fn(),
	upsertApplication: vi.fn()
}));

vi.mock('$lib/server/delegations', () => ({ getMyDelegationFor: vi.fn() }));

vi.mock('$lib/server/fees', () => ({ listPublicFees: vi.fn(), readPaymentSettings: vi.fn() }));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireOnboarded } from '$lib/server/access';
import { readApplicationFormSettings } from '$lib/server/application-form-settings';
import { listApplicationQuestions } from '$lib/server/application-questions';
import { getMyApplicationFor, upsertApplication } from '$lib/server/applications';
import { listCommitteesWithSeatCounts } from '$lib/server/committees';
import { getConferenceBySlug } from '$lib/server/conferences';
import { getMyDelegationFor } from '$lib/server/delegations';
import { listPublicFees, readPaymentSettings } from '$lib/server/fees';
import { setFlash } from '$lib/server/flash';
import { getMyProfile } from '$lib/server/profiles';

/** The Supabase client. `load` and the actions only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The applicant `requireOnboarded` answers with. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/**
 * The conference every test applies to.
 *
 * Its window opens in the past and closes far enough ahead that these tests
 * still pass in years to come, because `canApply` runs for real against the
 * clock of whichever machine runs them.
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
	acceptsDelegations: false,
	minAge: null,
	maxAge: null
} as unknown as Conference;

/** The same conference after its window has shut. */
const CLOSED_CONFERENCE: Conference = {
	...CONFERENCE,
	applicationsCloseAt: '2020-02-01T22:59:00Z'
};

/** The two committees the selects offer, as `listCommitteesWithSeatCounts` answers. */
const SECURITY_COUNCIL = {
	id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
	name: 'United Nations Security Council',
	abbreviation: 'UNSC'
};

const HUMAN_RIGHTS = {
	id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
	name: 'Human Rights Council',
	abbreviation: null
};

const COMMITTEE_ROWS = [
	{ committee: SECURITY_COUNCIL, seatSummary: { taken: 0, total: 12 } },
	{ committee: HUMAN_RIGHTS, seatSummary: { taken: 0, total: 20 } }
] as unknown as CommitteeWithSeats[];

/** The one custom question this conference asks, and it must be answered. */
const DIETARY: ApplicationQuestion = {
	id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
	label: 'Dietary requirements',
	helpText: 'Anything the caterers should know.',
	type: 'short_text',
	options: [],
	isRequired: true,
	position: 1
};

/** Two committee selects and a motivation box, which is the fullest form there is. */
const SETTINGS: ApplicationFormSettings = {
	committeePreferenceCount: 2,
	askMotivation: true
};

/** A profile with all four of the fields an organiser needs. */
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

/** The private half. Only the date of birth matters here, for the age warning. */
const DETAILS: MyProfileDetails = {
	email: 'daniel@example.com',
	dateOfBirth: '',
	phone: '',
	dietaryRequirements: '',
	emergencyContactName: '',
	emergencyContactPhone: ''
};

/** The draft one of the tests opens the form with. */
const DRAFT: MyApplication = {
	id: '99999999-9999-9999-9999-999999999999',
	conferenceId: CONFERENCE.id,
	status: 'draft',
	committeePreferences: [SECURITY_COUNCIL.id],
	seatPreferences: 'France, if it is free',
	motivation: 'I have wanted to sit on the Council since my first conference.',
	answers: { [DIETARY.id]: 'Vegetarian' },
	submittedAt: null,
	decisionNote: null,
	updatedAt: '2026-09-01T09:00:00Z'
};

/** The id `upsertApplication` answers with, and the page somebody lands on after it. */
const NEW_APPLICATION_ID = '77777777-7777-7777-7777-777777777777';
const APPLICATION_PATH = `/applications/${NEW_APPLICATION_ID}`;

/** The address of the apply page itself. */
const APPLY_PATH = '/conferences/riverside-mun-2027/apply';

/**
 * The few pieces of a request that `load` and the two actions actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		params: { slug: CONFERENCE.slug },
		url: new URL(`http://localhost${APPLY_PATH}`),
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
 * A post to one of the two actions.
 *
 * A tick box that is not ticked sends nothing at all, so an unticked box is
 * simply left out of `fields`.
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

/** What an action returns when it refuses: `fail` gives back `{ status, data }`. */
type ActionResult = {
	status?: number;
	data?: {
		values?: ApplicationFormValues;
		errors?: ApplicationFormErrors;
	};
};

/** A form with everything a submitted application needs in it. */
const COMPLETE_FORM = {
	committee_1: SECURITY_COUNCIL.id,
	committee_2: HUMAN_RIGHTS.id,
	seatPreferences: 'France, if it is free',
	motivation: 'I have wanted to sit on the Council since my first conference.',
	[`question_${DIETARY.id}`]: 'Vegetarian',
	consent: 'on'
};

beforeEach(() => {
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(getConferenceBySlug).mockResolvedValue(CONFERENCE);
	vi.mocked(listCommitteesWithSeatCounts).mockResolvedValue(COMMITTEE_ROWS);
	vi.mocked(listApplicationQuestions).mockResolvedValue([DIETARY]);
	vi.mocked(readApplicationFormSettings).mockResolvedValue(SETTINGS);
	vi.mocked(getMyProfile).mockResolvedValue({ profile: PROFILE, details: DETAILS });
	vi.mocked(getMyApplicationFor).mockResolvedValue(null);
	vi.mocked(getMyDelegationFor).mockResolvedValue(null);
	vi.mocked(listPublicFees).mockResolvedValue([]);
	vi.mocked(readPaymentSettings).mockResolvedValue({
		currency: 'EUR',
		collectsPaymentsManually: false,
		paymentInstructions: null
	});
	vi.mocked(upsertApplication).mockResolvedValue(NEW_APPLICATION_ID);
	vi.mocked(setFlash).mockClear();
});

describe('load', () => {
	/* `toMatchObject` rather than reading a field off the answer: SvelteKit
	   types every `load` as allowed to return nothing at all, so the answer is
	   compared as a whole instead of being narrowed first. Every test of `load`
	   here reads it the same way. */
	it('opens an empty form for somebody who has never applied here', async () => {
		const result = await load(makeLoadEvent());

		// One entry per select, because the page draws one box per entry.
		expect(result).toMatchObject({
			values: {
				committeePreferences: ['', ''],
				seatPreferences: '',
				motivation: '',
				answers: {},
				hasConsented: false
			},
			refusal: null,
			existingApplicationId: null
		});
	});

	it('opens the saved draft for somebody who has one', async () => {
		vi.mocked(getMyApplicationFor).mockResolvedValue(DRAFT);

		const result = await load(makeLoadEvent());

		// Compared against the real `toApplicationFormValues` rather than against
		// a copy of what it does, so this test is about `load` using it.
		expect(result).toMatchObject({
			values: toApplicationFormValues(DRAFT, SETTINGS.committeePreferenceCount),
			existingApplicationId: DRAFT.id
		});
	});

	it('hands the page the committees as the selects offer them, in order', async () => {
		const result = await load(makeLoadEvent());

		// The seat counts the query brings along are not passed on: no select
		// shows them, and data nothing draws is a thing the next reader has to
		// check before they can change it.
		expect(result).toMatchObject({
			committees: [
				{ id: SECURITY_COUNCIL.id, name: SECURITY_COUNCIL.name, abbreviation: 'UNSC' },
				{ id: HUMAN_RIGHTS.id, name: HUMAN_RIGHTS.name, abbreviation: null }
			],
			preferenceCount: 2,
			asksMotivation: true,
			questions: [DIETARY]
		});
	});

	it('gives the reason and an empty form when applications have closed', async () => {
		vi.mocked(getConferenceBySlug).mockResolvedValue(CLOSED_CONFERENCE);

		const result = await load(makeLoadEvent());

		// The page draws the reason instead of the form, so the values are still
		// the empty ones and nothing about them changes.
		expect(result).toMatchObject({
			refusal: { kind: 'closed' },
			values: { committeePreferences: ['', ''], hasConsented: false }
		});
	});

	it('names the fee an individual pays, in the conference currency', async () => {
		vi.mocked(listPublicFees).mockResolvedValue([
			{
				id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
				name: 'Delegate fee',
				amountCents: 6500,
				appliesTo: 'individual',
				validFrom: null,
				validUntil: null,
				position: 1
			}
		]);

		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ fee: { amountCents: 6500, currency: 'EUR' } });
	});

	it('has no fee to name when the conference charges nothing', async () => {
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ fee: null });
	});

	it('says when applications close, in the conference timezone', async () => {
		const result = await load(makeLoadEvent());

		// 22:59 UTC on 15 December is 23:59 in Amsterdam, where the clock is one
		// hour ahead in December.
		expect(result).toMatchObject({ closesOn: '15 Dec 2099 · 23:59' });
	});

	it('is a 404 when there is no such conference', async () => {
		vi.mocked(getConferenceBySlug).mockResolvedValue(null);

		await expect(load(makeLoadEvent())).rejects.toMatchObject({ status: 404 });
	});
});

describe('the saveDraft action', () => {
	it('writes a draft and sends the applicant to it', async () => {
		const redirect = await catchRedirect(() => actions.saveDraft(makeActionEvent(COMPLETE_FORM)));

		expect(upsertApplication).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			SIGNED_IN_USER.id,
			'draft',
			{
				committeePreferences: [SECURITY_COUNCIL.id, HUMAN_RIGHTS.id],
				seatPreferences: 'France, if it is free',
				motivation: 'I have wanted to sit on the Council since my first conference.',
				answers: { [DIETARY.id]: 'Vegetarian' }
			}
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Draft saved.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(APPLICATION_PATH);
	});

	it('saves a half-filled form without checking anything', async () => {
		// No committee, no motivation, no answer and no consent: all four would
		// stop a submit, and none of them stops a draft.
		await catchRedirect(() => actions.saveDraft(makeActionEvent()));

		expect(upsertApplication).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			SIGNED_IN_USER.id,
			'draft',
			{
				committeePreferences: [],
				// An empty box is not an answer, and both columns are nullable.
				seatPreferences: null,
				motivation: null,
				answers: { [DIETARY.id]: '' }
			}
		);
	});

	it('leaves out a committee that belongs to another conference', async () => {
		const event = makeActionEvent({ ...COMPLETE_FORM, committee_2: 'not-a-committee-of-this-one' });

		await catchRedirect(() => actions.saveDraft(event));

		expect(upsertApplication).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			SIGNED_IN_USER.id,
			'draft',
			expect.objectContaining({ committeePreferences: [SECURITY_COUNCIL.id] })
		);
	});

	it('refuses once the window has closed, and writes nothing', async () => {
		vi.mocked(getConferenceBySlug).mockResolvedValue(CLOSED_CONFERENCE);

		const result = (await actions.saveDraft(makeActionEvent(COMPLETE_FORM))) as ActionResult;

		// The window shutting between the page being drawn and the button being
		// pressed is the edge case `05-pages/delegate/apply.md` names.
		expect(result.status).toBe(400);
		expect(result.data?.errors?.form).toContain('Applications closed on');
		expect(result.data?.values?.seatPreferences).toBe('France, if it is free');
		expect(upsertApplication).not.toHaveBeenCalled();
	});

	it('asks the gate again, because an action is its own request', async () => {
		await catchRedirect(() => actions.saveDraft(makeActionEvent(COMPLETE_FORM)));

		expect(requireOnboarded).toHaveBeenCalled();
	});
});

describe('the submit action', () => {
	it('writes a submitted application and sends the applicant to it', async () => {
		const redirect = await catchRedirect(() => actions.submit(makeActionEvent(COMPLETE_FORM)));

		expect(upsertApplication).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE.id,
			SIGNED_IN_USER.id,
			'submitted',
			expect.objectContaining({
				committeePreferences: [SECURITY_COUNCIL.id, HUMAN_RIGHTS.id]
			})
		);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'Application submitted.'
		});
		expect(redirect.location).toBe(APPLICATION_PATH);
	});

	it('shows every problem at once and keeps what was typed', async () => {
		// Nothing but the seat preferences, which are the one optional box.
		const event = makeActionEvent({ seatPreferences: 'France, if it is free' });

		const result = (await actions.submit(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.committeePreferences?.[0]).toBe(
			'Please pick your first choice of committee.'
		);
		expect(result.data?.errors?.motivation).toBe(
			'Please tell the organisers why you want to take part.'
		);
		expect(result.data?.errors?.answers?.[DIETARY.id]).toBe('Please answer this question.');
		expect(result.data?.errors?.consent).toBe(
			'Please agree so the organisers can see your details.'
		);
		expect(result.data?.values?.seatPreferences).toBe('France, if it is free');
		expect(upsertApplication).not.toHaveBeenCalled();
	});

	it('refuses the same committee twice', async () => {
		const event = makeActionEvent({ ...COMPLETE_FORM, committee_2: SECURITY_COUNCIL.id });

		const result = (await actions.submit(event)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.committeePreferences?.[1]).toBe(
			'Please pick different committees for each choice.'
		);
		expect(upsertApplication).not.toHaveBeenCalled();
	});

	it('refuses an application from somebody whose profile is not finished', async () => {
		vi.mocked(getMyProfile).mockResolvedValue({
			profile: { ...PROFILE, institutionName: '' },
			details: DETAILS
		});

		const result = (await actions.submit(makeActionEvent(COMPLETE_FORM))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.form).toBe(
			'Complete your profile before submitting: your institution.'
		);
		expect(upsertApplication).not.toHaveBeenCalled();
	});

	it('refuses once the window has closed, and writes nothing', async () => {
		vi.mocked(getConferenceBySlug).mockResolvedValue(CLOSED_CONFERENCE);

		const result = (await actions.submit(makeActionEvent(COMPLETE_FORM))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.errors?.form).toContain('Applications closed on');
		expect(result.data?.values?.motivation).toBe(COMPLETE_FORM.motivation);
		expect(upsertApplication).not.toHaveBeenCalled();
	});
});
