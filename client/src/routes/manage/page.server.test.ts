import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';

// The gate and the queries are all stood in for, so these tests are about what
// `load` and the action themselves decide. `requireOnboarded` has its own tests
// in `src/lib/server/access`, and what the database allows is tested in
// `tests/db/`.
vi.mock('$lib/server/access', () => ({
	requireUser: vi.fn(),
	requireOnboarded: vi.fn(),
	requirePermission: vi.fn()
}));

vi.mock('$lib/server/conferences', () => ({
	deleteConference: vi.fn(),
	wasEverPublished: vi.fn()
}));
vi.mock('$lib/server/manage', () => ({ loadManageIndex: vi.fn() }));
vi.mock('$lib/server/invites', () => ({ listMyInvites: vi.fn(), acceptInviteById: vi.fn() }));
vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { requireOnboarded, requirePermission, requireUser } from '$lib/server/access';
import { deleteConference, wasEverPublished } from '$lib/server/conferences';
import { setFlash } from '$lib/server/flash';
import { acceptInviteById, listMyInvites } from '$lib/server/invites';
import { loadManageIndex } from '$lib/server/manage';
import { SAMPLE_CONFERENCE } from '$lib/styleguide-samples';

/** Somebody signed in who has finished onboarding, as `requireOnboarded` returns them. */
const SIGNED_IN_USER = { id: 'user-1', email: 'daniel@example.com' };

/** The Supabase client. `load` and the action only hand it on. */
const SUPABASE = {};

/** The cookie jar. Only `setFlash`, which is stood in for, ever touches it. */
const COOKIES = {};

/** An organiser area with nothing in it, which is what a brand-new account sees. */
const EMPTY_INDEX = {
	organizations: [],
	staffConferences: [],
	pendingInvites: []
};

/** One invitation waiting for the reader, as `listMyInvites` hands it back: its id, never the link's token. */
const MY_INVITE = {
	id: 'invite-1',
	kind: 'organization_member' as const,
	role: 'owner',
	name: 'Sample Europe MUN Network'
};

/** A draft the reader runs, as `requirePermission` hands it back. */
const MY_DRAFT = {
	...SAMPLE_CONFERENCE,
	id: 'conference-1',
	name: 'YMUNK',
	status: 'draft' as const
};

/** The words every refusal uses, whatever was wrong with the token. */
const INVALID_INVITE_TEXT =
	'This invitation is no longer valid. Ask the person who invited you for a new one.';

/**
 * The few pieces of a request that `load` and the action here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		url: new URL('http://localhost/manage'),
		locals: { supabase: SUPABASE },
		cookies: COOKIES,
		...overrides
	};
}

/** That stand-in, as the `load` function's own event type. */
function makeLoadEvent(overrides: Record<string, unknown> = {}): PageServerLoadEvent {
	return makeEvent(overrides) as unknown as PageServerLoadEvent;
}

/** A form post carrying the hidden id the invitation row sends. */
function makeFormEvent(fields: Record<string, string>): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({ request: { formData: async () => formData } }) as unknown as RequestEvent;
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
	data?: { message?: string };
};

beforeEach(() => {
	vi.mocked(requireOnboarded).mockResolvedValue(SIGNED_IN_USER);
	vi.mocked(loadManageIndex).mockResolvedValue(EMPTY_INDEX);
	vi.mocked(listMyInvites).mockResolvedValue([MY_INVITE]);
	vi.mocked(acceptInviteById).mockResolvedValue(true);
	vi.mocked(requirePermission).mockResolvedValue({ user: SIGNED_IN_USER, conference: MY_DRAFT });
	vi.mocked(wasEverPublished).mockResolvedValue(false);
	vi.mocked(deleteConference).mockClear();
	vi.mocked(setFlash).mockClear();
	vi.mocked(requireUser).mockClear();
	vi.mocked(loadManageIndex).mockClear();
});

describe('load', () => {
	it('hands back what the organiser area query gave it, with the view and the moment', async () => {
		// A waiting invitation rather than a conference, because it is the one
		// part of the answer that can be written out in full in a line.
		const index = { ...EMPTY_INDEX, pendingInvites: [MY_INVITE] };

		vi.mocked(loadManageIndex).mockResolvedValue(index);

		const result = await load(makeLoadEvent());

		expect(result).toEqual({ ...index, view: 'upcoming', now: expect.any(String) });
	});

	it('reads the past view from the address', async () => {
		const result = await load(makeLoadEvent({ url: new URL('http://localhost/manage?show=past') }));

		expect(result).toMatchObject({ view: 'past' });
	});

	it('asks for the signed-in person’s own organiser area, at one moment', async () => {
		const result = await load(makeLoadEvent());

		// The moment the query was asked about is the one the page is drawn at.
		const now = vi.mocked(loadManageIndex).mock.calls[0][2];

		expect(loadManageIndex).toHaveBeenCalledWith(SUPABASE, 'user-1', expect.any(Date));
		expect(result).toMatchObject({ now: now.toISOString() });
	});

	it('uses the onboarding gate rather than the plain signed-in check', async () => {
		const event = makeLoadEvent();

		await load(event);

		expect(requireOnboarded).toHaveBeenCalledWith(event.locals, event.url);
		expect(requireUser).not.toHaveBeenCalled();
	});
});

