// Reading the session the app left in the browser.
//
// The app keeps a signed-in visitor's Supabase session in a cookie the page's
// own JavaScript cannot touch, and its server sends the access token from that
// cookie to the database on every request it makes. A browser test that wants
// to check the session itself — rather than whatever page it happens to be on —
// has to read that cookie the same way the server does.
//
// `signed-in-user.ts` is the only caller. See `specs/02-architecture/testing.md`
// for why it checks the session at all.

/**
 * The cookie the app keeps its session in: `sb-<project ref>-auth-token`, where
 * the project ref comes from the Supabase address and is `127` for the local
 * stack. A session too big for one cookie is split across `…-auth-token.0`,
 * `…-auth-token.1` and so on, which is why the number at the end is optional.
 */
const SESSION_COOKIE_PATTERN = /^sb-.+-auth-token(\.\d+)?$/;

/** What `@supabase/ssr` writes in front of a session it stored as base64. */
const BASE64_PREFIX = 'base64-';

/** One cookie, in the shape Playwright's `context.cookies()` hands them over. */
export type BrowserCookie = {
	name: string;
	value: string;
};

/**
 * The number at the end of a split session cookie, and 0 for one that is not
 * split, so that the pieces can be put back in the order they were written.
 */
function chunkNumber(cookieName: string): number {
	const lastPiece = cookieName.split('.').pop() ?? '';
	const asNumber = Number(lastPiece);

	return Number.isInteger(asNumber) ? asNumber : 0;
}

/**
 * The access token out of the browser's Supabase session cookie: the very same
 * string the app's server puts in its `Authorization` header when it asks the
 * database for anything.
 *
 * It throws rather than answering an empty string when there is no session,
 * because a caller that silently got nothing back would go on to make a request
 * as a visitor and read that as a pass.
 */
export function readAccessTokenFromCookies(cookies: readonly BrowserCookie[]): string {
	const pieces = cookies
		.filter((cookie) => SESSION_COOKIE_PATTERN.test(cookie.name))
		.sort((first, second) => chunkNumber(first.name) - chunkNumber(second.name));

	if (pieces.length === 0) {
		throw new Error(
			'The browser holds no Supabase session cookie, so there is no access token to read. ' +
				'Sign somebody in first.'
		);
	}

	const stored = pieces.map((cookie) => cookie.value).join('');
	const asJson = stored.startsWith(BASE64_PREFIX)
		? Buffer.from(stored.slice(BASE64_PREFIX.length), 'base64url').toString('utf8')
		: stored;
	const session: { access_token?: string } = JSON.parse(asJson);

	if (!session.access_token) {
		throw new Error('The browser session cookie holds no access token.');
	}

	return session.access_token;
}
