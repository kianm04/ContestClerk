/**
 * The one database refusal the app has something particular to say about.
 *
 * Everything else PostgREST refuses is a fault in our own code or in our own
 * data, and `handleError` in `src/hooks.server.ts` and in `src/hooks.client.ts`
 * logs it the way it logs any other error nobody planned for. This one is not ours at all: it is the clock
 * of the machine the database is running on, and a reader who is not told so
 * spends an afternoon looking for a bug that was never there.
 *
 * Nothing here imports Supabase. These are plain checks over an error that has
 * already been thrown, so they can be read and tested without a database, the
 * way the rest of `src/lib` can.
 */

/**
 * PostgREST's code for "JWT issued at future". It refuses an access token whose
 * issued-at stamp is more than thirty seconds ahead of its own clock, and it
 * does so before running anything, so the request simply never happens.
 *
 * `client/tests/db/waiting-out-the-clock.ts` names the same code for its own
 * half of this problem: the test harness waits the refusal out, and the app
 * cannot import from `tests/`, so the two say it separately.
 */
export const JWT_ISSUED_AT_FUTURE_CODE = 'PGRST303';

/** The sentence PostgREST sends alongside that code. */
const JWT_ISSUED_AT_FUTURE_MESSAGE = 'JWT issued at future';

/**
 * What the server log, or the browser's console, says when it meets that
 * refusal, so that a failure names the clock instead of arriving as a bare 500
 * with a stack trace in it.
 *
 * It is one long sentence on purpose: whoever reads it is reading a log in the
 * middle of a failing test run, and everything they need to stop looking
 * at their own code has to be on the line in front of them.
 */
export const CLOCK_REFUSAL_EXPLANATION =
	'The database refused this request because the access token it carried was issued in ' +
	`the database's own future (PostgREST ${JWT_ISSUED_AT_FUTURE_CODE}, "${JWT_ISSUED_AT_FUTURE_MESSAGE}"). ` +
	'This is the clock of the machine Supabase is running on rather than a fault in this ' +
	'code: the auth service stamps an access token with the second it minted it, PostgREST ' +
	'refuses a stamp more than thirty seconds ahead of its own clock, and a Docker virtual ' +
	"machine's clock is corrected against the host's from time to time, which leaves a " +
	'brand-new token looking as though it came from the future. Restart Docker, then run ' +
	'"pnpm db:start", and try again. See specs/02-architecture/testing.md.';

/** True when a piece of text carries either the code of that refusal or its sentence. */
function namesTheRefusal(text: string): boolean {
	return text.includes(JWT_ISSUED_AT_FUTURE_CODE) || text.includes(JWT_ISSUED_AT_FUTURE_MESSAGE);
}

/**
 * Whether an error that reached either `handleError` hook is the database
 * refusing this request's access token for having been issued in its own future.
 *
 * The thrown value is `unknown` because that is all SvelteKit promises a
 * `handleError` hook, so this looks for the refusal in each of the shapes it
 * really arrives in rather than trusting one.
 */
export function isAccessTokenFromTheFuture(thrown: unknown): boolean {
	if (typeof thrown === 'string') {
		return namesTheRefusal(thrown);
	}

	if (typeof thrown !== 'object' || thrown === null) {
		return false;
	}

	// A `PostgrestError` that escaped as it stands still carries the code, which
	// is the one shape that says so without any guessing.
	const refusal = thrown as { code?: unknown; message?: unknown };

	if (refusal.code === JWT_ISSUED_AT_FUTURE_CODE) {
		return true;
	}

	// Every module under `$lib/server` re-throws a refused query as
	// `Could not read …: ${error.message}`, which keeps PostgREST's sentence and
	// drops its code, so the sentence has to be recognised as well as the code.
	return typeof refusal.message === 'string' && namesTheRefusal(refusal.message);
}
