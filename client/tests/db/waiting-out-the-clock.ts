// Waiting out a Docker clock that has been corrected backwards, which is the
// one failure the database and browser harnesses both have to survive.
//
// GoTrue stamps an access token with the second it was minted, and PostgREST
// refuses a stamp more than thirty seconds ahead of its own clock with "JWT
// issued at future". Both containers read the same Docker clock, so they cannot
// normally disagree by anything like that much; but that clock is corrected
// against the host's from time to time, and a correction backwards leaves a
// token minted just before it looking as though it came from the future.
//
// `supabase-test-client.ts` beside this file gives the database tests their
// clients and builds the signed-in one out of the `fetch` below;
// `../e2e/signed-in-user.ts` calls the loop directly, once, when it hands a
// browser over. See specs/02-architecture/testing.md.

// PostgREST's code for the refusal "JWT issued at future".
//
// `src/lib/database-errors.ts` names the same code as
// `JWT_ISSUED_AT_FUTURE_CODE`, for the app's own half of this problem: the
// harness waits the refusal out, and the app says so in its log when it meets
// it. The two are deliberately separate copies, because application code may
// not import from `tests/`.
const JWT_ISSUED_AT_FUTURE = 'PGRST303';

// How long to wait before asking PostgREST again after that refusal, in
// milliseconds. The length of the list also says how many times we ask again:
// once per delay. Just under eight seconds in total, which leaves room inside
// the twenty seconds the "db" project in vite.config.ts gives a test.
const CLOCK_SKEW_RETRY_DELAYS_MS = [250, 500, 1000, 2000, 4000];

// Why the last wait failed, or an empty string when none has. It is module
// state, which this project otherwise avoids, because the place that finds out
// — one request inside a Supabase client — cannot reach the test that has to be
// told. `fail-when-waiting-out-the-clock-failed.ts` is what reads it, after
// every database test.
//
// Vitest gives each test file its own copy of this module, so one file's
// failure can never be reported against another's test.
let reasonTheWaitFailed = '';

/** Remembers why a wait failed, for the end of whichever test was running. */
function rememberWhyTheWaitFailed(reason: string): void {
	reasonTheWaitFailed = reason;
}

/**
 * Why the last wait failed, or `null` when none has. Reading it clears it.
 *
 * It is cleared as it is read so that one failure is reported against one test.
 * A clock still that far out refuses the next test's requests as well, and that
 * test records its own reason.
 */
export function takeTheReasonTheWaitFailed(): string | null {
	const reason = reasonTheWaitFailed;
	reasonTheWaitFailed = '';

	return reason === '' ? null : reason;
}

/**
 * Throws if a wait failed during the test that has just finished, and does
 * nothing at all otherwise.
 *
 * This is what makes a failed wait loud. `createFetchThatWaitsOutTheClock`
 * cannot throw when it gives up — see its own comment — so a test whose every
 * request was refused would otherwise run to the end and could even pass, and
 * the 77 places in `tests/db/` that assert `expect(error).not.toBeNull()` would
 * pass for the wrong reason.
 */
export function throwIfTheWaitFailed(): void {
	const reason = takeTheReasonTheWaitFailed();

	if (reason !== null) {
		throw new Error(reason);
	}
}

