import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';
// The real rules, not copies of them: renaming a field or changing a sentence
// in `$lib/delegations.ts` has to fail here too.
import type { DelegationPreview, RouteIntoConference } from '$lib/delegations';
import type { MyProfile, MyProfileDetails } from '$lib/profiles';

// The gate, the queries and the flash cookie are all stood in for, so these
// tests are about what `load` and the action themselves decide.
// `requireOnboarded` has its own tests in `src/lib/server/access`, and what the
// database itself allows is tested in `tests/db/`.
//
// `$lib/delegations` is deliberately not stood in for. It is pure, and running
// the real `canJoinDelegation` is what proves the page and the rules agree
// about who may join and in which words they are turned away.
vi.mock('$lib/server/access', () => ({ requireOnboarded: vi.fn() }));

vi.mock('$lib/server/delegations', () => ({
	getDelegationByJoinCode: vi.fn(),
	findConferenceIdBySlug: vi.fn(),
	findMyRouteIntoConference: vi.fn(),
	joinDelegation: vi.fn()
}));

vi.mock('$lib/server/profiles', () => ({ getMyProfile: vi.fn() }));

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireOnboarded } from '$lib/server/access';
import {
	findConferenceIdBySlug,
	findMyRouteIntoConference,
	getDelegationByJoinCode,
	joinDelegation
} from '$lib/server/delegations';
import { setFlash } from '$lib/server/flash';
import { getMyProfile } from '$lib/server/profiles';

/** The Supabase client. `load` and the action only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** Somebody signed in who has finished onboarding, as `requireOnboarded` returns them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** The code in the address, as a head would have shared it. */
const JOIN_CODE = 'H7KP3QWX';

/**
 * The conference the delegation belongs to.
 *
 * It is not in the preview: `preview_delegation` answers with the conference
 * facts the card draws and not its id, so the page looks the id up from the
 * slug before it can ask what this reader already signed up for.
 */
const CONFERENCE_ID = '11111111-1111-1111-1111-111111111111';

/**
 * The delegation the link leads to.
 *
 * Its conference ends far enough ahead that these tests still pass in years to
 * come, because `canJoinDelegation` runs for real against the clock of
 * whichever machine runs them.
 */
const PREVIEW: DelegationPreview = {
	id: '22222222-2222-2222-2222-222222222222',
	name: 'Lycée Français Delegation',
	institutionName: 'Lycée Français de La Haye',
	countryCode: 'FR',
	status: 'submitted',
	conferenceName: 'THIMUN The Hague 2027',
	conferenceSlug: 'thimun-the-hague-2027',
	conferenceStatus: 'published',
	conferenceStartDate: '2099-01-24',
	conferenceEndDate: '2099-01-29',
	conferenceCity: 'The Hague',
	conferenceCountryCode: 'NL',
	headNames: ['Amira Haddad'],
	memberCount: 8
};

/** The same delegation with one thing changed. */
function previewWith(changes: Partial<DelegationPreview>): DelegationPreview {
	return { ...PREVIEW, ...changes };
}

/** The public half of the reader's profile, which the "You will join as" line shows. */
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

/** The private half. Nothing on this page reads it. */
const DETAILS: MyProfileDetails = {
	email: 'daniel@example.com',
	dateOfBirth: '',
	phone: '',
	dietaryRequirements: '',
	emergencyContactName: '',
	emergencyContactPhone: ''
};

/** Being in this very delegation already, which `load` redirects on. */
const IN_THIS_DELEGATION: RouteIntoConference = {
	kind: 'delegation',
	delegationId: PREVIEW.id,
	delegationName: PREVIEW.name
};

/**
 * The few pieces of a request that `load` and the action here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(claims: unknown, overrides: Record<string, unknown> = {}) {
	return {
		params: { joinCode: JOIN_CODE },
		url: new URL(`http://localhost/join/${JOIN_CODE}`),
		cookies: COOKIES,
		locals: { supabase: SUPABASE, getVerifiedClaims: async () => claims },
		...overrides
	};
}

/** That stand-in, as the `load` function's own event type. */
function makeLoadEvent(overrides: Record<string, unknown> = {}) {
	return makeEvent({ sub: 'user-1' }, overrides) as unknown as PageServerLoadEvent;
}

/** A post of the one form on this page, carrying the code in its hidden field. */
function makeFormEvent(joinCode: string = JOIN_CODE): RequestEvent {
	const formData = new FormData();
	formData.set('joinCode', joinCode);

	return makeEvent(
		{ sub: 'user-1' },
		{ request: { formData: async () => formData } }
	) as unknown as RequestEvent;
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
	data?: { message?: string; link?: { label: string; href: string } | null };
};

