import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClientForAccessToken } from '../db/supabase-test-client';
import type { BrowserCookie } from './browser-session';
import { signIn, type TestUser } from './signed-in-user';

// What `signIn` does after the login form has been submitted: it asks the
// database one question with the token the app just minted, and signs in again
// for a fresh one while PostgREST refuses that token as issued in its own
// future. Arranging the refusal needs the Docker clock corrected backwards
// mid-test, which nothing can ask for, so it is stood in for here — the same
// way `waiting-out-the-clock.harness.test.ts` stands the database half in.
//
// Playwright's `Page` is stood in for as well, because a real browser would
// bring the whole app with it and prove nothing more about this decision. That
// is why the file is named `.harness.test.ts` and runs under `pnpm test`.
// See specs/02-architecture/testing.md.

// Only `createClientForAccessToken` is replaced, and only in that one module.
// `retryWhileTheTokenIsFromTheFuture`, the loop under test here, lives in
// `../db/waiting-out-the-clock` and is not stood in for at all.
vi.mock('../db/supabase-test-client', async (importOriginal) => {
	const real = await importOriginal<typeof import('../db/supabase-test-client')>();

	return { ...real, createClientForAccessToken: vi.fn() };
});

/** PostgREST's code for "JWT issued at future", the one refusal `signIn` waits out. */
const FROM_THE_FUTURE = 'PGRST303';

/** PostgREST's code for "no rows returned", which says nothing about the clock. */
const NO_ROWS = 'PGRST116';

/**
 * Retry delays of nothing, handed to `signIn` so that a test waits out the
 * clock's refusal without really waiting. Three of them, so `signIn` signs in
 * again three times at most before it gives up.
 */
const NO_WAITING = [0, 0, 0];

/** The account being signed in. Nothing here reaches a database, so it is invented. */
const USER: TestUser = {
	id: '00000000-0000-4000-8000-000000000001',
	email: 'harness@example.com',
	fullName: 'Harness Person'
};

/**
 * The session cookie the app leaves in the browser once the login form has been
 * submitted, holding one access token.
 *
 * It is written as plain JSON rather than in the `base64-` shape the real app
 * uses, because what the reader makes of each shape is
 * `browser-session.harness.test.ts`'s business rather than this file's.
 */
function sessionCookie(accessToken: string): BrowserCookie {
	return { name: 'sb-127-auth-token', value: JSON.stringify({ access_token: accessToken }) };
}

/** What a stand-in run of `signIn` recorded about the browser it was given. */
type StandInPageRecord = {
	/** How many times the login form was filled in and submitted. */
	signInCount: number;
	/** How many times the refused session was thrown away. */
	clearCookiesCount: number;
};

/**
 * A stand-in for Playwright's `Page`, holding only what `signIn` really uses:
 * going to `/login`, filling the two fields, pressing the button, waiting for
 * the address to change, and the browser's own cookies.
 *
 * Pressing the button leaves a fresh session cookie behind, the way the app's
 * server does, so every sign-in mints a different token. That is what makes the
 * retry visible from outside: the second question has to carry the second
 * token, not the refused one.
 */
function createStandInPage(): { page: Page; record: StandInPageRecord } {
	const record: StandInPageRecord = { signInCount: 0, clearCookiesCount: 0 };
	let cookies: BrowserCookie[] = [];

	const context = {
		cookies: async () => cookies,
		clearCookies: async () => {
			record.clearCookiesCount += 1;
			cookies = [];
		}
	};

	const page = {
		goto: async () => {},
		getByLabel: () => ({ fill: async () => {} }),
		getByRole: () => ({
			press: async () => {
				record.signInCount += 1;
				cookies = [sessionCookie(`access-token-${record.signInCount}`)];
			}
		}),
		waitForURL: async () => {},
		context: () => context
	};

	// The cast is what lets these five members stand in for Playwright's `Page`,
	// which has hundreds of them. `signIn` reaches for nothing else, and a
	// change that made it reach further would fail these tests rather than pass
	// them quietly.
	return { page: page as unknown as Page, record };
}

/**
 * Answer the questions `signIn` asks the database with these PostgREST error
 * codes in turn — `null` for a question that went through — and collect the
 * access token each of them carried.
 *
 * The last code answers every question after it, so a list of one code means
 * "always this".
 */
function answerEachQueryWith(errorCodes: (string | null)[]): string[] {
	const tokensAsked: string[] = [];

	vi.mocked(createClientForAccessToken).mockImplementation((accessToken: string) => {
		const errorCode = errorCodes[Math.min(tokensAsked.length, errorCodes.length - 1)];
		tokensAsked.push(accessToken);

		// Enough of a Supabase client for the one question `signIn` asks:
		// `.from('profiles').select('id').eq('id', …).single()`.
		return {
			from: () => ({
				select: () => ({
					eq: () => ({
						single: async () => ({ error: errorCode === null ? null : { code: errorCode } })
					})
				})
			})
		} as unknown as SupabaseClient;
	});

	return tokensAsked;
}

describe('signIn', () => {
	beforeEach(() => {
		vi.mocked(createClientForAccessToken).mockReset();
	});

	it('signs in once when the database accepts the session the app minted', async () => {
		const { page, record } = createStandInPage();
		const tokensAsked = answerEachQueryWith([null]);

		await signIn(page, USER, NO_WAITING);

		expect(record.signInCount).toBe(1);
		expect(record.clearCookiesCount).toBe(0);
		expect(tokensAsked).toEqual(['access-token-1']);
	});

	it('signs in again for a fresh token while the clock refuses the old one', async () => {
		const { page, record } = createStandInPage();
		const tokensAsked = answerEachQueryWith([FROM_THE_FUTURE, null]);

		await signIn(page, USER, NO_WAITING);

		// The refused session goes first: `/login` sends a signed-in visitor
		// straight back to `/home`, so the form could not be filled in again
		// while the browser still held it.
		expect(record.clearCookiesCount).toBe(1);
		expect(record.signInCount).toBe(2);
		// The second question has to carry the token the second sign-in minted.
		// Asking again with the refused one would never clear.
		expect(tokensAsked).toEqual(['access-token-1', 'access-token-2']);
	});

	it('leaves a refusal that is not about the clock to the test that meets it', async () => {
		const { page, record } = createStandInPage();
		const tokensAsked = answerEachQueryWith([NO_ROWS]);

		await signIn(page, USER, NO_WAITING);

		// Signing in again would not help, and waiting would only make the real
		// failure arrive eight seconds later.
		expect(record.signInCount).toBe(1);
		expect(tokensAsked).toEqual(['access-token-1']);
	});

	it('gives up once it has signed in again as many times as it was handed delays', async () => {
		const { page, record } = createStandInPage();
		const tokensAsked = answerEachQueryWith([FROM_THE_FUTURE]);

		await expect(signIn(page, USER, NO_WAITING)).rejects.toThrow('JWT issued at future');

		// The first sign-in, and one more for each of the three delays. The
		// delays a real run uses would have meant six sign-ins, eight seconds
		// later, so this also shows that `signIn` hands on the delays it is given.
		expect(record.signInCount).toBe(4);
		expect(tokensAsked).toEqual([
			'access-token-1',
			'access-token-2',
			'access-token-3',
			'access-token-4'
		]);
	});
});
