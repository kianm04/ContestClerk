import { describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in events below are exactly the shape `load` and the action are given.
import type { PageServerLoadEvent, RequestEvent } from './$types';

// Supabase is stood in for, so these tests are about what the page sends it and
// what it does with the answer. That `full_name` really lands in `profiles` is
// the `handle_new_user` trigger's job, tested in `tests/db/profiles.test.ts`.

/** What a real form carries when somebody has filled everything in properly. */
const GOOD_FIELDS = {
	fullName: 'Daniel Perez',
	email: 'daniel@example.com',
	password: 'secret123',
	agree: 'on'
};

/** A Supabase client that creates the account and waits for the email to be confirmed. */
function supabaseThatSignsUp() {
	return { auth: { signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) } };
}

/** A Supabase client that turns the sign up down with `message`. */
function supabaseThatRefuses(message: string) {
	return {
		auth: { signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: { message } }) }
	};
}

function makeLoadEvent(search: string, claims: unknown = null): PageServerLoadEvent {
	return {
		url: new URL(`http://localhost/register${search}`),
		locals: { supabase: {}, getVerifiedClaims: async () => claims }
	} as unknown as PageServerLoadEvent;
}

/** A form post from the sign up form. */
function makeFormEvent(fields: Record<string, string>, supabase: unknown): RequestEvent {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) {
		formData.set(name, value);
	}

	return {
		url: new URL('http://localhost/register'),
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
	it('hands the page the address an invite link filled in', async () => {
		const result = await load(makeLoadEvent('?email=chair%40school.org'));

		expect(result).toMatchObject({ email: 'chair@school.org', next: '/' });
	});

	it('hands the page the `next` the address carries', async () => {
		const result = await load(makeLoadEvent('?next=%2Fconferences'));

		expect(result).toMatchObject({ next: '/conferences' });
	});

	it('sends somebody already signed in away', async () => {
		const redirect = await catchRedirect(() => load(makeLoadEvent('', { sub: 'user-1' })));

		expect(redirect.location).toBe('/home');
	});
});

