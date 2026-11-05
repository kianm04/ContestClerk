import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createFetchThatWaitsOutTheClock,
	retryWhileTheTokenIsFromTheFuture,
	takeTheReasonTheWaitFailed,
	throwIfTheWaitFailed
} from './waiting-out-the-clock';

// `retryWhileTheTokenIsFromTheFuture` and the `fetch` built on it are the two
// pieces of this harness with a decision in them, and the thing they wait for —
// the Docker clock being corrected backwards — cannot be arranged on demand. So
// both are driven here by stand-ins: callbacks that answer with the PostgREST
// error codes a real run would see, and a `fetch` that answers with the
// responses PostgREST would really send.
//
// Nothing in this file reaches the database, which is why its name ends in
// `.harness.test.ts`: that is what puts it in the "harness" Vitest project and
// so under `pnpm test`, which needs nothing started. `supabase-test-client.test.ts`
// beside it holds the two helpers that can only be checked against the real
// local stack. See specs/02-architecture/testing.md.

// Three retries, none of which really waits, so these tests take no time. The
// real delays are in waiting-out-the-clock.ts.
const NO_WAITING = [0, 0, 0];

/** PostgREST's code for "JWT issued at future", the one refusal that is waited out. */
const FROM_THE_FUTURE = 'PGRST303';

/** PostgREST's code for "no rows returned", which says nothing about the clock. */
const NO_ROWS = 'PGRST116';

// A wait that fails is remembered in the module rather than thrown, so a test
// that left one behind would otherwise be reported against whichever test ran
// next. Each test here starts with nothing remembered.
beforeEach(() => {
	takeTheReasonTheWaitFailed();
});

describe('retryWhileTheTokenIsFromTheFuture', () => {
	it('asks PostgREST once when it accepts the token', async () => {
		const askPostgrest = vi.fn<() => Promise<string | null>>(async () => null);
		const mintANewAccessToken = vi.fn<() => Promise<void>>(async () => {});

		await retryWhileTheTokenIsFromTheFuture(askPostgrest, mintANewAccessToken, NO_WAITING);

		expect(askPostgrest).toHaveBeenCalledTimes(1);
		expect(mintANewAccessToken).not.toHaveBeenCalled();
	});

	it('asks again with a fresh token while the token is refused for the clock', async () => {
		const askPostgrest = vi.fn<() => Promise<string | null>>(async () => null);
		askPostgrest.mockResolvedValueOnce(FROM_THE_FUTURE).mockResolvedValueOnce(FROM_THE_FUTURE);
		const mintANewAccessToken = vi.fn<() => Promise<void>>(async () => {});

		await retryWhileTheTokenIsFromTheFuture(askPostgrest, mintANewAccessToken, NO_WAITING);

		expect(askPostgrest).toHaveBeenCalledTimes(3);
		expect(mintANewAccessToken).toHaveBeenCalledTimes(2);
	});

	it('leaves every other refusal to the caller', async () => {
		const askPostgrest = vi.fn<() => Promise<string | null>>(async () => NO_ROWS);
		const mintANewAccessToken = vi.fn<() => Promise<void>>(async () => {});

		await retryWhileTheTokenIsFromTheFuture(askPostgrest, mintANewAccessToken, NO_WAITING);

		expect(askPostgrest).toHaveBeenCalledTimes(1);
		expect(mintANewAccessToken).not.toHaveBeenCalled();
	});

	it('lets a failed sign-in say what went wrong instead of blaming the clock', async () => {
		const askPostgrest = vi.fn<() => Promise<string | null>>(async () => FROM_THE_FUTURE);
		const mintANewAccessToken = vi.fn<() => Promise<void>>(async () => {
			throw new Error('Invalid login credentials');
		});

		// The clock is only the right thing to blame once a fresh token has
		// really been minted and refused as well. When minting one is what
		// failed, that is what somebody reading the run needs to be told.
		await expect(
			retryWhileTheTokenIsFromTheFuture(askPostgrest, mintANewAccessToken, NO_WAITING)
		).rejects.toThrow('Invalid login credentials');
	});

	it('gives up with a message naming the clock when every retry is refused', async () => {
		const askPostgrest = vi.fn<() => Promise<string | null>>(async () => FROM_THE_FUTURE);
		const mintANewAccessToken = vi.fn<() => Promise<void>>(async () => {});

		await expect(
			retryWhileTheTokenIsFromTheFuture(askPostgrest, mintANewAccessToken, NO_WAITING)
		).rejects.toThrow('JWT issued at future');

		expect(askPostgrest).toHaveBeenCalledTimes(NO_WAITING.length + 1);
		expect(mintANewAccessToken).toHaveBeenCalledTimes(NO_WAITING.length);
	});
});

