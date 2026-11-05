/**
 * The one Supabase client in the app that Row Level Security does not limit.
 *
 * Files under `$lib/server` only ever run on the server, and SvelteKit refuses
 * to bundle anything that imports `$env/dynamic/private` into the browser, so
 * the key below can never reach a visitor. This is the only application file
 * that reads `SUPABASE_SERVICE_ROLE_KEY`, and `SERVICE_ROLE_CLIENT_USERS` in
 * `scripts/house-rules.mjs` names the one module allowed to call the function
 * below: the sweep in `./orphaned-document-files.ts`, which does a job no
 * signed-in person may do. `pnpm house-rules` checks both.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

/**
 * A client that acts as the service role, bypassing every policy.
 *
 * Throws when the key is not configured. Not every environment has it: the
 * container on the public site is given only the Stripe secrets
 * (`docker-compose.yaml`), so a caller must expect this and say so, as the
 * sweep does. Nothing is kept between requests: the session is never stored or
 * refreshed, because there is no signed-in person to keep.
 */
export function createServiceRoleClient(): SupabaseClient {
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

	if (!serviceRoleKey) {
		throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
	}

	return createClient(PUBLIC_SUPABASE_URL, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}
