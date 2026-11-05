// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { JwtPayload, SupabaseClient } from '@supabase/supabase-js';

declare global {
	namespace App {
		// interface Error {}

		// `locals` is data that belongs to one single request. `src/hooks.server.ts`
		// fills it in before anything else runs, and every `load` function, form
		// action and `+server.ts` endpoint on the server can then read it.
		interface Locals {
			/** A Supabase client that reads and writes this visitor's auth cookies. */
			supabase: SupabaseClient;
			/**
			 * What the signed-in visitor's access token says about them, once Supabase
			 * has confirmed the token is genuine, or `null` when nobody is signed in.
			 * `claims.sub` is their user id and `claims.email` their address. See
			 * `src/hooks.server.ts`.
			 */
			getVerifiedClaims: () => Promise<JwtPayload | null>;
		}

		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