describe('the sign up action', () => {
	it('sends the name to Supabase as `full_name`', async () => {
		const supabase = supabaseThatSignsUp();

		await actions.default(makeFormEvent(GOOD_FIELDS, supabase));

		expect(supabase.auth.signUp).toHaveBeenCalledWith({
			email: 'daniel@example.com',
			password: 'secret123',
			options: {
				data: { full_name: 'Daniel Perez' },
				// Nowhere in particular was asked for, so the confirmation link lands
				// on the welcome page, where a new account answers its first questions.
				emailRedirectTo: 'http://localhost/auth/confirm?next=%2Fwelcome'
			}
		});
	});

	it('carries `next` into the confirmation link', async () => {
		const supabase = supabaseThatSignsUp();

		await actions.default(makeFormEvent({ ...GOOD_FIELDS, next: '/conferences' }, supabase));

		expect(supabase.auth.signUp).toHaveBeenCalledWith(
			expect.objectContaining({
				options: expect.objectContaining({
					emailRedirectTo: 'http://localhost/auth/confirm?next=%2Fconferences'
				})
			})
		);
	});

	it('says the email is on its way without saying whether the account is new', async () => {
		const result = (await actions.default(makeFormEvent(GOOD_FIELDS, supabaseThatSignsUp()))) as {
			message: { text: string; isSuccess: boolean };
			offersLogIn: boolean;
		};

		expect(result.message.isSuccess).toBe(true);
		expect(result.message.text).toBe(
			'Almost done. Open the confirmation link we sent to daniel@example.com.'
		);
		// Somebody who already has an account gets no email, so the answer
		// also offers "Log in instead" (T176).
		expect(result.offersLogIn).toBe(true);
	});

	it('goes straight in when the project has confirmation switched off', async () => {
		const supabase = {
			auth: { signUp: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }) }
		};

		const redirect = await catchRedirect(() =>
			actions.default(makeFormEvent({ ...GOOD_FIELDS, next: '/conferences' }, supabase))
		);

		expect(redirect.status).toBe(303);
		expect(redirect.location).toBe('/conferences');
	});

	it('asks for a name before anything else', async () => {
		const supabase = supabaseThatSignsUp();
		const event = makeFormEvent({ ...GOOD_FIELDS, fullName: '  ', email: 'nonsense' }, supabase);

		const result = await actions.default(event);

		expect(result).toMatchObject({
			status: 400,
			data: { message: { text: 'Please enter your name.' } }
		});
		expect(supabase.auth.signUp).not.toHaveBeenCalled();
	});

	it('refuses a name longer than a hundred characters', async () => {
		const event = makeFormEvent(
			{ ...GOOD_FIELDS, fullName: 'a'.repeat(101) },
			supabaseThatSignsUp()
		);

		const result = await actions.default(event);

		expect(result).toMatchObject({ data: { message: { text: 'Please use a shorter name.' } } });
	});

	it('checks the address, then the password', async () => {
		const badEmail = await actions.default(
			makeFormEvent({ ...GOOD_FIELDS, email: 'nonsense' }, supabaseThatSignsUp())
		);
		const shortPassword = await actions.default(
			makeFormEvent({ ...GOOD_FIELDS, password: 'short' }, supabaseThatSignsUp())
		);

		expect(badEmail).toMatchObject({
			data: { message: { text: 'That does not look like an email address.' } }
		});
		expect(shortPassword).toMatchObject({
			data: { message: { text: 'Please use at least 8 characters.' } }
		});
	});

	it('refuses to go on until the terms are agreed to', async () => {
		const supabase = supabaseThatSignsUp();
		// An unticked box sends nothing at all, so the field is simply absent.
		const withoutAgreement = {
			fullName: GOOD_FIELDS.fullName,
			email: GOOD_FIELDS.email,
			password: GOOD_FIELDS.password
		};

		const result = await actions.default(makeFormEvent(withoutAgreement, supabase));

		expect(result).toMatchObject({
			data: { message: { text: 'Please agree to the terms to continue.' } }
		});
		expect(supabase.auth.signUp).not.toHaveBeenCalled();
	});

	it('never shows a raw error from Supabase, and offers to log in instead', async () => {
		const supabase = supabaseThatRefuses('raw supabase text');

		const result = (await actions.default(makeFormEvent(GOOD_FIELDS, supabase))) as {
			data: { message: { text: string; isSuccess: boolean }; offersLogIn: boolean };
		};

		expect(result.data.message).toEqual({
			text: 'We could not create an account with this address.',
			isSuccess: false
		});
		expect(result.data.offersLogIn).toBe(true);
	});

	it('says the same thing whether or not the address already has an account', async () => {
		const taken = supabaseThatRefuses('User already registered');
		const otherwise = supabaseThatRefuses('Signups not allowed for this instance');

		const takenResult = await actions.default(makeFormEvent(GOOD_FIELDS, taken));
		const otherResult = await actions.default(makeFormEvent(GOOD_FIELDS, otherwise));

		expect(takenResult).toEqual(otherResult);
	});

	it('does not offer to log in when the form itself was filled in wrongly', async () => {
		const event = makeFormEvent({ ...GOOD_FIELDS, password: 'short' }, supabaseThatSignsUp());

		const result = await actions.default(event);

		expect(result).toMatchObject({ data: { offersLogIn: false } });
	});

	it('keeps the name and the address so the form can be filled back in', async () => {
		const event = makeFormEvent({ ...GOOD_FIELDS, password: 'short' }, supabaseThatSignsUp());

		const result = await actions.default(event);

		expect(result).toMatchObject({
			data: { fullName: 'Daniel Perez', email: 'daniel@example.com' }
		});
	});
});
