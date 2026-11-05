import { describe, expect, it } from 'vitest';
import {
	CLOCK_REFUSAL_EXPLANATION,
	isAccessTokenFromTheFuture,
	JWT_ISSUED_AT_FUTURE_CODE
} from './database-errors';

// The refusal itself cannot be arranged on demand: it needs the clock of the
// machine Supabase runs on to be corrected backwards in the middle of a
// request. So these tests hand the checker the shapes that refusal really
// arrives in, taken from what the local stack answers — a 401 carrying
// `{"code":"PGRST303","details":null,"hint":null,"message":"JWT issued at
// future"}` — and from what the modules under `$lib/server` do with it
// afterwards.

describe('isAccessTokenFromTheFuture', () => {
	it('recognises a PostgREST refusal that escaped as it stands', () => {
		const refusal = {
			code: 'PGRST303',
			details: null,
			hint: null,
			message: 'JWT issued at future'
		};

		expect(isAccessTokenFromTheFuture(refusal)).toBe(true);
	});

	it('recognises it after a $lib/server module has re-thrown it with only its sentence', () => {
		// This is the shape that actually reaches `handleError` today. Every
		// module under `$lib/server` throws `Could not read …: ${error.message}`,
		// which keeps PostgREST's sentence and loses its code.
		const thrown = new Error('Could not read the profile: JWT issued at future');

		expect(isAccessTokenFromTheFuture(thrown)).toBe(true);
	});

	it('recognises an error that names the code instead of the sentence', () => {
		const thrown = new Error('Could not read the applications: PGRST303');

		expect(isAccessTokenFromTheFuture(thrown)).toBe(true);
	});

	it('recognises it in a bare string, because anything at all may be thrown', () => {
		expect(isAccessTokenFromTheFuture('JWT issued at future')).toBe(true);
	});

	it('says no to an ordinary failure', () => {
		expect(isAccessTokenFromTheFuture(new Error('Could not read the profile: fetch failed'))).toBe(
			false
		);
	});

	it('says no to a different PostgREST refusal', () => {
		const outOfRange = {
			code: 'PGRST103',
			message: 'Requested range not satisfiable'
		};

		expect(isAccessTokenFromTheFuture(outOfRange)).toBe(false);
	});

	it('says no to nothing at all, which is what an empty `throw` leaves behind', () => {
		expect(isAccessTokenFromTheFuture(null)).toBe(false);
		expect(isAccessTokenFromTheFuture(undefined)).toBe(false);
	});

	it('says no to an object whose message is not text', () => {
		expect(isAccessTokenFromTheFuture({ message: 303 })).toBe(false);
	});
});

describe('CLOCK_REFUSAL_EXPLANATION', () => {
	it('names the code, so a log line can be searched for it', () => {
		expect(CLOCK_REFUSAL_EXPLANATION).toContain(JWT_ISSUED_AT_FUTURE_CODE);
	});

	it('says what to do rather than only what happened', () => {
		expect(CLOCK_REFUSAL_EXPLANATION).toContain('Restart Docker');
	});
});