// `createFetchThatWaitsOutTheClock` is driven by stand-in answers for the same
// reason the loop above is: a Docker clock corrected backwards cannot be
// arranged on demand. These build the answers PostgREST really sends — the
// refusal is a 401 whose JSON body carries the code — and a `fetch` that hands
// them over in order.

/** The refusal PostgREST sends when a token's stamp is ahead of its clock. */
function refusedForTheClock(): Response {
	return Response.json({ code: FROM_THE_FUTURE, message: 'JWT issued at future' }, { status: 401 });
}

/** A refusal that has nothing to do with the clock, so nothing waits it out. */
function refusedForAnotherReason(): Response {
	return Response.json({ code: NO_ROWS, message: 'no rows returned' }, { status: 406 });
}

/** The answer to a request that went through. */
function accepted(): Response {
	return Response.json([{ id: 'a-row' }], { status: 200 });
}

/**
 * A stand-in `fetch` that answers with each of these in turn, and with the last
 * one for ever after. A `Response` is used up by being read, so each answer is
 * built fresh by its own function rather than shared.
 */
function fetchThatAnswers(...answers: (() => Response)[]): typeof fetch {
	let callsSoFar = 0;

	return vi.fn<typeof fetch>(async () => {
		const answer = answers[Math.min(callsSoFar, answers.length - 1)];
		callsSoFar += 1;

		return answer();
	});
}

/** The `Authorization` header a given call to the stand-in `fetch` carried. */
function authorizationOfCall(underlyingFetch: typeof fetch, callNumber: number): string | null {
	const calls = vi.mocked(underlyingFetch).mock.calls;

	return new Headers(calls[callNumber][1]?.headers).get('Authorization');
}

