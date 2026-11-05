import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the actions are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';

// The data-access functions are stood in for, so these tests are about what the
// `load` and the three actions do with what comes back, not about Supabase.
// What the database itself allows is tested in `tests/db/organizations.test.ts`
// and `tests/db/security-account-deletion.test.ts`, which cover
// `delete_my_account`.
vi.mock('$lib/server/accounts', () => ({
	readPendingEmailChange: vi.fn(),
	changeMyEmail: vi.fn(),
	createThrowawayAuthClient: vi.fn(),
	isMyCurrentPassword: vi.fn(),
	signInAgain: vi.fn(),
	endThrowawaySession: vi.fn(),
	changeMyPassword: vi.fn(),
	deleteMyAccount: vi.fn()
}));

vi.mock('$lib/server/organizations', () => ({ listMyOwnerships: vi.fn() }));
vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import {
	changeMyEmail,
	changeMyPassword,
	createThrowawayAuthClient,
	deleteMyAccount,
	endThrowawaySession,
	isMyCurrentPassword,
	readPendingEmailChange,
	signInAgain
} from '$lib/server/accounts';
import { setFlash } from '$lib/server/flash';
import { listMyOwnerships } from '$lib/server/organizations';

/** The address the account in these tests already has. */
const MY_EMAIL = 'daniel@example.org';

/** Signing out is the only thing the actions ask the Supabase client itself to do. */
const signOut = vi.fn(async () => ({ error: null }));

/**
 * The client the current password is checked on. It is not the visitor's own
 * (`SIGNED_IN.supabase` below), because signing in on that one would write the
 * session cookies afresh, and a wrong guess must leave the real session alone.
 */
const THROWAWAY = { auth: { signInWithPassword: vi.fn() } };

/** Somebody signed in, as `hooks.server.ts` would have left them. */
const SIGNED_IN = {
	supabase: { auth: { signOut } },
	getVerifiedClaims: async () => ({ sub: 'user-1', email: MY_EMAIL })
};

/** Nobody signed in. */
const SIGNED_OUT = { supabase: {}, getVerifiedClaims: async () => null };

/**
 * The few pieces of a request that `load` and the actions here actually read.
 *
 * SvelteKit hands them a great many more, so the cast says "this is enough";
 * anything the code reaches for that is missing fails the test loudly.
 */
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		url: new URL('http://localhost/settings'),
		locals: SIGNED_IN,
		cookies: {},
		...overrides
	};
}

/** That stand-in, as the `load` function's own event type. */
function makeLoadEvent(overrides: Record<string, unknown> = {}): PageServerLoadEvent {
	return makeEvent(overrides) as unknown as PageServerLoadEvent;
}

/** A form post carrying the fields one of the three forms sends. */
function makeFormEvent(
	fields: Record<string, string>,
	overrides: Record<string, unknown> = {}
): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return makeEvent({
		request: { formData: async () => formData },
		...overrides
	}) as unknown as RequestEvent;
}

/**
 * Run something that is expected to redirect, and give back the redirect.
 *
 * SvelteKit's `redirect` works by throwing, so the only way to see where it
 * was sending the reader is to catch it.
 */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

/** One of the three cards' messages, as an action hands it back. */
type CardMessage = { card: string; tone: string; text: string };

/**
 * What an action returns when it does not redirect.
 *
 * There are two shapes. A `fail` gives back `{ status, data }`, where `data` is
 * what the action passed to it; anything else is returned as it stands. Both
 * are described here, so a test can reach for whichever it expects.
 */
type ActionResult = {
	status?: number;
	data?: { message?: CardMessage; email?: string };
	message?: CardMessage;
	flash?: { tone: string; message: string };
};

beforeEach(() => {
	vi.mocked(readPendingEmailChange).mockResolvedValue(null);
	vi.mocked(listMyOwnerships).mockResolvedValue([]);
	vi.mocked(changeMyEmail).mockResolvedValue(null);
	vi.mocked(createThrowawayAuthClient).mockReturnValue(
		THROWAWAY as unknown as ReturnType<typeof createThrowawayAuthClient>
	);
	vi.mocked(isMyCurrentPassword).mockResolvedValue(true);
	vi.mocked(signInAgain).mockResolvedValue(true);
	vi.mocked(endThrowawaySession).mockClear();
	vi.mocked(changeMyPassword).mockResolvedValue(null);
	vi.mocked(deleteMyAccount).mockResolvedValue(null);
	vi.mocked(setFlash).mockClear();
	signOut.mockClear();
});

