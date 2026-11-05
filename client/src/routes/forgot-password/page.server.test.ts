import { describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';

// Supabase is stood in for, so these tests are about what the page asks it for
// and what it tells the visitor, not about an email really arriving.

/** A Supabase client that takes the request, whatever address it is given. */
function supabaseThatSends() {
	return { auth: { resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }) } };
}

function makeLoadEvent(search: string, claims: unknown = null): PageServerLoadEvent {
	return {
		url: new URL(`http://localhost/forgot-password${search}`),
		locals: { supabase: {}, getVerifiedClaims: async () => claims }
	} as unknown as PageServerLoadEvent;
}

function makeFormEvent(fields: Record<string, string>, supabase: unknown): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		url: new URL('http://localhost/forgot-password'),
		request: { formData: async () => formData },
		locals: { supabase, getVerifiedClaims: async () => null }
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

describe('load', () => {
	it('sends somebody already signed in to their settings instead', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent('', { sub: 'user-1' })));

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/settings');
	});

	it('hands the page the `next` the address carries', async () => {
		const result = await load(makeLoadEvent('?next=%2Fnotifications'));

		expect(result).toMatchObject({ next: '/notifications' });
	});
});

describe('the send action', () => {
	it('asks Supabase for a link that comes back through `/auth/confirm`', async () => {
		const supabase = supabaseThatSends();

		await actions.default(makeFormEvent({ email: 'daniel@example.com' }, supabase));

		expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('daniel@example.com', {
			redirectTo: 'http://localhost/auth/confirm?next=%2Freset-password'
		});
	});

	it('comes back to the new password page whatever `next` said', async () => {
		const supabase = supabaseThatSends();

		// Anywhere else would sign the person in and leave the password they came
		// to change exactly as it was.
		await actions.default(
			makeFormEvent({ email: 'daniel@example.com', next: '/notifications' }, supabase)
		);

		expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('daniel@example.com', {
			redirectTo: 'http://localhost/auth/confirm?next=%2Freset-password'
		});
	});

	it('says the same thing whether or not the address has an account', async () => {
		const result = (await actions.default(
			makeFormEvent({ email: 'nobody@example.com' }, supabaseThatSends())
		)) as { message: { text: string; isSuccess: boolean } };

		expect(result.message).toMatchObject({
			text: 'If that address has an account, a link to choose a new password is on its way.',
			isSuccess: true
		});
	});

	it('refuses something that is not an address, without asking Supabase', async () => {
		const supabase = supabaseThatSends();

		const result = await actions.default(makeFormEvent({ email: 'nonsense' }, supabase));

		expect(result).toMatchObject({
			status: 400,
			data: { email: 'nonsense', message: { text: 'That does not look like an email address.' } }
		});
		expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
	});
});
