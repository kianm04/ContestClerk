import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { giveRealtimeTheToken } from './realtime-auth';

// That a Safari page really hears the room once it waits here is shown by
// `tests/e2e/chair-room.spec.ts` and `tests/e2e/committee-live.spec.ts` run in
// WebKit (`pnpm test:e2e:webkit`).

/** A stand-in client whose Realtime `setAuth` is `setAuth`. */
function clientWith(setAuth: () => Promise<void>): SupabaseClient {
	return { realtime: { setAuth } } as unknown as SupabaseClient;
}

describe('giveRealtimeTheToken', () => {
	it('asks Realtime to fetch the signed-in reader’s token, with no token of its own', async () => {
		const setAuth = vi.fn(async () => {});

		await giveRealtimeTheToken(clientWith(setAuth));

		expect(setAuth).toHaveBeenCalledWith();
	});

	it('settles quietly when the token cannot be fetched, so the channel still joins', async () => {
		const setAuth = vi.fn(async () => {
			throw new Error('offline');
		});

		await expect(giveRealtimeTheToken(clientWith(setAuth))).resolves.toBeUndefined();
	});
});