describe('the acceptInvite action', () => {
	it('accepts an invitation, says which one it was, and comes back to /manage', async () => {
		const redirect = await catchRedirect(() =>
			actions.acceptInvite(makeFormEvent({ id: MY_INVITE.id }))
		);

		expect(acceptInviteById).toHaveBeenCalledWith(SUPABASE, MY_INVITE.id);
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'You joined Sample Europe MUN Network as Owner.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/manage');
	});

	it('refuses an id that is not among the reader’s own invitations', async () => {
		// `listMyInvites` only returns invitations addressed to this reader that
		// are still open, so a wrong, expired, used or borrowed id is simply
		// missing from the list.
		const result = (await actions.acceptInvite(
			makeFormEvent({ id: 'somebody-elses-invite' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(INVALID_INVITE_TEXT);
		expect(acceptInviteById).not.toHaveBeenCalled();
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('refuses an empty id without asking the database', async () => {
		const result = (await actions.acceptInvite(makeFormEvent({}))) as ActionResult;

		expect(result.status).toBe(400);
		expect(acceptInviteById).not.toHaveBeenCalled();
	});

	it('refuses in the same words when the database turns the invitation down', async () => {
		vi.mocked(acceptInviteById).mockResolvedValue(false);

		const result = (await actions.acceptInvite(
			makeFormEvent({ id: MY_INVITE.id })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(INVALID_INVITE_TEXT);
		expect(setFlash).not.toHaveBeenCalled();
	});

	it('asks the onboarding gate again, because an action is its own request', async () => {
		await catchRedirect(() => actions.acceptInvite(makeFormEvent({ id: MY_INVITE.id })));

		expect(requireOnboarded).toHaveBeenCalled();
	});
});

describe('the deleteDraft action', () => {
	/** What the row's confirmed form sends. */
	const CONFIRMED_FIELDS = { slug: 'ymunk-2026', confirm: '1' };

	it('deletes a draft the reader runs, says so, and comes back to /manage', async () => {
		const event = makeFormEvent(CONFIRMED_FIELDS);
		const redirect = await catchRedirect(() => actions.deleteDraft(event));

		expect(requirePermission).toHaveBeenCalledWith(
			event.locals,
			event.url,
			'ymunk-2026',
			'edit_conference'
		);
		expect(deleteConference).toHaveBeenCalledWith(SUPABASE, 'conference-1');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: 'YMUNK is deleted.'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/manage');
	});

	it('refuses a conference that has gone public', async () => {
		vi.mocked(requirePermission).mockResolvedValue({
			user: SIGNED_IN_USER,
			conference: { ...MY_DRAFT, status: 'published' }
		});

		const result = (await actions.deleteDraft(makeFormEvent(CONFIRMED_FIELDS))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toBe('Only a draft can be deleted.');
		expect(deleteConference).not.toHaveBeenCalled();
	});

	it('refuses a draft that has been public before, which the database would refuse too', async () => {
		vi.mocked(wasEverPublished).mockResolvedValue(true);

		const result = (await actions.deleteDraft(makeFormEvent(CONFIRMED_FIELDS))) as ActionResult;

		expect(wasEverPublished).toHaveBeenCalledWith(SUPABASE, 'conference-1');
		expect(result.status).toBe(400);
		expect(result.data?.message).toBe(
			'A conference that has been public cannot be deleted. Publish it again and archive it after its last day.'
		);
		expect(deleteConference).not.toHaveBeenCalled();
	});

	it('refuses a request that was never confirmed', async () => {
		const result = (await actions.deleteDraft(
			makeFormEvent({ slug: 'ymunk-2026' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(deleteConference).not.toHaveBeenCalled();
	});

	it('deletes nothing when the reader does not run the conference', async () => {
		// `requirePermission` throws a 404 for a conference the reader does not run.
		vi.mocked(requirePermission).mockRejectedValue({ status: 404 });

		await expect(actions.deleteDraft(makeFormEvent(CONFIRMED_FIELDS))).rejects.toEqual({
			status: 404
		});
		expect(deleteConference).not.toHaveBeenCalled();
	});
});
