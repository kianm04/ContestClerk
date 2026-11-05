/**
 * Hearing a committee paper's authors change.
 *
 * `$lib/paper-live-channel.ts` sends the writing on a private channel named
 * after the paper's `live_epoch`, and the epoch moves on whenever the authors
 * change. The page hears that here, on a channel of its own that carries
 * database changes and nothing else. Realtime checks the paper's own read
 * policy for every listener of a database change, so this channel can stay
 * public: nobody who may not read the paper hears it. It lives in its own
 * file because the house rules make every channel private in a file that
 * broadcasts (`scripts/house-rules.mjs`), and this one has nothing to
 * broadcast.
 *
 * This file runs in the browser, like the channel it serves.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

/** The name of the channel that watches one committee paper's row. */
export function paperEpochWatchTopic(paperId: string): string {
	return `committee-paper-epoch:${paperId}`;
}

/**
 * Start listening for changes to one committee paper's row. `onRow` hears
 * each changed row. `onListening` runs every time the watch starts listening,
 * the first time and after a drop, because a change made while it was not
 * listening is never sent again and the caller has to read it instead.
 * Answers the channel, for the caller to remove when the page leaves.
 */
export function watchPaperEpoch(
	supabase: SupabaseClient,
	paperId: string,
	onRow: (row: unknown) => void,
	onListening: () => void
): RealtimeChannel {
	return supabase
		.channel(paperEpochWatchTopic(paperId))
		.on(
			'postgres_changes',
			{
				event: 'UPDATE',
				schema: 'public',
				table: 'committee_papers',
				filter: `id=eq.${paperId}`
			},
			(payload) => onRow(payload.new)
		)
		.subscribe((status) => {
			if (status === 'SUBSCRIBED') onListening();
		});
}
