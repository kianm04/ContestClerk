import { describe, expect, it } from 'vitest';
import { load } from './+page.server';
// `./$types` holds the types SvelteKit generates for this one route, so the
// stand-in event below is exactly the shape `load` is given.
import type { PageServerLoadEvent } from './$types';

// This page reads nothing from the database, so there is no Supabase client to
// stand in for. `load` asks one thing only: who is signed in.

/**
 * The one piece of a page visit that `load` actually reads.
 *
 * `claims` is what `getVerifiedClaims` answers: the signed-in account, or
 * `null` for a visitor.
 */
function makeLoadEvent(claims: unknown = null): PageServerLoadEvent {
	return {
		locals: { getVerifiedClaims: async () => claims }
	} as unknown as PageServerLoadEvent;
}

describe('load', () => {
	it('tells the page that a visitor is not signed in', async () => {
		const result = await load(makeLoadEvent());

		// The page sends this person through sign up on their way to `/create`.
		// `toMatchObject` rather than reading a property off `result`, because
		// SvelteKit types what a `load` gives back as "this or nothing".
		expect(result).toMatchObject({ isSignedIn: false });
	});

	it('tells the page that somebody with a session is signed in', async () => {
		const result = await load(makeLoadEvent({ sub: 'user-1', email: 'daniel@example.com' }));

		expect(result).toMatchObject({ isSignedIn: true });
	});
});
