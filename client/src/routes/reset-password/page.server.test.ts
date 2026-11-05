import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';

// Supabase is stood in for, so these tests are about who this page lets choose a
// new password: only somebody who opened a reset link in the last fifteen
// minutes (security review L37). The decision itself is `passwordRecoveryState`
// in `$lib/auth.ts`, tested there; this checks the page acts on it.

vi.mock('$lib/server/flash', () => ({ setFlash: vi.fn() }));

import { setFlash } from '$lib/server/flash';

/** The address on the account, which the heading shows. */
const MY_EMAIL = 'daniel@example.org';

/** The two things the actions ask the Supabase client itself to do. */
const updateUser = vi.fn(async () => ({ error: null }));
const signOut = vi.fn(async () => ({ error: null }));

/** An `amr` entry as GoTrue writes it, dated so many seconds before now. */
function signedInBy(method: string, secondsAgo: number) {
	return { method, timestamp: Math.floor(Date.now() / 1000) - secondsAgo };
}

/** Somebody signed in with these `amr` entries in their verified claims. */
function signedInWith(amr: unknown) {
	return {
		supabase: { auth: { updateUser, signOut } },
		getVerifiedClaims: async () => ({ sub: 'user-1', email: MY_EMAIL, amr })
	};
}

/** Nobody signed in. */
const SIGNED_OUT = {
	supabase: { auth: { updateUser, signOut } },
	getVerifiedClaims: async () => null
};

/** Opened the reset email's link a minute ago: the one session this page is for. */
const FRESH_RESET = signedInWith([signedInBy('otp', 60)]);

/** Opened it an hour ago; the session is still live, but the window has passed. */
const STALE_RESET = signedInWith([signedInBy('otp', 60 * 60)]);

/** Signed in with a password, and never through a reset link at all. */
const PASSWORD_SESSION = signedInWith([signedInBy('password', 60)]);

function makeLoadEvent(locals: unknown): PageServerLoadEvent {
	return { locals, cookies: {} } as unknown as PageServerLoadEvent;
}

/** A post of the form's two password fields. */
function makeFormEvent(
	locals: unknown,
	fields: Record<string, string> = { password: 'a-new-password', confirmPassword: 'a-new-password' }
): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		locals,
		cookies: {},
		request: { formData: async () => formData }
	} as unknown as RequestEvent;
}

/** Run something that is expected to redirect, and give back the redirect. */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Nothing was thrown, so nothing redirected.');
}

beforeEach(() => {
	updateUser.mockClear();
	signOut.mockClear();
	vi.mocked(setFlash).mockClear();
});

describe('load', () => {
	it('shows the page to somebody who has just opened a reset link', async () => {
		expect(await load(makeLoadEvent(FRESH_RESET))).toEqual({ email: MY_EMAIL });
	});

	it('sends a visitor with no session to ask for a link', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent(SIGNED_OUT)));

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/forgot-password');
	});

	it('signs a stale reset session out, says the link has run out, and asks for a new one', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent(STALE_RESET)));

		expect(signOut).toHaveBeenCalled();
		expect(setFlash).toHaveBeenCalledWith(
			{},
			{ tone: 'warning', message: 'That reset link has run out. Ask for a new one.' }
		);
		expect(redirect.location).toBe('/forgot-password');
	});

	it('sends a session that never came from a reset link away, leaving it signed in', async () => {
		// `/forgot-password` sends a signed-in person on to `/settings`, where the
		// password form asks for the current one (security review L37).
		const redirect = await catchRedirect(() => load(makeLoadEvent(PASSWORD_SESSION)));

		expect(redirect.location).toBe('/forgot-password');
		expect(signOut).not.toHaveBeenCalled();
		expect(setFlash).not.toHaveBeenCalled();
	});
});

describe('the action', () => {
	it('saves the new password for a fresh reset session and goes home', async () => {
		const redirect = await catchRedirect(() => actions.default(makeFormEvent(FRESH_RESET)));

		expect(updateUser).toHaveBeenCalledWith({ password: 'a-new-password' });
		expect(setFlash).toHaveBeenCalledWith(
			{},
			{ tone: 'success', message: 'Your password is saved.' }
		);
		expect(redirect.location).toBe('/home');
	});

	it('changes nothing for a stale reset session, even with a good password', async () => {
		const redirect = await catchRedirect(() => actions.default(makeFormEvent(STALE_RESET)));

		expect(updateUser).not.toHaveBeenCalled();
		expect(signOut).toHaveBeenCalled();
		expect(redirect.location).toBe('/forgot-password');
	});

	it('changes nothing for a session that never came from a reset link', async () => {
		// Before L37 any signed-in session could set a new password here without
		// the old one, which is what `/settings` exists to ask for.
		const redirect = await catchRedirect(() => actions.default(makeFormEvent(PASSWORD_SESSION)));

		expect(updateUser).not.toHaveBeenCalled();
		expect(redirect.location).toBe('/forgot-password');
	});

	it('changes nothing for a visitor', async () => {
		const redirect = await catchRedirect(() => actions.default(makeFormEvent(SIGNED_OUT)));

		expect(updateUser).not.toHaveBeenCalled();
		expect(redirect.location).toBe('/forgot-password');
	});

	it('still explains a short password and two that do not match', async () => {
		const short = (await actions.default(
			makeFormEvent(FRESH_RESET, { password: 'short', confirmPassword: 'short' })
		)) as { status: number; data: { message: { text: string } } };
		const different = (await actions.default(
			makeFormEvent(FRESH_RESET, { password: 'a-new-password', confirmPassword: 'another-one' })
		)) as { status: number; data: { message: { text: string } } };

		expect(short.status).toBe(400);
		expect(short.data.message.text).toBe('Please use at least 8 characters.');
		expect(different.data.message.text).toBe('The two passwords do not match.');
		expect(updateUser).not.toHaveBeenCalled();
	});
});
