import { describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';

// Supabase is stood in for, so these tests are about what each kind of link
// does and where it ends up, not about verifying a real token.
//
// A `token_hash` link is never verified by opening it: `load` only draws the
// page with its one button, and the button's post is what consumes the token
// (security review L42). A `code` link is bound to a verifier cookie only this
// browser holds, so it is still exchanged on the spot.

/** A Supabase client that accepts whatever token or code it is given, and signs the person in. */
function supabaseThatAccepts() {
	const answer = { data: { session: { access_token: 'a-session' } }, error: null };

	return {
		auth: {
			verifyOtp: vi.fn().mockResolvedValue(answer),
			exchangeCodeForSession: vi.fn().mockResolvedValue(answer)
		}
	};
}

/**
 * A Supabase client that accepts the link but leaves nobody signed in, which is
 * what an email change link does for somebody who was not signed in already.
 */
function supabaseThatAcceptsWithoutASession() {
	const answer = { data: { session: null }, error: null };

	return {
		auth: {
			verifyOtp: vi.fn().mockResolvedValue(answer),
			exchangeCodeForSession: vi.fn().mockResolvedValue(answer)
		}
	};
}

/** A Supabase client that refuses, the way an old or tampered link is refused. */
function supabaseThatRefuses(code: string) {
	const error = { code, message: 'raw supabase text' };

	return {
		auth: {
			verifyOtp: vi.fn().mockResolvedValue({ error }),
			exchangeCodeForSession: vi.fn().mockResolvedValue({ error })
		}
	};
}

function makeLoadEvent(search: string, supabase: unknown): PageServerLoadEvent {
	return {
		url: new URL(`http://localhost/auth/confirm${search}`),
		locals: { supabase }
	} as unknown as PageServerLoadEvent;
}

/** The button's post, which goes to the same address the link opened. */
function makeFormEvent(search: string, supabase: unknown): RequestEvent {
	return {
		url: new URL(`http://localhost/auth/confirm${search}`),
		request: { formData: async () => new FormData() },
		locals: { supabase }
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

describe('opening a `token_hash` link', () => {
	it('draws the page and leaves the token alone until the button is pressed', async () => {
		const supabase = supabaseThatAccepts();

		const data = await load(makeLoadEvent('?token_hash=abc&type=signup', supabase));

		expect(data).toEqual({
			title: 'Confirm your email address.',
			buttonLabel: 'Confirm email address'
		});
		expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
	});

	it('names the button after what the link is for', async () => {
		expect(
			await load(makeLoadEvent('?token_hash=abc&type=recovery', supabaseThatAccepts()))
		).toEqual({ title: 'Reset your password.', buttonLabel: 'Choose a new password' });
	});

	it('says the link is unreadable when its type is not one Supabase sends', async () => {
		const redirect = await catchRedirect(() =>
			load(makeLoadEvent('?token_hash=abc&type=nonsense', supabaseThatAccepts()))
		);

		expect(redirect.location).toBe('/auth/error?reason=invalid');
	});
});

describe('pressing the button on a `token_hash` link', () => {
	it('verifies the token itself, so the link works on any device', async () => {
		const supabase = supabaseThatAccepts();

		await catchRedirect(() =>
			actions.default(makeFormEvent('?token_hash=abc&type=signup', supabase))
		);

		expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ type: 'signup', token_hash: 'abc' });
	});

	it('goes where the link says', async () => {
		const redirect = await catchRedirect(() =>
			actions.default(
				makeFormEvent('?token_hash=abc&type=signup&next=%2Fconferences', supabaseThatAccepts())
			)
		);

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/conferences');
	});

	it('asks somebody it could not sign in to log in, and says the address is confirmed', async () => {
		const redirect = await catchRedirect(() =>
			actions.default(
				makeFormEvent('?token_hash=abc&type=email_change', supabaseThatAcceptsWithoutASession())
			)
		);

		expect(redirect.location).toBe('/login?message=confirmed');
	});

	it('ignores a `next` pointing at another website', async () => {
		const redirect = await catchRedirect(() =>
			actions.default(
				makeFormEvent('?token_hash=abc&type=signup&next=%2F%2Fevil.example', supabaseThatAccepts())
			)
		);

		// Nowhere in particular, so a sign up link falls back to the welcome page.
		expect(redirect.location).toBe('/welcome');
	});

	it('says the link expired when Supabase says so', async () => {
		const redirect = await catchRedirect(() =>
			actions.default(
				makeFormEvent('?token_hash=abc&type=signup', supabaseThatRefuses('otp_expired'))
			)
		);

		expect(redirect.location).toBe('/auth/error?reason=expired');
	});

	it('says the link is unreadable for any other refusal', async () => {
		const redirect = await catchRedirect(() =>
			actions.default(makeFormEvent('?token_hash=abc&type=signup', supabaseThatRefuses('bad_jwt')))
		);

		expect(redirect.location).toBe('/auth/error?reason=invalid');
	});

	it('says the link is unreadable when the post carries no token, and asks Supabase nothing', async () => {
		const supabase = supabaseThatAccepts();

		const redirect = await catchRedirect(() =>
			actions.default(makeFormEvent('?type=signup', supabase))
		);

		expect(redirect.location).toBe('/auth/error?reason=invalid');
		expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
	});
});

describe('where each kind of link goes when it names no page', () => {
	it('sends a recovery link to the page that asks for a new password', async () => {
		const redirect = await catchRedirect(() =>
			actions.default(makeFormEvent('?token_hash=abc&type=recovery', supabaseThatAccepts()))
		);

		expect(redirect.location).toBe('/reset-password');
	});

	it('sends a sign up link to the welcome page', async () => {
		const redirect = await catchRedirect(() =>
			actions.default(makeFormEvent('?token_hash=abc&type=signup', supabaseThatAccepts()))
		);

		expect(redirect.location).toBe('/welcome');
	});

	it('sends an email change link to the settings page', async () => {
		const redirect = await catchRedirect(() =>
			actions.default(makeFormEvent('?token_hash=abc&type=email_change', supabaseThatAccepts()))
		);

		expect(redirect.location).toBe('/settings');
	});
});

describe('a `code` link', () => {
	it('is swapped for a session the moment it is opened', async () => {
		const supabase = supabaseThatAccepts();

		const redirect = await catchRedirect(() => load(makeLoadEvent('?code=xyz', supabase)));

		expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('xyz');
		// A `code` link carries no type, and those are sign-up confirmations far
		// more often than anything else, so it goes the same way as `signup`.
		expect(redirect.location).toBe('/welcome');
	});

	it('is explained the same way when it is refused', async () => {
		const redirect = await catchRedirect(() =>
			load(makeLoadEvent('?code=xyz', supabaseThatRefuses('otp_expired')))
		);

		expect(redirect.location).toBe('/auth/error?reason=expired');
	});
});

describe('a link with nothing in it', () => {
	it('is unreadable, and asks Supabase nothing', async () => {
		const supabase = supabaseThatAccepts();

		const redirect = await catchRedirect(() => load(makeLoadEvent('', supabase)));

		expect(redirect.location).toBe('/auth/error?reason=invalid');
		expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
		expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
	});
});
