import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';

// The gate, the two database calls and the flash cookie are all stood in for,
// so these tests are about what `load` and the action themselves decide.
// `requireOnboarded` has its own tests in `src/lib/server/access`, what the
// database allows is tested in `tests/db/`, and the sentences below come from
// the real `$lib/invites`, which is pure logic and so is not mocked.
vi.mock('$lib/server/access', () => ({
	requireUser: vi.fn(),
	requireOnboarded: vi.fn()
}));

vi.mock('$lib/server/invites', () => ({
	getInvite: vi.fn(),
	acceptInvite: vi.fn(),
	listMyChairedCommittees: vi.fn()
}));
vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import type { InviteView } from '$lib/invites';
import { requireOnboarded, requireUser } from '$lib/server/access';
import { setFlash } from '$lib/server/flash';
import { acceptInvite, getInvite, listMyChairedCommittees } from '$lib/server/invites';

/** Somebody signed in who has finished onboarding, as `requireOnboarded` returns them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** The Supabase client. `load` and the action only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** The token in the address, which is the invitation's only secret. */
const TOKEN = 'mV7Qx2LpR8nK3sDf6TgYb1WcZ4hJ0eAu';

/**
 * The clock every test runs on, so that "expired" and the date in the expiry
 * message are the same in a year's time as they are today.
 */
const NOW = new Date('2026-09-19T12:00:00.000Z');

/** An invitation to chair a committee, addressed to the person signed in. */
const CHAIR_INVITE: InviteView = {
	kind: 'conference_staff',
	status: 'pending',
	role: 'Chair',
	roleScope: 'committees',
	rolePermissions: ['run_room'],
	email: 'daniel@example.com',
	organizationName: null,
	organizationSlug: null,
	conferenceName: 'THIMUN 2027',
	conferenceSlug: 'thimun-2027',
	committeeName: 'Security Council',
	invitedByName: 'Nadia Haddad',
	expiresAt: '2026-10-01T00:00:00.000Z',
	acceptedAt: null
};

/** An invitation to join an organisation, which redirects somewhere else. */
const OWNER_INVITE: InviteView = {
	...CHAIR_INVITE,
	kind: 'organization_member',
	role: 'owner',
	roleScope: null,
	rolePermissions: [],
	organizationName: 'Sample Europe MUN Network',
	organizationSlug: 'sample-europe-mun-network',
	conferenceName: null,
	conferenceSlug: null,
	committeeName: null
};

/** The same chair invitation with one thing changed. */
function inviteWith(changes: Partial<InviteView>): InviteView {
	return { ...CHAIR_INVITE, ...changes };
}

/**
 * The few pieces of a request that `load` and the action here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(claims: unknown, overrides: Record<string, unknown> = {}) {
	return {
		params: { token: TOKEN },
		url: new URL(`http://localhost/invites/${TOKEN}`),
		cookies: COOKIES,
		locals: { supabase: SUPABASE, getVerifiedClaims: async () => claims },
		...overrides
	};
}

/** That stand-in, as the `load` function's own event type. */
function makeLoadEvent(claims: unknown, overrides: Record<string, unknown> = {}) {
	return makeEvent(claims, overrides) as unknown as PageServerLoadEvent;
}

/**
 * A post of the one form on this page. It carries no fields: the token the
 * action works from is in the address, not in the form.
 */
