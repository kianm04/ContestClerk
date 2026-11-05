/**
 * Listening to a paper's comment threads as they change
 * (`docs/committee-papers.md`, section 4), so that another writer's comment,
 * reply, resolve or delete reaches the margin while the page is open.
 *
 * It works the way `./committee-room-live.ts` does: one channel hears the
 * thread tables and calls `onChange`, and the page answers by reading its
 * threads again with `invalidate`, Row Level Security checking every one.
 * The words of the paper travel on a channel of their own
 * (`./paper-live-channel.ts`).
 *
 * A deleted row is the awkward one. Postgres tells Realtime only the id of a
 * deleted row, so a filter on any other column can never match it. The
 * channel therefore hears every deleted thread and comment, and passes on
 * only those whose id the page shows.
 *
 * This file runs in the browser. It is not under `$lib/server`, because the
 * connection is the reader's own.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { LiveStatus } from './committee-room-live';
import type { PaperCommentTarget } from './paper-comments';
import { giveRealtimeTheToken } from './realtime-auth';

/** The most values Realtime takes in one `in` filter. */
const MOST_IDS_PER_FILTER = 100;

/** The changes heard through a filter; deletes are heard apart, see above. */
const FILTERED_EVENTS = ['INSERT', 'UPDATE'] as const;

/**
 * The name the paper page's `load` registers with `depends`, and that
 * `invalidate` is called with when a thread on the paper changes.
 */
export function paperThreadsDependency(paper: PaperCommentTarget): `paper-threads:${string}` {
	return `paper-threads:${paper.kind === 'committee' ? paper.paperId : paper.seatId}`;
}

/** What the channel listens to: the paper, and the threads and comments the page shows. */
export type ThreadsWatch = {
	paper: PaperCommentTarget;
	threadIds: string[];
	commentIds: string[];
};

/**
 * The filters on `paper_comments` for the threads a page shows,
 * `thread_id=in.(a,b,…)`, a hundred threads to a filter. No threads, no filters.
 */
export function threadIdFilters(threadIds: string[]): string[] {
	const filters: string[] = [];

	for (let start = 0; start < threadIds.length; start += MOST_IDS_PER_FILTER) {
		const someIds = threadIds.slice(start, start + MOST_IDS_PER_FILTER);
		filters.push(`thread_id=in.(${someIds.join(',')})`);
	}

	return filters;
}

/** Counts the channels opened, so that each gets a name of its own (as in `./committee-room-live.ts`). */
let openedChannelCount = 0;

/** The channels `closePaperThreads` has closed, which must never join if they are still waiting to. */
const closedChannels = new WeakSet<RealtimeChannel>();

/**
 * Open one channel for a paper's threads and call `onChange` when one is
 * started, answered, edited, resolved, reopened or deleted. `onStatus` hears
 * whether the channel is live. Hand the channel back to `closePaperThreads`
 * when the page no longer needs it.
 */
export function subscribeToPaperThreads(
	supabase: SupabaseClient,
	watch: ThreadsWatch,
	onChange: () => void,
	onStatus: (status: LiveStatus) => void
): RealtimeChannel {
	openedChannelCount += 1;

	const paperFilter =
		watch.paper.kind === 'committee'
			? `committee_paper_id=eq.${watch.paper.paperId}`
			: `position_paper_seat_id=eq.${watch.paper.seatId}`;
	const channel = supabase.channel(`${paperThreadsDependency(watch.paper)}:${openedChannelCount}`);

	for (const event of FILTERED_EVENTS) {
		channel.on(
			'postgres_changes',
			{ event, schema: 'public', table: 'paper_comment_threads', filter: paperFilter },
			onChange
		);

		for (const filter of threadIdFilters(watch.threadIds)) {
			channel.on(
				'postgres_changes',
				{ event, schema: 'public', table: 'paper_comments', filter },
				onChange
			);
		}
	}

	const shownIds = new Set([...watch.threadIds, ...watch.commentIds]);

	for (const table of ['paper_comment_threads', 'paper_comments']) {
		channel.on<{ id: string }>(
			'postgres_changes',
			{ event: 'DELETE', schema: 'public', table },
			(payload) => {
				if (payload.old.id !== undefined && shownIds.has(payload.old.id)) onChange();
			}
		);
	}

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

/** Close a channel `subscribeToPaperThreads` opened. */
export function closePaperThreads(supabase: SupabaseClient, channel: RealtimeChannel): void {
	closedChannels.add(channel);

	// The answer only says whether the server heard the goodbye; there is nothing to do either way.
	void supabase.removeChannel(channel);
}
