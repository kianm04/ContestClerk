import { describe, expect, it } from 'vitest';
import { readAccessTokenFromCookies, type BrowserCookie } from './browser-session';

// `readAccessTokenFromCookies` takes plain values and answers a plain string,
// so it can be checked without a browser at all. That matters for three of the
// cases below, which a real browser cannot be made to produce: a session too
// big for one cookie, which the local stack's sessions never are; a session
// cookie with no access token in it; and no session cookie at all where one was
// expected. The name of this file ends in `.harness.test.ts`, which puts it in
// the "harness" Vitest project and so under `pnpm test`.
//
// `signing-in.spec.ts` still checks the one case that is worth a real browser:
// that a browser which really has signed in leaves a cookie this reader can
// read. See specs/02-architecture/testing.md.

/** The name `@supabase/ssr` gives the session cookie against the local stack. */
const SESSION_COOKIE_NAME = 'sb-127-auth-token';

/**
 * A session the way the app stores it: the letters `base64-` and then the JSON
 * encoded as base64url. The reader is given the value in exactly this shape by
 * Playwright, so the tests build it rather than writing a fixed string nobody
 * could check by eye.
 */
function storedSession(session: object): string {
	const asJson = JSON.stringify(session);

	return `base64-${Buffer.from(asJson, 'utf8').toString('base64url')}`;
}

describe('readAccessTokenFromCookies', () => {
	it('reads the token out of a session small enough for one cookie', () => {
		const cookies: BrowserCookie[] = [
			{ name: SESSION_COOKIE_NAME, value: storedSession({ access_token: 'the-token' }) }
		];

		expect(readAccessTokenFromCookies(cookies)).toBe('the-token');
	});

	it('reads a session that was stored without being encoded', () => {
		// The `base64-` in front is what says the value was encoded, so a value
		// without it is read as the JSON it already is.
		const cookies: BrowserCookie[] = [
			{ name: SESSION_COOKIE_NAME, value: JSON.stringify({ access_token: 'the-token' }) }
		];

		expect(readAccessTokenFromCookies(cookies)).toBe('the-token');
	});

	it('puts a session split across two cookies back together', () => {
		const whole = storedSession({ access_token: 'a-token-from-a-long-session' });
		const half = Math.ceil(whole.length / 2);

		// Handed over in the wrong order on purpose. Playwright answers with the
		// cookies in whatever order the browser holds them, so the number at the
		// end of the name is the only thing that says which piece came first.
		const cookies: BrowserCookie[] = [
			{ name: `${SESSION_COOKIE_NAME}.1`, value: whole.slice(half) },
			{ name: `${SESSION_COOKIE_NAME}.0`, value: whole.slice(0, half) }
		];

		expect(readAccessTokenFromCookies(cookies)).toBe('a-token-from-a-long-session');
	});

	it('ignores every cookie that is not the session', () => {
		const cookies: BrowserCookie[] = [
			{ name: 'flash', value: 'a-toast-the-next-page-will-show' },
			{ name: SESSION_COOKIE_NAME, value: storedSession({ access_token: 'the-token' }) }
		];

		expect(readAccessTokenFromCookies(cookies)).toBe('the-token');
	});

	it('throws when the browser holds no session cookie', () => {
		// Answering an empty string instead would let the caller go on to ask the
		// database as a visitor and read the refusal that came back as an
		// ordinary, uninteresting answer.
		expect(() => readAccessTokenFromCookies([])).toThrow('no Supabase session cookie');
	});

	it('throws when the session cookie carries no access token', () => {
		const cookies: BrowserCookie[] = [
			{ name: SESSION_COOKIE_NAME, value: storedSession({ token_type: 'bearer' }) }
		];

		expect(() => readAccessTokenFromCookies(cookies)).toThrow('holds no access token');
	});
});
