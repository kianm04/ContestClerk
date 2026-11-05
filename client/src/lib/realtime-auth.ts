/**
 * Handing Realtime the signed-in reader's token before a channel joins.
 *
 * A channel sends the reader's access token with its "join" message, and
 * Realtime uses it to decide what the reader may hear. Supabase's client asks
 * for the token by itself when it connects, but if the token turns up after
 * the join has gone out and before the server has answered it, the client
 * never sends it on. The channel then listens as a visitor, who may not read
 * the room's tables at all (20261022142000), so Realtime quietly refuses it
 * and nothing arrives. Row Level Security alone would not have been enough:
 * it applies to the inserts and updates Realtime sends, but a delete carries
 * only the row's key and reaches every subscriber whose role may read the
 * table, which is why the room's tables are closed to visitors. Safari
 * (WebKit) connects fast enough to lose that race nearly every time (T151).
 * Waiting here before `subscribe` means the join always carries the token.
 *
 * This file runs in the browser, like the channels that use it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Resolve once Realtime holds the signed-in reader's token. It never rejects. */
export async function giveRealtimeTheToken(supabase: SupabaseClient): Promise<void> {
	try {
		// With no argument, `setAuth` asks the client's own sign-in for the token.
		await supabase.realtime.setAuth();
	} catch {
		// Nothing better can be done here: the channel joins as a visitor, as it
		// would have without this wait, and the page shows what it loaded.
	}
}