/** Waits for the given number of milliseconds and then carries on. */
function pause(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Asks PostgREST something, and keeps asking while it refuses the access token
 * for having been issued in its own future.
 *
 * `askPostgrest` makes one request and answers with its PostgREST error code,
 * or with `null` when the request went through. Any code other than the clock
 * refusal ends the waiting at once and is left to the caller to deal with:
 * this function waits out the clock and nothing else.
 *
 * `mintANewAccessToken` is called before every retry. It signs in again, so
 * that the next attempt carries a token stamped with the clock as it is now
 * rather than as it was.
 *
 * `delaysMs` is a parameter so that this function's own tests can drive the
 * loop without really waiting. `createFetchThatWaitsOutTheClock` below and
 * `signIn` in `../e2e/signed-in-user.ts` hand on whatever they were given, for
 * their own tests; nothing else passes it.
 *
 * Why asking again is the whole fix. The thirty seconds PostgREST allows a
 * token's stamp — see the top of this file — is not a number we chose: that
 * tolerance is PostgREST's, and it is documented. And the refusal has always
 * cleared on its own, which is why asking again is enough.
 *
 * It throws when it gives up, and whoever calls it decides what that means.
 * `../e2e/signed-in-user.ts` lets the throw end the test, because it calls this
 * from its own code rather than from inside a query. The `fetch` below cannot,
 * and says why.
 */
export async function retryWhileTheTokenIsFromTheFuture(
	askPostgrest: () => Promise<string | null>,
	mintANewAccessToken: () => Promise<void>,
	delaysMs: readonly number[] = CLOCK_SKEW_RETRY_DELAYS_MS
): Promise<void> {
	let errorCode = await askPostgrest();

	for (const delayMs of delaysMs) {
		if (errorCode !== JWT_ISSUED_AT_FUTURE) {
			return;
		}

		await pause(delayMs);
		await mintANewAccessToken();
		errorCode = await askPostgrest();
	}

	if (errorCode !== JWT_ISSUED_AT_FUTURE) {
		return;
	}

	const totalSeconds = delaysMs.reduce((total, delay) => total + delay, 0) / 1000;

	throw new Error(
		`The local Supabase kept refusing a brand-new access token with "JWT issued at future" ` +
			`for ${totalSeconds} seconds. The token is stamped more than thirty seconds ahead of ` +
			`PostgREST's clock, which means the Docker virtual machine's clock has drifted away ` +
			`from this machine's. Restart Docker, then "pnpm db:start", and run the tests again.`
	);
}

/**
 * The PostgREST error code inside a refused answer, or `null` when the request
 * went through or the answer carries no code of its own.
 *
 * The body is read from a copy made with `clone()`, because reading a
 * `Response`'s body is what uses it up, and the Supabase client still has to be
 * able to read the very same answer afterwards.
 */
async function postgrestErrorCodeOf(response: Response): Promise<string | null> {
	if (response.ok) {
		return null;
	}

	try {
		const refusal: { code?: string } = await response.clone().json();

		return refusal.code ?? null;
	} catch {
		// Not JSON, so not one of PostgREST's own refusals, so nothing here to
		// wait out. The caller still gets the answer untouched.
		return null;
	}
}

/**
 * The same request options with a different access token in the `Authorization`
 * header.
 *
 * By the time a client's own `fetch` sees a request, the Supabase library has
 * already put the signed-in account's token in `init.headers`. `new Headers()`
 * copies those headers whatever shape they arrived in, so replacing one of them
 * changes nothing else about the request.
 */
function withAccessToken(init: RequestInit | undefined, accessToken: string): RequestInit {
	const headers = new Headers(init?.headers);
	headers.set('Authorization', `Bearer ${accessToken}`);

	return { ...init, headers };
}

/**
 * The `fetch` a signed-in test client makes all of its requests with: one that
 * asks again with a freshly minted access token while PostgREST refuses the
 * token the request carried for having been issued in its own future.
 *
 * `retryWhileTheTokenIsFromTheFuture` above explains the refusal and does the
 * waiting. This only turns one request into the shape that loop asks for, so
 * that there is still a single account of the refusal in this repository.
 *
 * Guarding every request, rather than one probe after signing up, is what makes
 * a correction that lands half way through a test harmless. GoTrue fixes an
 * access token's stamp at the moment it mints it, so a clock corrected
 * backwards refuses every later request made with that same token as readily as
 * the first, and the client a test is holding has no way of minting itself
 * another.
 *
 * When the waiting fails — the retries run out, or signing in again for a fresh
 * token does not work — this records why and hands the refused answer back,
 * rather than throwing. Throwing would be swallowed: `@supabase/postgrest-js`
 * catches anything a client's `fetch` throws and turns it into a returned
 * `{ error: { message: 'Error: …', code: '', status: 0 } }`, so a test asserting
 * `expect(error).not.toBeNull()` — every "the wrong user is refused" case, 77 of
 * them — would pass on a stack that never really answered it. The recorded
 * reason is read by `throwIfTheWaitFailed` above, which the "db" project runs
 * after every test.
 *
 * `mintANewAccessToken` signs the same account in again and answers the token
 * that comes back. `underlyingFetch` and `delaysMs` are parameters so that this
 * function's own tests can drive it without a database and without waiting;
 * nothing else passes them.
 */
export function createFetchThatWaitsOutTheClock(
	mintANewAccessToken: () => Promise<string>,
	underlyingFetch: typeof fetch = fetch,
	delaysMs: readonly number[] = CLOCK_SKEW_RETRY_DELAYS_MS
): typeof fetch {
	// Empty until the clock refuses a token, and then the newest one minted. It
	// is kept between requests rather than inside one, because a correction
	// refuses everything the old token is sent with and not only the request
	// that happened to meet it first.
	let freshAccessToken = '';

	return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		// The loop below answers with nothing, so each attempt leaves what it
		// got here for the caller to be given afterwards.
		let lastAnswer: Response | undefined;

		try {
			await retryWhileTheTokenIsFromTheFuture(
				async () => {
					const options = freshAccessToken ? withAccessToken(init, freshAccessToken) : init;
					lastAnswer = await underlyingFetch(input, options);

					return await postgrestErrorCodeOf(lastAnswer);
				},
				async () => {
					freshAccessToken = await mintANewAccessToken();
				},
				delaysMs
			);
		} catch (whyTheWaitFailed) {
			if (!lastAnswer) {
				// Nothing was ever answered, so the request itself failed — the
				// stack is down, or the address is wrong. That is not the clock
				// and not ours to report, and the Supabase client turns it into
				// an error of its own that says so.
				throw whyTheWaitFailed;
			}

			rememberWhyTheWaitFailed(
				whyTheWaitFailed instanceof Error ? whyTheWaitFailed.message : String(whyTheWaitFailed)
			);
		}

		if (!lastAnswer) {
			// Unreachable: the loop either throws or makes at least one request.
			throw new Error('The request was never made.');
		}

		return lastAnswer;
	};
}
