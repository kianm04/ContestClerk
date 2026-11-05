import { expect, test } from '@playwright/test';
import { createClientForAccessToken } from '../db/supabase-test-client';
import { readAccessTokenFromCookies } from './browser-session';
import { createTestUser, signIn } from './signed-in-user';

// Named after a rule rather than after a page, the way
// `typing-before-javascript.spec.ts` is. What is checked here is the promise
// `signIn` makes to every other file in this folder: the browser it hands back
// holds a session the database accepts, so a page can be trusted to have failed
// for its own reasons rather than because the clock refused its token. See
// `specs/02-architecture/testing.md`.

test.describe('signing a browser test in', () => {
	test('leaves the browser holding a session the database accepts', async ({ page }) => {
		const user = await createTestUser();

		await signIn(page, user);

		// The token out of the cookie is the one the app's server sends to
		// PostgREST, so asking with it here asks exactly what a page asks.
		const accessToken = readAccessTokenFromCookies(await page.context().cookies());
		const asThatAccount = createClientForAccessToken(accessToken);
		const { data, error } = await asThatAccount
			.from('profiles')
			.select('id')
			.eq('id', user.id)
			.single();

		expect(error).toBeNull();
		expect(data?.id).toBe(user.id);
	});

	test('says so when nobody is signed in', async ({ page }) => {
		await page.goto('/login');

		const cookies = await page.context().cookies();

		// Reading nothing has to be loud. A reader that quietly answered an
		// empty token would send the request as a visitor and read the refusal
		// that came back as an ordinary, uninteresting answer.
		expect(() => readAccessTokenFromCookies(cookies)).toThrow('no Supabase session cookie');
	});
});