function makeFormEvent(overrides: Record<string, unknown> = {}): RequestEvent {
	return makeEvent(
		{ sub: 'user-1' },
		{
			request: { formData: async () => new FormData() },
			...overrides
		}
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
	data?: { message?: string; problem?: { kind?: string; message?: string } };
};

beforeEach(() => {
	// Only the clock is stood in for, not `setTimeout` and the rest, because
	// nothing here waits for a timer.
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);

	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(getInvite).mockResolvedValue(CHAIR_INVITE);
	vi.mocked(acceptInvite).mockResolvedValue(true);
	vi.mocked(listMyChairedCommittees).mockReset();
	vi.mocked(listMyChairedCommittees).mockResolvedValue([
		{
			committeeName: 'Security Council',
			committeeSlug: 'security-council',
			conferenceSlug: 'thimun-2027'
		}
	]);
	vi.mocked(setFlash).mockClear();
	vi.mocked(requireUser).mockClear();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('load', () => {
	it('sends a signed-out visitor holding an open invitation to create an account, without the address', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent(null)));

		// Only the way back travels with them. The invited address used to go in
		// the link too, which handed it to anybody holding the invitation link
		// (security review L18).
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(`/register?next=%2Finvites%2F${TOKEN}`);
		expect(redirect.location).not.toContain('daniel');
	});

	it('sends a signed-out visitor holding a used or expired invitation to sign in', async () => {
		vi.mocked(getInvite).mockResolvedValue(
			inviteWith({ status: 'used', email: null, invitedByName: null })
		);

		const redirect = await catchRedirect(() => load(makeLoadEvent(null)));

		// There is no account to create for an invitation that has done its
		// work; signing in shows them what became of it.
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(`/login?next=%2Finvites%2F${TOKEN}`);
	});

	it('looks the invitation up before anybody is asked who they are', async () => {
		// `get_invite` is granted to `anon` for exactly this reason: whether the
		// token is an open invitation decides where a visitor is sent.
		await catchRedirect(() => load(makeLoadEvent(null)));

		expect(getInvite).toHaveBeenCalledWith(SUPABASE, TOKEN);
		expect(requireOnboarded).not.toHaveBeenCalled();
	});

	it('sends a signed-out visitor holding an unknown token to sign in, and says no more', async () => {
		vi.mocked(getInvite).mockResolvedValue(null);

		const redirect = await catchRedirect(() => load(makeLoadEvent(null)));

		// Nothing in the address says whether that token exists. Telling a
		// stranger which tokens exist is the one thing the token's secrecy stops.
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe(`/login?next=%2Finvites%2F${TOKEN}`);
		expect(redirect.location).not.toContain('exist');
	});

	it('hands the page the invitation, the reader’s address and the server’s clock', async () => {
		const result = await load(makeLoadEvent({ sub: 'user-1' }));

		expect(result).toEqual({
			invite: CHAIR_INVITE,
			myEmail: 'daniel@example.com',
			now: NOW.toISOString()
		});
	});

	it('answers with no invitation at all when a signed-in reader’s token is unknown', async () => {
		vi.mocked(getInvite).mockResolvedValue(null);

		const result = await load(makeLoadEvent({ sub: 'user-1' }));

		// `null` is what the page draws its "This invite does not exist." from.
		expect(result).toMatchObject({ invite: null });
	});

	it('uses the onboarding gate rather than the plain signed-in check', async () => {
		// `invite.md` sends somebody who has not finished the welcome page to
		// `/welcome?next=/invites/<token>`, which is what `requireOnboarded` does.
		const event = makeLoadEvent({ sub: 'user-1' });

		await load(event);

		expect(requireOnboarded).toHaveBeenCalledWith(event.locals, event.url);
		expect(requireUser).not.toHaveBeenCalled();
	});
});