describe('createFetchThatWaitsOutTheClock', () => {
	it('hands an accepted answer straight back', async () => {
		const underlyingFetch = fetchThatAnswers(accepted);
		const mintANewAccessToken = vi.fn<() => Promise<string>>(async () => 'fresh-token');

		const waitingFetch = createFetchThatWaitsOutTheClock(
			mintANewAccessToken,
			underlyingFetch,
			NO_WAITING
		);
		const response = await waitingFetch('http://example.test/rest/v1/profiles');

		expect(response.status).toBe(200);
		expect(underlyingFetch).toHaveBeenCalledTimes(1);
		expect(mintANewAccessToken).not.toHaveBeenCalled();
		expect(takeTheReasonTheWaitFailed()).toBeNull();
	});

	it('asks again with a freshly minted token when the clock refuses the old one', async () => {
		const underlyingFetch = fetchThatAnswers(refusedForTheClock, accepted);
		const mintANewAccessToken = vi.fn<() => Promise<string>>(async () => 'fresh-token');

		const waitingFetch = createFetchThatWaitsOutTheClock(
			mintANewAccessToken,
			underlyingFetch,
			NO_WAITING
		);
		const response = await waitingFetch('http://example.test/rest/v1/profiles', {
			headers: { Authorization: 'Bearer stale-token', apikey: 'the-publishable-key' }
		});

		expect(response.status).toBe(200);
		expect(mintANewAccessToken).toHaveBeenCalledTimes(1);
		expect(authorizationOfCall(underlyingFetch, 0)).toBe('Bearer stale-token');
		expect(authorizationOfCall(underlyingFetch, 1)).toBe('Bearer fresh-token');
	});

	it('keeps the fresh token for every request after the one that met the refusal', async () => {
		const underlyingFetch = fetchThatAnswers(refusedForTheClock, accepted);
		const mintANewAccessToken = vi.fn<() => Promise<string>>(async () => 'fresh-token');

		const waitingFetch = createFetchThatWaitsOutTheClock(
			mintANewAccessToken,
			underlyingFetch,
			NO_WAITING
		);
		await waitingFetch('http://example.test/rest/v1/profiles', {
			headers: { Authorization: 'Bearer stale-token' }
		});
		await waitingFetch('http://example.test/rest/v1/conferences', {
			headers: { Authorization: 'Bearer stale-token' }
		});

		// A correction refuses everything the old token is sent with, so the
		// second request must not go back to it and pay for another sign-in.
		expect(mintANewAccessToken).toHaveBeenCalledTimes(1);
		expect(authorizationOfCall(underlyingFetch, 2)).toBe('Bearer fresh-token');
	});

	it('leaves every other refusal alone, with its body still to be read', async () => {
		const underlyingFetch = fetchThatAnswers(refusedForAnotherReason);
		const mintANewAccessToken = vi.fn<() => Promise<string>>(async () => 'fresh-token');

		const waitingFetch = createFetchThatWaitsOutTheClock(
			mintANewAccessToken,
			underlyingFetch,
			NO_WAITING
		);
		const response = await waitingFetch('http://example.test/rest/v1/profiles');

		expect(underlyingFetch).toHaveBeenCalledTimes(1);
		expect(mintANewAccessToken).not.toHaveBeenCalled();
		// Reading the code out of a refusal must not use the answer up: the
		// Supabase client reads the very same body straight afterwards.
		expect(await response.json()).toEqual({ code: NO_ROWS, message: 'no rows returned' });
		expect(takeTheReasonTheWaitFailed()).toBeNull();
	});

	it('hands the refusal back rather than throwing when every retry is refused', async () => {
		const underlyingFetch = fetchThatAnswers(refusedForTheClock);
		const mintANewAccessToken = vi.fn<() => Promise<string>>(async () => 'fresh-token');

		const waitingFetch = createFetchThatWaitsOutTheClock(
			mintANewAccessToken,
			underlyingFetch,
			NO_WAITING
		);
		const response = await waitingFetch('http://example.test/rest/v1/profiles');

		// Throwing here would be swallowed: @supabase/postgrest-js catches
		// anything a client's `fetch` throws and hands the test a returned
		// error instead, which `expect(error).not.toBeNull()` cannot tell from
		// an ordinary refusal. So the refused answer is handed back untouched…
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			code: FROM_THE_FUTURE,
			message: 'JWT issued at future'
		});
		expect(mintANewAccessToken).toHaveBeenCalledTimes(NO_WAITING.length);
	});

	it('records that it gave up, with a message naming the clock', async () => {
		const underlyingFetch = fetchThatAnswers(refusedForTheClock);
		const mintANewAccessToken = vi.fn<() => Promise<string>>(async () => 'fresh-token');

		const waitingFetch = createFetchThatWaitsOutTheClock(
			mintANewAccessToken,
			underlyingFetch,
			NO_WAITING
		);
		await waitingFetch('http://example.test/rest/v1/profiles');

		// …and this is the record that makes it loud. The "db" project runs
		// `throwIfTheWaitFailed` after every test, so the test that met the
		// refusal fails with this message.
		expect(takeTheReasonTheWaitFailed()).toContain('JWT issued at future');
	});

	it('records a failed sign-in instead of blaming the clock for it', async () => {
		const underlyingFetch = fetchThatAnswers(refusedForTheClock);
		const mintANewAccessToken = vi.fn<() => Promise<string>>(async () => {
			throw new Error('Invalid login credentials');
		});

		const waitingFetch = createFetchThatWaitsOutTheClock(
			mintANewAccessToken,
			underlyingFetch,
			NO_WAITING
		);
		const response = await waitingFetch('http://example.test/rest/v1/profiles');

		expect(response.status).toBe(401);
		expect(takeTheReasonTheWaitFailed()).toBe('Invalid login credentials');
	});

	it('lets a request that was never answered at all throw as it always did', async () => {
		const underlyingFetch = vi.fn<typeof fetch>(async () => {
			throw new Error('fetch failed');
		});
		const mintANewAccessToken = vi.fn<() => Promise<string>>(async () => 'fresh-token');

		const waitingFetch = createFetchThatWaitsOutTheClock(
			mintANewAccessToken,
			underlyingFetch,
			NO_WAITING
		);

		// A stack that is down is not the clock, and there is no answer to hand
		// back, so this one is left to the Supabase client to report.
		await expect(waitingFetch('http://example.test/rest/v1/profiles')).rejects.toThrow(
			'fetch failed'
		);
		expect(takeTheReasonTheWaitFailed()).toBeNull();
	});
});

describe('takeTheReasonTheWaitFailed', () => {
	it('answers null when no wait has failed', () => {
		expect(takeTheReasonTheWaitFailed()).toBeNull();
	});

	it('answers with the reason the last wait failed, and clears it as it reads it', async () => {
		const waitingFetch = createFetchThatWaitsOutTheClock(
			async () => 'fresh-token',
			fetchThatAnswers(refusedForTheClock),
			NO_WAITING
		);
		await waitingFetch('http://example.test/rest/v1/profiles');

		expect(takeTheReasonTheWaitFailed()).toContain('JWT issued at future');
		// Reading it cleared it, so the next test starts with nothing recorded.
		expect(takeTheReasonTheWaitFailed()).toBeNull();
	});
});

describe('throwIfTheWaitFailed', () => {
	it('does nothing when every request was really answered', () => {
		expect(() => throwIfTheWaitFailed()).not.toThrow();
	});

	it('throws what the last failed wait recorded, and only once', async () => {
		const waitingFetch = createFetchThatWaitsOutTheClock(
			async () => 'fresh-token',
			fetchThatAnswers(refusedForTheClock),
			NO_WAITING
		);
		await waitingFetch('http://example.test/rest/v1/profiles');

		expect(() => throwIfTheWaitFailed()).toThrow('JWT issued at future');
		// Cleared as it is thrown, so one failed wait fails one test rather
		// than every test after it.
		expect(() => throwIfTheWaitFailed()).not.toThrow();
	});
});