/** What `load` answers with, so a test can read `reason` without casting each time. */
type LoadResult = {
	joinCode: string;
	preview: DelegationPreview | null;
	reason: string | null;
	reasonLink: { label: string; href: string } | null;
	me: { fullName: string; avatarPath: string | null } | null;
	isTooManyWrongCodes: boolean;
};

/** Run `load` on the ordinary signed-in event and read its answer. */
async function loadPage(overrides: Record<string, unknown> = {}): Promise<LoadResult> {
	return (await load(makeLoadEvent(overrides))) as unknown as LoadResult;
}

beforeEach(() => {
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(getDelegationByJoinCode).mockResolvedValue(PREVIEW);
	vi.mocked(findConferenceIdBySlug).mockResolvedValue(CONFERENCE_ID);
	vi.mocked(findMyRouteIntoConference).mockResolvedValue(null);
	vi.mocked(getMyProfile).mockResolvedValue({ profile: PROFILE, details: DETAILS });
	vi.mocked(joinDelegation).mockResolvedValue({ ok: true, delegationId: PREVIEW.id });
	vi.mocked(setFlash).mockClear();
});

describe('load', () => {
	it('sends a signed-out visitor to the register form rather than to sign in', async () => {
		// `join.md`'s Access line: most people opening a teacher's link have no
		// account yet, so registering is the way in and `next` brings them back.
		const redirect = await catchRedirect(() =>
			load(makeEvent(null) as unknown as PageServerLoadEvent)
		);

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(`/register?next=%2Fjoin%2F${JOIN_CODE}`);
		expect(getDelegationByJoinCode).not.toHaveBeenCalled();
	});

	it('answers with nothing at all for a code nobody has', async () => {
		vi.mocked(getDelegationByJoinCode).mockResolvedValue(null);

		const result = await loadPage();

		// The page draws its "No delegation found for this link." empty state
		// from the missing preview.
		expect(result).toEqual({
			joinCode: JOIN_CODE,
			preview: null,
			reason: null,
			reasonLink: null,
			me: null,
			isTooManyWrongCodes: false
		});
	});

	it('says so, and not "no delegation found", once the reader has sent too many wrong codes', async () => {
		vi.mocked(getDelegationByJoinCode).mockResolvedValue('too_many_wrong_codes');

		const result = await loadPage();

		// The database refuses every code for the rest of the hour, the right one
		// too, so this link may well be good.
		expect(result).toEqual({
			joinCode: JOIN_CODE,
			preview: null,
			reason: null,
			reasonLink: null,
			me: null,
			isTooManyWrongCodes: true
		});
	});

	it('hands the page the preview and the reader for a code that works', async () => {
		const result = await loadPage();

		expect(result.preview).toEqual(PREVIEW);
		expect(result.reason).toBeNull();
		expect(result.reasonLink).toBeNull();
		expect(result.me).toEqual({ fullName: 'Daniel Park', avatarPath: null });
	});

	it('finds a delegation from a code typed in lower case with a space in it', async () => {
		const result = await loadPage({ params: { joinCode: ' h7kp 3qwx ' } });

		/*
			`join.md`: "Codes are matched case-insensitively" and "lower-case or
			spaced codes are normalised". The tidying itself belongs to
			`$lib/server/delegations.ts`, the one place both the preview and the
			join go through, and is tested there; what this page owes is to hand
			the code on untouched rather than to turn it away or mangle it.
		*/
		expect(getDelegationByJoinCode).toHaveBeenCalledWith(SUPABASE, ' h7kp 3qwx ');
		expect(result.preview).toEqual(PREVIEW);
		expect(result.reason).toBeNull();
	});

	it('asks about the conference the preview names, which it has to look up by slug', async () => {
		await loadPage();

		expect(findConferenceIdBySlug).toHaveBeenCalledWith(SUPABASE, PREVIEW.conferenceSlug);
		expect(findMyRouteIntoConference).toHaveBeenCalledWith(
			SUPABASE,
			CONFERENCE_ID,
			SIGNED_IN_USER.id
		);
	});

	it('treats a conference it cannot find by slug as no way in at all', async () => {
		// The join code earns somebody the delegation's facts, not the
		// conference's row, so the lookup can come back empty. `join_delegation`
		// checks the same rule in the database and has the last word.
		vi.mocked(findConferenceIdBySlug).mockResolvedValue(null);

		const result = await loadPage();

		expect(findMyRouteIntoConference).not.toHaveBeenCalled();
		expect(result.reason).toBeNull();
	});

	it('gives the card the reason a rejected delegation cannot take members', async () => {
		vi.mocked(getDelegationByJoinCode).mockResolvedValue(previewWith({ status: 'rejected' }));

		const result = await loadPage();

		expect(result.reason).toBe('This delegation was not accepted, so it cannot take members.');
		expect(result.preview).not.toBeNull();
		// Every refusal has one link that helps (T177); this one leads back to
		// the conference, where the reader can take part another way.
		expect(result.reasonLink).toEqual({
			label: 'Back to THIMUN The Hague 2027',
			href: '/conferences/thimun-the-hague-2027'
		});
	});

	it('gives the card the reason a withdrawn delegation cannot take members', async () => {
		vi.mocked(getDelegationByJoinCode).mockResolvedValue(previewWith({ status: 'withdrawn' }));

		const result = await loadPage();

		expect(result.reason).toBe('This delegation withdrew its request.');
		expect(result.reasonLink).toEqual({
			label: 'Back to THIMUN The Hague 2027',
			href: '/conferences/thimun-the-hague-2027'
		});
	});

	it('gives the card the reason a conference has already taken place', async () => {
		vi.mocked(getDelegationByJoinCode).mockResolvedValue(
			previewWith({ conferenceStartDate: '2020-01-24', conferenceEndDate: '2020-01-29' })
		);

		const result = await loadPage();

		expect(result.reason).toBe('THIMUN The Hague 2027 has already taken place.');
		expect(result.reasonLink).toEqual({
			label: 'Back to THIMUN The Hague 2027',
			href: '/conferences/thimun-the-hague-2027'
		});
	});

	it('gives the card the reason somebody is in another delegation for this conference', async () => {
		vi.mocked(findMyRouteIntoConference).mockResolvedValue({
			kind: 'delegation',
			delegationId: '33333333-3333-3333-3333-333333333333',
			delegationName: 'Delft University Delegation'
		});

		const result = await loadPage();

		expect(result.reason).toBe(
			'You are already in the Delft University Delegation delegation for THIMUN The Hague 2027.'
		);
		expect(result.reasonLink).toEqual({
			label: 'Open Delft University Delegation',
			href: '/delegations/33333333-3333-3333-3333-333333333333'
		});
	});

	it('gives the card the reason somebody has already applied on their own', async () => {
		vi.mocked(findMyRouteIntoConference).mockResolvedValue({
			kind: 'application',
			applicationId: '44444444-4444-4444-4444-444444444444'
		});

		const result = await loadPage();

		expect(result.reason).toBe(
			'You already applied to THIMUN The Hague 2027 on your own. Withdraw that application first to join a delegation.'
		);
		expect(result.reasonLink).toEqual({
			label: 'View your application',
			href: '/applications/44444444-4444-4444-4444-444444444444'
		});
	});

	it('sends somebody already in this delegation to its dashboard with the message', async () => {
		vi.mocked(findMyRouteIntoConference).mockResolvedValue(IN_THIS_DELEGATION);

		const redirect = await catchRedirect(() => load(makeLoadEvent()));

		// `join.md`'s "Already a member" state: the card is never drawn for this
		// one, because the dashboard is where they wanted to go anyway.
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'info',
			message: 'You are already in this delegation.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(`/delegations/${PREVIEW.id}`);
	});
});

