import { describe, expect, it } from 'vitest';
import { createClientForAccessToken, createSignedInClient } from './supabase-test-client';

// The two helpers here that can only be checked against a real database: each
// hands a client back, and the question is whether PostgREST answers it as the
// account it is meant to be. Everything in this file therefore needs
// `pnpm db:start`, which is what the "db" Vitest project is for.
//
// The pieces that decide something on their own —
// `retryWhileTheTokenIsFromTheFuture` and `createFetchThatWaitsOutTheClock`,
// which live in `waiting-out-the-clock.ts` — are driven by stand-ins in
// `waiting-out-the-clock.harness.test.ts`, which needs nothing started.
// See specs/02-architecture/testing.md.

describe('createSignedInClient', () => {
	// This proves the helper still hands back a working client. What proves the
	// waiting is the stand-in-driven tests in `waiting-out-the-clock.harness.test.ts`,
	// because a healthy clock refuses nothing and there is nothing here for a
	// retry to catch.
	it('hands back a client the database answers as that account', async () => {
		const { supabase, userId } = await createSignedInClient();

		const { data, error } = await supabase.from('profiles').select('id').eq('id', userId).single();

		expect(error).toBeNull();
		expect(data?.id).toBe(userId);
	});
});

describe('createClientForAccessToken', () => {
	it('talks to the database as whoever the token belongs to', async () => {
		const { supabase, userId } = await createSignedInClient();
		const { data: whatIsSignedIn } = await supabase.auth.getSession();
		const accessToken = whatIsSignedIn.session?.access_token ?? '';

		const asThatAccount = createClientForAccessToken(accessToken);
		const { data, error } = await asThatAccount
			.from('profiles')
			.select('id')
			.eq('id', userId)
			.single();

		expect(error).toBeNull();
		expect(data?.id).toBe(userId);
	});

	it('is refused when the token is not one this database signed', async () => {
		const asNobody = createClientForAccessToken('not.a.real.token');

		const { error } = await asNobody.from('profiles').select('id').limit(1);

		// "JWT cryptographic operation failed". It is worth checking, because it
		// is what proves the `Authorization` header above is the one PostgREST
		// reads: a header it ignored would leave this request looking like an
		// ordinary visitor's, which is refused nothing.
		expect(error?.code).toBe('PGRST301');
	});
});