describe('the accept action', () => {
	it('refuses a token that matches no invitation', async () => {
		vi.mocked(getInvite).mockResolvedValue(null);

		const result = (await actions.accept(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(404);
		expect(result.data?.message).toBe('This invite does not exist.');
		expect(acceptInvite).not.toHaveBeenCalled();
	});

	it('refuses an invitation sent to somebody else', async () => {
		vi.mocked(getInvite).mockResolvedValue(inviteWith({ email: 'nadia@example.com' }));

		const result = (await actions.accept(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.problem).toEqual({
			kind: 'mismatch',
			message:
				'This invite was sent to nadia@example.com. Log in with that address, or ask Nadia Haddad to invite daniel@example.com.'
		});
		expect(acceptInvite).not.toHaveBeenCalled();
	});

	it('refuses an invitation that has already been used', async () => {
		// `get_invite` says the status and withholds the address and the names
		// for a used invitation, so the page has only the status to go on.
		vi.mocked(getInvite).mockResolvedValue(
			inviteWith({
				status: 'used',
				acceptedAt: '2026-09-18T09:00:00.000Z',
				email: null,
				invitedByName: null
			})
		);

		const result = (await actions.accept(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.problem).toEqual({
			kind: 'used',
			message: 'This invite was already used.'
		});
	});

	it('refuses an expired invitation, naming the day it expired and nobody else', async () => {
		vi.mocked(getInvite).mockResolvedValue(
			inviteWith({
				status: 'expired',
				expiresAt: '2026-03-02T00:00:00.000Z',
				email: null,
				invitedByName: null
			})
		);

		const result = (await actions.accept(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.problem).toEqual({
			kind: 'expired',
			message: 'This invite expired on 2 Mar 2026. Ask the person who invited you for a new one.'
		});
	});

	it('refuses when the database turns down an invitation that looked fine here', async () => {
		vi.mocked(acceptInvite).mockResolvedValue(false);

		const result = (await actions.accept(makeFormEvent())) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'This invite could not be accepted. Ask the person who invited you for a new one.'
		);
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('accepts an organisation membership and goes to that organisation', async () => {
		vi.mocked(getInvite).mockResolvedValue(OWNER_INVITE);

		const redirect = await catchRedirect(() => actions.accept(makeFormEvent()));

		expect(acceptInvite).toHaveBeenCalledWith(SUPABASE, TOKEN);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'You joined Sample Europe MUN Network.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/manage/organizations/sample-europe-mun-network');
	});

	// `get_invite` types the slug as nullable because the same row can be about a
	// conference instead, and a membership row pointing at no organisation is
	// something the table refuses. The organiser area lists every organisation,
	// so it is the safe answer if one ever turned up.
	it('falls back to the organiser area when the invitation names no organisation', async () => {
		vi.mocked(getInvite).mockResolvedValue({ ...OWNER_INVITE, organizationSlug: null });

		const redirect = await catchRedirect(() => actions.accept(makeFormEvent()));

		expect(redirect.location).toBe('/manage');
	});

	it('sends a new organiser to that conference’s management area', async () => {
		vi.mocked(getInvite).mockResolvedValue(
			inviteWith({ role: 'Organiser', roleScope: 'conference', rolePermissions: ['administrator'] })
		);

		const redirect = await catchRedirect(() => actions.accept(makeFormEvent()));

		expect(redirect.location).toBe('/manage/thimun-2027');
	});

	it('sends a new chair to the chair room of the committee the invitation named', async () => {
		const redirect = await catchRedirect(() => actions.accept(makeFormEvent()));

		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'You joined THIMUN 2027.'
		});
		// `get_invite` gives the committee's name and not its slug, so the
		// reader's own chair rows, read after accepting, supply the slug.
		expect(listMyChairedCommittees).toHaveBeenCalledWith(SUPABASE, 'user-1');
		expect(redirect.location).toBe('/conferences/thimun-2027/committees/security-council/chair');
	});

	it('sends a chair invited to no committee to the conference page, without the query', async () => {
		vi.mocked(getInvite).mockResolvedValue(inviteWith({ committeeName: null }));

		const redirect = await catchRedirect(() => actions.accept(makeFormEvent()));

		expect(listMyChairedCommittees).not.toHaveBeenCalled();
		expect(redirect.location).toBe('/conferences/thimun-2027');
	});

	it('sends a new volunteer to the conference page as well', async () => {
		vi.mocked(getInvite).mockResolvedValue(
			inviteWith({ role: 'Volunteer', roleScope: 'conference', rolePermissions: [] })
		);

		const redirect = await catchRedirect(() => actions.accept(makeFormEvent()));

		expect(listMyChairedCommittees).not.toHaveBeenCalled();
		expect(redirect.location).toBe('/conferences/thimun-2027');
	});

	it('falls back to the signed-in home page when the conference has no slug', async () => {
		vi.mocked(getInvite).mockResolvedValue(inviteWith({ conferenceSlug: null }));

		const redirect = await catchRedirect(() => actions.accept(makeFormEvent()));

		expect(redirect.location).toBe('/home');
	});

	it('asks the onboarding gate again, because an action is its own request', async () => {
		await catchRedirect(() => actions.accept(makeFormEvent()));

		expect(requireOnboarded).toHaveBeenCalled();
	});
});