describe('the join action', () => {
	it('joins and sends the new member to the delegation, naming it in the message', async () => {
		const redirect = await catchRedirect(() => actions.default(makeFormEvent()));

		expect(joinDelegation).toHaveBeenCalledWith(SUPABASE, JOIN_CODE);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'You joined Lycée Français Delegation.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(`/delegations/${PREVIEW.id}`);
	});

	it('hands the hidden field on untouched, because the server module tidies it', async () => {
		await catchRedirect(() => actions.default(makeFormEvent(' h7kp 3qwx ')));

		expect(joinDelegation).toHaveBeenCalledWith(SUPABASE, ' h7kp 3qwx ');
	});

	it('refuses a code that matches no delegation, in the words join.md quotes', async () => {
		vi.mocked(getDelegationByJoinCode).mockResolvedValue(null);

		const result = (await actions.default(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'That join link is not valid. Check it with your teacher or head delegate.'
		);
		expect(result.data?.link).toEqual({ label: 'Browse conferences', href: '/conferences' });
		expect(joinDelegation).not.toHaveBeenCalled();
	});

	/*
		The database says which rule was broken; the page says it in the words
		`join.md` quotes. `rejected` and `withdrawn` are two rows of that table
		with two sentences, which is why the function raises one message each.
	*/
	it('words a refusal the database raised in the sentence the spec quotes', async () => {
		vi.mocked(joinDelegation).mockResolvedValue({ ok: false, kind: 'rejected' });

		const result = (await actions.default(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'This delegation was not accepted, so it cannot take members.'
		);
		expect(result.data?.link).toEqual({
			label: 'Back to THIMUN The Hague 2027',
			href: '/conferences/thimun-the-hague-2027'
		});
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('names the conference in the refusals whose sentence has it in', async () => {
		vi.mocked(joinDelegation).mockResolvedValue({ ok: false, kind: 'conference_over' });

		const result = (await actions.default(makeFormEvent())) as ActionResult;

		expect(result.data?.message).toBe('THIMUN The Hague 2027 has already taken place.');
	});

	/*
		The one sentence that names a delegation the preview is not of. The
		database's message cannot carry it, so the page looks it up, only for
		this refusal and for `already_applied`, whose link needs the application.
	*/
	it('looks up the other delegation to name it, when that is the reason', async () => {
		vi.mocked(joinDelegation).mockResolvedValue({ ok: false, kind: 'in_other_delegation' });
		vi.mocked(findConferenceIdBySlug).mockResolvedValue(CONFERENCE_ID);
		vi.mocked(findMyRouteIntoConference).mockResolvedValue({
			kind: 'delegation',
			delegationId: '33333333-3333-3333-3333-333333333333',
			delegationName: 'Delft University Delegation'
		});

		const result = (await actions.default(makeFormEvent())) as ActionResult;

		expect(result.data?.message).toBe(
			'You are already in the Delft University Delegation delegation for THIMUN The Hague 2027.'
		);
		expect(result.data?.link).toEqual({
			label: 'Open Delft University Delegation',
			href: '/delegations/33333333-3333-3333-3333-333333333333'
		});
	});

	it('links to the application somebody has to withdraw first, when that is the reason', async () => {
		vi.mocked(joinDelegation).mockResolvedValue({ ok: false, kind: 'already_applied' });
		vi.mocked(findMyRouteIntoConference).mockResolvedValue({
			kind: 'application',
			applicationId: '44444444-4444-4444-4444-444444444444'
		});

		const result = (await actions.default(makeFormEvent())) as ActionResult;

		expect(result.data?.link).toEqual({
			label: 'View your application',
			href: '/applications/44444444-4444-4444-4444-444444444444'
		});
	});

	it('still refuses when the other delegation cannot be named', async () => {
		vi.mocked(joinDelegation).mockResolvedValue({ ok: false, kind: 'in_other_delegation' });
		vi.mocked(findConferenceIdBySlug).mockResolvedValue(null);

		const result = (await actions.default(makeFormEvent())) as ActionResult;

		expect(result.data?.message).toBe(
			'You are already in another delegation for THIMUN The Hague 2027.'
		);
		// With no delegation to open, the conference is the way on instead.
		expect(result.data?.link).toEqual({
			label: 'Back to THIMUN The Hague 2027',
			href: '/conferences/thimun-the-hague-2027'
		});
	});

	/*
		The one row of the refusal table that ends somewhere else. `load` redirects
		on it too, so only a form posted by hand gets this far, and `join.md`
		annotates the row "(redirect to it)" rather than giving it a notice.
	*/
	it('sends a hand-posted form from somebody already in the delegation to it', async () => {
		vi.mocked(joinDelegation).mockResolvedValue({ ok: false, kind: 'already_in_this' });

		const redirect = await catchRedirect(() => actions.default(makeFormEvent()));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'info',
			message: 'You are already in this delegation.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(`/delegations/${PREVIEW.id}`);
	});

	it('says to come back in an hour when the lookup refuses for too many wrong codes', async () => {
		vi.mocked(getDelegationByJoinCode).mockResolvedValue('too_many_wrong_codes');

		const result = (await actions.default(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(429);
		expect(result.data?.message).toBe('Too many wrong codes. Try again in an hour.');
		expect(result.data?.link).toBeNull();
		expect(joinDelegation).not.toHaveBeenCalled();
	});

	it('says the same when the join itself refuses for too many wrong codes', async () => {
		vi.mocked(joinDelegation).mockResolvedValue({ ok: false, kind: 'too_many_wrong_codes' });

		const result = (await actions.default(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Too many wrong codes. Try again in an hour.');
		expect(result.data?.link).toBeNull();
	});

	it('says only that something went wrong for a refusal nothing knows', async () => {
		vi.mocked(joinDelegation).mockResolvedValue({ ok: false, kind: 'unknown' });

		const result = (await actions.default(makeFormEvent())) as ActionResult;

		expect(result.data?.message).toBe('Something went wrong on our side. Please try again.');
		expect(result.data?.link).toBeNull();
	});

	it('leaves the rules to the database rather than checking them a second time', async () => {
		// The delegation is one `canJoinDelegation` would turn down, and the
		// action still asks `join_delegation`. `join.md`'s third criterion wants
		// the refusals "enforced by the database function, not only the page".
		vi.mocked(getDelegationByJoinCode).mockResolvedValue(previewWith({ status: 'rejected' }));

		await catchRedirect(() => actions.default(makeFormEvent()));

		expect(joinDelegation).toHaveBeenCalledWith(SUPABASE, JOIN_CODE);
	});

	it('asks the onboarding gate again, because an action is its own request', async () => {
		await catchRedirect(() => actions.default(makeFormEvent()));

		expect(requireOnboarded).toHaveBeenCalled();
	});
});
