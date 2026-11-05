import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createFetchThatWaitsOutTheClock } from './waiting-out-the-clock';

// The clients the database tests are given. They talk to the local Supabase
// started with `pnpm db:start`, using the same publishable key the app uses, so
// every test sees exactly what Row Level Security lets a real visitor or user
// see.
//
// The machinery that waits out a Docker clock corrected backwards is
// `waiting-out-the-clock.ts` beside this file. Only `createSignedInClient` at
// the bottom uses it, and its comment says why the other clients do not.

// Any password that passes the local minimum length. It is never used outside
// the throwaway accounts these tests create.
const TEST_PASSWORD = 'test-password-123';

function readRequiredEnv(name: string): string {
	const value = process.env[name];

	if (!value) {
		throw new Error(
			`${name} is not set. Run "pnpm db:start" and put the local URL and key in client/.env.`
		);
	}

	return value;
}

/** A client with nobody signed in: what a visitor to the site gets. */
export function createVisitorClient(): SupabaseClient {
	const url = readRequiredEnv('PUBLIC_SUPABASE_URL');
	const key = readRequiredEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY');

	// Sessions are kept in memory only, and never refreshed on a timer, so a
	// finished test leaves nothing running behind it.
	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}

/**
 * A client with full access to the local database, which Row Level Security
 * does not limit.
 *
 * It exists for one job: creating the rows a real user is never allowed to
 * create, so that a test can then check who may read or change them. The clear
 * case is `notifications`, where only database triggers insert rows. Never use
 * it to show that something is allowed, because that would prove nothing.
 */
export function createServiceRoleClient(): SupabaseClient {
	const url = readRequiredEnv('PUBLIC_SUPABASE_URL');
	const key = readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}

/**
 * A client that talks to the database as whoever an access token belongs to.
 *
 * `createSignedInClient` below mints its own token and keeps it inside the
 * client it builds, so the database tests never see one. The browser tests
 * cannot do that: the app mints their token and leaves it in a cookie, so
 * `tests/e2e/signed-in-user.ts` reads it out of the browser and hands it here.
 * Row Level Security then treats this client exactly as it treats the app's own
 * server making the same request.
 */
export function createClientForAccessToken(accessToken: string): SupabaseClient {
	const url = readRequiredEnv('PUBLIC_SUPABASE_URL');
	const key = readRequiredEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY');

	return createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
		// Every request carries this header instead of the one the publishable
		// key would have put there, and that header is how PostgREST is told who
		// is asking.
		global: { headers: { Authorization: `Bearer ${accessToken}` } }
	});
}

/**
 * Signs an account in and answers the brand-new access token GoTrue minted for
 * it, stamped with the clock as it is now rather than as it was.
 *
 * It signs in on a throwaway client of its own rather than on the one the test
 * is holding, because that client is built out of a `fetch` that calls this,
 * and a function cannot be handed the client that is built out of it. The token
 * is the same either way: GoTrue mints it against the email and the password,
 * not against the client that asks.
 *
 * What `signInWithPassword` answered is checked rather than thrown away. A
 * sign-in that quietly failed would leave the refused token in place, and the
 * retry in `waiting-out-the-clock.ts` would end up blaming the clock for
 * something the clock had not done.
 */
async function mintAnAccessTokenFor(email: string): Promise<string> {
	const signingIn = createVisitorClient();

	const { data, error } = await signingIn.auth.signInWithPassword({
		email,
		password: TEST_PASSWORD
	});

	if (error || !data.session) {
		throw new Error(
			`Could not sign ${email} in again for a freshly stamped access token: ` +
				`${error?.message ?? 'no session returned'}`
		);
	}

	return data.session.access_token;
}

export type SignedInClient = {
	supabase: SupabaseClient;
	userId: string;
	email: string;
};

/**
 * Signs up a brand-new throwaway account and returns a client signed in as it.
 * Local Supabase has email confirmation switched off, so sign-up signs in at once.
 * The account disappears on the next `pnpm db:reset`.
 *
 * `fullName` travels the way the register form sends it, as `options.data`,
 * which Supabase stores on the account as `raw_user_meta_data`. The
 * `handle_new_user` trigger copies it from there into `profiles.full_name`.
 *
 * Every request the client makes goes through
 * `createFetchThatWaitsOutTheClock`, so a test never has to think about the
 * clock refusal that `waiting-out-the-clock.ts` waits out — not on its first
 * query and not on its last. The other two clients above are not guarded and do
 * not need to be: neither sends a token, and an opaque `sb_publishable_…` or
 * `sb_secret_…` key has no issued-at stamp for PostgREST to weigh against its
 * clock.
 */
export async function createSignedInClient(fullName = 'Test Person'): Promise<SignedInClient> {
	const url = readRequiredEnv('PUBLIC_SUPABASE_URL');
	const key = readRequiredEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY');
	const email = `test-${crypto.randomUUID()}@example.com`;

	const supabase = createClient(url, key, {
		// Sessions are kept in memory only, and never refreshed on a timer, so a
		// finished test leaves nothing running behind it.
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch: createFetchThatWaitsOutTheClock(() => mintAnAccessTokenFor(email)) }
	});

	const { data, error } = await supabase.auth.signUp({
		email,
		password: TEST_PASSWORD,
		options: { data: { full_name: fullName } }
	});

	if (error || !data.user || !data.session) {
		throw new Error(`Could not sign up a test user: ${error?.message ?? 'no session returned'}`);
	}

	return { supabase, userId: data.user.id, email };
}