describe('load', () => {
	it('sends a visitor to the sign in page, with this page to come back to', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent({ locals: SIGNED_OUT })));

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/login?next=%2Fsettings');
	});

	it('lets somebody who has not finished onboarding in, because this is the way out', async () => {
		// The onboarding gate is deliberately not on this page, so that somebody
		// who signed up with the wrong address can still change it or leave.
		const result = await load(makeLoadEvent());

		expect(result).toMatchObject({ email: MY_EMAIL });
	});

	it('hands the page the address, the pending change and the organisations in the way', async () => {
		vi.mocked(readPendingEmailChange).mockResolvedValue('new@example.org');
		vi.mocked(listMyOwnerships).mockResolvedValue([
			{ id: 'org-1', name: 'Amsterdam MUN', slug: 'amsterdam-mun' }
		]);

		const result = await load(makeLoadEvent());

		expect(result).toEqual({
			email: MY_EMAIL,
			pendingEmail: 'new@example.org',
			soleOwnerships: [{ id: 'org-1', name: 'Amsterdam MUN', slug: 'amsterdam-mun' }]
		});
	});
});

describe('the changeEmail action', () => {
	it('asks Supabase for the new address and says to check the inbox', async () => {
		const result = (await actions.changeEmail(
			makeFormEvent({ email: 'new@example.org' })
		)) as ActionResult;

		expect(changeMyEmail).toHaveBeenCalledWith(
			SIGNED_IN.supabase,
			'new@example.org',
			'http://localhost/auth/confirm?next=%2Fsettings'
		);
		expect(result.message).toMatchObject({
			card: 'email',
			tone: 'success',
			text: 'Check new@example.org for a link to confirm the change.'
		});
	});

	it('refuses the address the account already has, without asking Supabase', async () => {
		const result = (await actions.changeEmail(makeFormEvent({ email: MY_EMAIL }))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message?.text).toBe('That is already your email address.');
		expect(changeMyEmail).not.toHaveBeenCalled();
	});

	it('refuses something that is not an address, and keeps what was typed', async () => {
		const result = (await actions.changeEmail(makeFormEvent({ email: 'oops' }))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message?.text).toBe('That does not look like an email address.');
		expect(result.data?.email).toBe('oops');
	});

	it('shows what Supabase said when it refuses', async () => {
		vi.mocked(changeMyEmail).mockResolvedValue('Email address already in use');

		const result = (await actions.changeEmail(
			makeFormEvent({ email: 'taken@example.org' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toMatchObject({
			card: 'email',
			tone: 'error',
			text: 'Email address already in use'
		});
	});

	it('sends a visitor to the sign in page rather than changing anything', async () => {
		const redirect = await catchRedirect(() =>
			actions.changeEmail(makeFormEvent({ email: 'new@example.org' }, { locals: SIGNED_OUT }))
		);

		expect(redirect.location).toBe('/login?next=%2Fsettings');
		expect(changeMyEmail).not.toHaveBeenCalled();
	});
});

describe('the changePassword action', () => {
	/** The three fields the password form sends, all correct. */
	const goodFields = {
		currentPassword: 'the-old-password',
		newPassword: 'a-good-password',
		repeatPassword: 'a-good-password'
	};

	it('checks the current password on a throwaway client, then saves the new one', async () => {
		const result = (await actions.changePassword(makeFormEvent(goodFields))) as ActionResult;

		// On the throwaway client, never on the visitor's own: a sign-in there
		// would rewrite the session cookies (security review L43).
		expect(isMyCurrentPassword).toHaveBeenCalledWith(THROWAWAY, MY_EMAIL, 'the-old-password');
		expect(changeMyPassword).toHaveBeenCalledWith(SIGNED_IN.supabase, 'a-good-password');
		expect(result.flash).toEqual({ tone: 'success', message: 'Password changed.' });
	});

	it('asks for the current password when the box was left empty, without asking Supabase', async () => {
		const result = (await actions.changePassword(
			makeFormEvent({ ...goodFields, currentPassword: '' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message?.text).toBe('Enter your current password.');
		expect(isMyCurrentPassword).not.toHaveBeenCalled();
		expect(changeMyPassword).not.toHaveBeenCalled();
	});

	it('refuses a wrong current password and changes nothing', async () => {
		vi.mocked(isMyCurrentPassword).mockResolvedValue(false);

		const result = (await actions.changePassword(makeFormEvent(goodFields))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message?.text).toBe('Your current password is not right.');
		expect(changeMyPassword).not.toHaveBeenCalled();
	});

	it('refuses a new password shorter than eight characters, without asking Supabase', async () => {
		const result = (await actions.changePassword(
			makeFormEvent({ ...goodFields, newPassword: 'short', repeatPassword: 'short' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message?.text).toBe('Please use at least 8 characters.');
		expect(isMyCurrentPassword).not.toHaveBeenCalled();
	});

	it('refuses two new passwords that do not match', async () => {
		const result = (await actions.changePassword(
			makeFormEvent({ ...goodFields, repeatPassword: 'a-good-passward' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message?.text).toBe('The two new passwords do not match.');
		expect(changeMyPassword).not.toHaveBeenCalled();
	});

	it('never sends a password back to the page', async () => {
		vi.mocked(isMyCurrentPassword).mockResolvedValue(false);

		const result = (await actions.changePassword(makeFormEvent(goodFields))) as ActionResult;

		expect(JSON.stringify(result)).not.toContain('a-good-password');
		expect(JSON.stringify(result)).not.toContain('the-old-password');
	});

	it('apologises in our own words when Supabase refuses the new password', async () => {
		vi.mocked(changeMyPassword).mockResolvedValue('AuthApiError: something went wrong');

		const result = (await actions.changePassword(makeFormEvent(goodFields))) as ActionResult;

		expect(result.data?.message?.text).toBe('Something went wrong on our side. Please try again.');
	});
});

describe('the deleteAccount action', () => {
	/** The two fields the delete form sends, both right. */
	const GOOD_DELETE_FIELDS = { confirmation: 'DELETE', currentPassword: 'the-old-password' };

	it('deletes the account, signs out and says so on the front page', async () => {
		const redirect = await catchRedirect(() =>
			actions.deleteAccount(makeFormEvent(GOOD_DELETE_FIELDS))
		);

		// Through the sign-in just made, whose fifteen minutes have only begun,
		// and not the visitor's own session, which may be days old.
		expect(deleteMyAccount).toHaveBeenCalledWith(THROWAWAY);
		expect(signOut).toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(
			{},
			{ tone: 'success', message: 'Your account was deleted.' }
		);
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/');
	});

	it('refuses anything but the word DELETE, and deletes nothing', async () => {
		const result = (await actions.deleteAccount(
			makeFormEvent({ ...GOOD_DELETE_FIELDS, confirmation: 'delete' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message?.text).toBe('Type DELETE to confirm.');
		expect(deleteMyAccount).not.toHaveBeenCalled();
	});

	it('refuses an empty confirmation', async () => {
		const result = (await actions.deleteAccount(makeFormEvent({}))) as ActionResult;

		expect(result.status).toBe(400);
		expect(deleteMyAccount).not.toHaveBeenCalled();
	});

	it('signs in again with the current password on a throwaway client before deleting anything', async () => {
		// Somebody at an unlocked laptop could type DELETE; only the owner of the
		// account knows its password (security review L43).
		await catchRedirect(() => actions.deleteAccount(makeFormEvent(GOOD_DELETE_FIELDS)));

		expect(signInAgain).toHaveBeenCalledWith(THROWAWAY, MY_EMAIL, 'the-old-password');
	});

	it('refuses a wrong current password, and deletes nothing', async () => {
		vi.mocked(signInAgain).mockResolvedValue(false);

		const result = (await actions.deleteAccount(makeFormEvent(GOOD_DELETE_FIELDS))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toMatchObject({
			card: 'delete',
			tone: 'error',
			text: 'Your current password is not right.'
		});
		expect(deleteMyAccount).not.toHaveBeenCalled();
		expect(signOut).not.toHaveBeenCalled();
	});

	it('asks for the current password when the box was left empty, without asking Supabase', async () => {
		const result = (await actions.deleteAccount(
			makeFormEvent({ confirmation: 'DELETE' })
		)) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message?.text).toBe('Enter your current password.');
		expect(signInAgain).not.toHaveBeenCalled();
		expect(deleteMyAccount).not.toHaveBeenCalled();
	});

	it('never sends the password back to the page', async () => {
		vi.mocked(signInAgain).mockResolvedValue(false);

		const result = (await actions.deleteAccount(makeFormEvent(GOOD_DELETE_FIELDS))) as ActionResult;

		expect(JSON.stringify(result)).not.toContain('the-old-password');
	});

	it('says the account was kept when the database refuses a sole owner', async () => {
		vi.mocked(deleteMyAccount).mockResolvedValue({
			kind: 'refused',
			message: 'Make somebody else an owner of Amsterdam MUN before you delete your account'
		});
		vi.mocked(listMyOwnerships).mockResolvedValue([
			{ id: 'org-1', name: 'Amsterdam MUN', slug: 'amsterdam-mun' }
		]);

		const result = (await actions.deleteAccount(makeFormEvent(GOOD_DELETE_FIELDS))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toMatchObject({ card: 'delete', tone: 'warning' });
		// The page itself names the organisation, from `load`. What must never
		// appear is the database's own wording.
		expect(result.data?.message?.text).not.toContain('Make somebody else');
		expect(signOut).not.toHaveBeenCalled();
		// The account is kept, so the sign-in made for the deletion is ended.
		expect(endThrowawaySession).toHaveBeenCalledWith(THROWAWAY);
	});

	it("shows the database's own sentence when the person is the only head of a delegation", async () => {
		// Unlike sole ownership, the page has nothing of its own to say here, and
		// the function's sentence is written for the screen: it names the
		// delegation and both ways out.
		const sentence =
			'You are the only head of Lycée Rousseau at Amsterdam MUN. Make another member a head, or withdraw the delegation, before deleting your account.';
		vi.mocked(deleteMyAccount).mockResolvedValue({ kind: 'refused', message: sentence });

		const result = (await actions.deleteAccount(makeFormEvent(GOOD_DELETE_FIELDS))) as ActionResult;

		expect(result.status).toBe(400);
		expect(result.data?.message).toEqual({ card: 'delete', tone: 'warning', text: sentence });
		expect(signOut).not.toHaveBeenCalled();
	});

	it('shows the ask to sign in again when the sign-in is too old', async () => {
		const sentence =
			'You signed in more than 15 minutes ago. Sign in again before deleting your account.';
		vi.mocked(deleteMyAccount).mockResolvedValue({ kind: 'refused', message: sentence });

		const result = (await actions.deleteAccount(makeFormEvent(GOOD_DELETE_FIELDS))) as ActionResult;

		expect(result.data?.message).toEqual({ card: 'delete', tone: 'warning', text: sentence });
	});

	it('apologises in our own words when the database fails for any other reason', async () => {
		vi.mocked(deleteMyAccount).mockResolvedValue({ kind: 'failed', message: 'could not connect' });

		const result = (await actions.deleteAccount(makeFormEvent(GOOD_DELETE_FIELDS))) as ActionResult;

		expect(result.data?.message?.text).toBe('Something went wrong on our side. Please try again.');
		// And never the raw text, which explains nothing to the person.
		expect(result.data?.message?.text).not.toContain('could not connect');
	});

	it('sends a visitor to the sign in page rather than deleting anything', async () => {
		const redirect = await catchRedirect(() =>
			actions.deleteAccount(makeFormEvent(GOOD_DELETE_FIELDS, { locals: SIGNED_OUT }))
		);

		expect(redirect.location).toBe('/login?next=%2Fsettings');
		expect(deleteMyAccount).not.toHaveBeenCalled();
	});
});
