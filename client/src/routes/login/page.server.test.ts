import { describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';

// Supabase is stood in for, so these tests are about what the page does with an
// answer rather than about signing anybody in for real. The real sign in is
// covered by the browser tests in `tests/e2e/auth.spec.ts`.

/** A Supabase client whose sign in works. */
function supabaseThatSignsIn() {
	return { auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: null }) } };
}

/** A Supabase client that refuses, the way a wrong password is refused. */
function supabaseThatRefuses(code: string) {
	return {
		auth: {
			signInWithPassword: vi
				.fn()
				.mockResolvedValue({ error: { code, message: 'raw supabase text' } })
		}
	};
}

/** The few pieces of a request that `load` and the action actually read. */
function makeLoadEvent(search: string, claims: unknown = null): PageServerLoadEvent {
	return {
		url: new URL(`http://localhost/login${search}`),
		locals: { supabase: {}, getVerifiedClaims: async () => claims }
	} as unknown as PageServerLoadEvent;
}

/** A form post from the sign in form. */
function makeFormEvent(fields: Record<string, string>, supabase: unknown): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		url: new URL('http://localhost/login'),
		request: { formData: async () => formData },
		locals: { supabase, getVerifiedClaims: async () => null }
	} as unknown as RequestEvent;
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

describe('load', () => {
	it('hands the page "nowhere in particular" when the address carries no `next`', async () => {
		const result = await load(makeLoadEvent(''));

		expect(result).toMatchObject({ next: '/', hasConfirmedEmail: false });
	});

	it('refuses a `next` pointing at another website before the page ever sees it', async () => {
		const result = await load(makeLoadEvent('?next=%2F%2Fevil.example'));

		expect(result).toMatchObject({ next: '/' });
	});

	it('hands the page the `next` the address carries', async () => {
		const result = await load(makeLoadEvent('?next=%2Fnotifications'));

		expect(result).toMatchObject({ next: '/notifications' });
	});

	it('knows the visitor has just confirmed their address', async () => {
		const result = await load(makeLoadEvent('?message=confirmed'));

		expect(result).toMatchObject({ hasConfirmedEmail: true });
	});

	it('sends somebody already signed in away', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent('', { sub: 'user-1' })));

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/home');
	});

	it('sends somebody already signed in to where they were heading', async () => {
		const redirect = await catchRedirect(() =>
			load(makeLoadEvent('?next=%2Fnotifications', { sub: 'user-1' }))
		);

		expect(redirect.location).toBe('/notifications');
	});
});

describe('the sign in action', () => {
	it('goes to the signed-in home page when nothing said otherwise', async () => {
		const supabase = supabaseThatSignsIn();
		const event = makeFormEvent({ email: 'daniel@example.com', password: 'secret123' }, supabase);

		const redirect = await catchRedirect(() => actions.default(event));

		expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
			email: 'daniel@example.com',
			password: 'secret123'
		});
		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/home');
	});

	it('goes to the page the hidden field carried', async () => {
		const event = makeFormEvent(
			{ email: 'daniel@example.com', password: 'secret123', next: '/notifications' },
			supabaseThatSignsIn()
		);

		const redirect = await catchRedirect(() => actions.default(event));

		expect(redirect.location).toBe('/notifications');
	});

	it('refuses a page on another website', async () => {
		const event = makeFormEvent(
			{ email: 'daniel@example.com', password: 'secret123', next: '//evil.example' },
			supabaseThatSignsIn()
		);

		const redirect = await catchRedirect(() => actions.default(event));

		// Nowhere in particular, so the signed-in home page is where they land.
		expect(redirect.location).toBe('/home');
	});

	it('explains a wrong email or password, and keeps the address', async () => {
		const event = makeFormEvent(
			{ email: 'daniel@example.com', password: 'wrong' },
			supabaseThatRefuses('invalid_credentials')
		);

		const result = await actions.default(event);

		expect(result).toMatchObject({
			status: 400,
			data: {
				email: 'daniel@example.com',
				message: { text: 'That email and password do not match an account.', isSuccess: false }
			}
		});
	});

	it('never shows a raw error from Supabase', async () => {
		const event = makeFormEvent(
			{ email: 'daniel@example.com', password: 'secret123' },
			supabaseThatRefuses('some_new_code')
		);

		const result = (await actions.default(event)) as { data: { message: { text: string } } };

		expect(result.data.message.text).toBe('Something went wrong on our side. Please try again.');
	});
});
