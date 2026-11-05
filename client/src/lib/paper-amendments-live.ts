/**
 * Listening to a draft's amendments as they change (`docs/committee-papers.md`,
 * step 7), so that a sponsor's answer, a seat's support or the dais's ruling
 * reaches the cards while the page is open: the proposer sees the answers
 * arrive.
 *
 * It works the way `./paper-threads-live.ts` does: one channel hears the
 * `amendments` table for the paper and calls `onChange`, and the page
 * answers by reading the amendments again with `invalidate`, Row Level
 * Security checking every one. A sponsor's answer and a seat's support land
 * in `amendment_seats`, which is not published: a realtime delete carries
 * only the row's key and reaches every signed-in subscriber, whatever their
 * policies say (security review L22). Instead each answer touches its
 * amendment's own row (`amendment_seats_touch_amendment`, 20261022142000),
 * so the one listener here hears it.
 *
 * This file runs in the browser. It is not under `$lib/server`, because the
 * connection is the reader's own.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { LiveStatus } from './committee-room-live';
import { giveRealtimeTheToken } from './realtime-auth';

/**
 * The name the draft's `load` registers with `depends`, and that
 * `invalidate` is called with when one of its amendments changes.
 */
export function paperAmendmentsDependency(paperId: string): `paper-amendments:${string}` {
	return `paper-amendments:${paperId}`;
}

/** Counts the channels opened, so that each gets a name of its own. */
let openedChannelCount = 0;

/** The channels `closePaperAmendments` has closed, which must never join if they are still waiting to. */
const closedChannels = new WeakSet<RealtimeChannel>();

/**
 * Open one channel for a draft's amendments and call `onChange` when one is
 * proposed or changes, which a sponsor's answer or a seat's support counts
 * as. `onStatus` hears whether the channel is live. Hand the channel back to
 * `closePaperAmendments` when the page no longer needs it.
 */
export function subscribeToPaperAmendments(
	supabase: SupabaseClient,
	paperId: string,
	onChange: () => void,
	onStatus: (status: LiveStatus) => void
): RealtimeChannel {
	openedChannelCount += 1;

	const channel = supabase.channel(`${paperAmendmentsDependency(paperId)}:${openedChannelCount}`);

	channel.on(
		'postgres_changes',
		{ event: '*', schema: 'public', table: 'amendments', filter: `paper_id=eq.${paperId}` },
		onChange
	);

	// The channel joins once Realtime holds the reader's token, or it would
	// listen as a visitor and hear nothing (`./realtime-auth.ts`).
	void giveRealtimeTheToken(supabase).then(() => {
		if (closedChannels.has(channel)) return;

		channel.subscribe((status) => {
			onStatus(status === 'SUBSCRIBED' ? 'live' : 'paused');
		});
	});

	return channel;
}

/** Close a channel `subscribeToPaperAmendments` opened. */
export function closePaperAmendments(supabase: SupabaseClient, channel: RealtimeChannel): void {
	closedChannels.add(channel);

	// The answer only says whether the server heard the goodbye; there is nothing to do either way.
	void supabase.removeChannel(channel);
}
