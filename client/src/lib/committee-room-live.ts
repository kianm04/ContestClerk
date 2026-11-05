/**
 * Listening to a committee room as it changes.
 *
 * `specs/02-architecture/realtime.md` is the contract. One channel listens to
 * every table of the room, filtered to one committee, and calls `onChange` on
 * any event. The page answers by running `invalidate` on the key below, which
 * makes SvelteKit run `load` again and read everything fresh, with Row Level
 * Security checking it. Nothing here patches the page from what the event
 * says: reading again is a little more traffic and far fewer bugs. It is also
 * why a delete is safe to hear: Realtime checks a reader's select policy on
 * the inserts and updates it sends, but a delete carries only the row's key,
 * so the room's tables are closed to visitors altogether (20261022142000) and
 * a signed-in reader learns nothing from a key they then read again under
 * their own policies.
 *
 * This file runs in the browser. It is not under `$lib/server`, because the
 * connection is the reader's own.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { giveRealtimeTheToken } from './realtime-auth';

/** What the channel is doing: still connecting, delivering events, or cut off. */
export type LiveStatus = 'connecting' | 'live' | 'paused';

/** The seconds between reloads while live updates are paused, from `realtime.md`. */
export const PAUSED_RELOAD_SECONDS = 15;

/**
 * The tables that carry a `committee_id` column, so one filter fits all of
 * them. `vote_entries` has none, so it has a listener of its own below.
 */
const COMMITTEE_TABLES = [
	'committee_state',
	'committee_sessions',
	'speakers_lists',
	'motions',
	'votes'
] as const;

/**
 * The name a room's `load` functions register with `depends`, and that
 * `invalidate` is called with when something in the room changes. SvelteKit
 * asks for a word and a colon in front, the way an address starts with `https:`.
 */
export function committeeRoomDependency(committeeId: string): `committee-room:${string}` {
	return `committee-room:${committeeId}`;
}

/** Which rows to listen to beyond the committee's own tables. */
export type RoomWatch = {
	committeeId: string;
	/** The active speakers list, whose entries have no `committee_id` of their own. */
	speakersListId: string | null;
	/**
	 * The session's General Speakers' List, which the GSL view draws and takes
	 * additions to even while a moderated caucus or a single speaker has a list
	 * of its own active (`realtime.md`, from S4). Left out where only the
	 * active list is shown, such as a delegate's live view.
	 */
	generalSpeakersListId?: string | null;
	/**
	 * The current session. `roll_calls` has no `committee_id` either, and
	 * hearing a new roll call of this session is how a roll call started on
	 * another screen reaches this one.
	 */
	sessionId: string | null;
	/** The latest roll call, whose entries likewise have no `committee_id`. */
	rollCallId: string | null;
	/**
	 * The vote the room is on (`current_vote_id`). A roll call vote's answers
	 * are `vote_entries` rows, which have no `committee_id` either, so the
	 * channel hears them filtered on this vote (S2, D2).
	 */
	voteId: string | null;
};

/**
 * The filter on `speakers_list_entries` for the lists a room page shows: the
 * active list and the General Speakers' List, `speakers_list_id=in.(a,b)`
 * while they differ, `speakers_list_id=eq.a` while they are the same list or
 * only one is known, and null with neither.
 */
export function speakersListFilter(listIds: (string | null)[]): string | null {
	const known = listIds.filter((listId) => listId !== null);
	const distinct = known.filter((listId, index) => known.indexOf(listId) === index);

	if (distinct.length === 0) return null;
	if (distinct.length === 1) return `speakers_list_id=eq.${distinct[0]}`;

	return `speakers_list_id=in.(${distinct.join(',')})`;
}

/**
 * Counts the channels opened, so that each gets a name of its own. Closing a
 * channel finishes a moment later, and a new one opened under the same name in
 * that moment would be handed the one that is closing.
 */
let openedChannelCount = 0;

/**
 * The channels `closeCommitteeRoom` has closed. A channel waits for the
 * reader's token before it joins, and a page may close it during that wait;
 * such a channel must then never join. A `WeakSet` forgets a channel once
 * nothing else refers to it.
 */
const closedChannels = new WeakSet<RealtimeChannel>();

/**
 * Open one channel for the room and call `onChange` on every insert, update
 * and delete in it. `onStatus` hears whether the channel is live. Hand the
 * channel back to `closeCommitteeRoom` when the page no longer needs it.
 */
export function subscribeToCommitteeRoom(
	supabase: SupabaseClient,
	watch: RoomWatch,
	onChange: () => void,
	onStatus: (status: LiveStatus) => void
): RealtimeChannel {
	openedChannelCount += 1;

	const channel = supabase.channel(`committee-room:${watch.committeeId}:${openedChannelCount}`);

	for (const table of COMMITTEE_TABLES) {
		channel.on(
			'postgres_changes',
			{ event: '*', schema: 'public', table, filter: `committee_id=eq.${watch.committeeId}` },
			onChange
		);
	}

	const entriesFilter = speakersListFilter([
		watch.speakersListId,
		watch.generalSpeakersListId ?? null
	]);

	if (entriesFilter !== null) {
		channel.on(
			'postgres_changes',
			{ event: '*', schema: 'public', table: 'speakers_list_entries', filter: entriesFilter },
			onChange
		);
	}

	if (watch.sessionId !== null) {
		channel.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'roll_calls',
				filter: `session_id=eq.${watch.sessionId}`
			},
			onChange
		);
	}

	if (watch.rollCallId !== null) {
		channel.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'roll_call_entries',
				filter: `roll_call_id=eq.${watch.rollCallId}`
			},
			onChange
		);
	}

	// Each answer of a roll call vote reaches the screens as it is given. An
	// answer the chair takes off again is a delete, which carries only the
	// row's primary key and is not checked against the reader's policies;
	// `vote_id` is part of it, so the filter still finds it, and the key says
	// nothing a signed-in listener of this vote may not read.
	if (watch.voteId !== null) {
		channel.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'vote_entries',
				filter: `vote_id=eq.${watch.voteId}`
			},
			onChange
		);
	}

	// The channel joins once Realtime holds the reader's token, or it would
	// listen as a visitor, whom the room's tables refuse (`./realtime-auth.ts`). Supabase
	// reports `SUBSCRIBED` once events flow, and `CHANNEL_ERROR`, `TIMED_OUT` or
	// `CLOSED` when they stop.
	void giveRealtimeTheToken(supabase).then(() => {
		if (closedChannels.has(channel)) return;

		channel.subscribe((status) => {
			onStatus(status === 'SUBSCRIBED' ? 'live' : 'paused');
		});
	});

	return channel;
}

/** Close a channel `subscribeToCommitteeRoom` opened. */
export function closeCommitteeRoom(supabase: SupabaseClient, channel: RealtimeChannel): void {
	closedChannels.add(channel);

	// The answer only says whether the server heard the goodbye; there is nothing to do either way.
	void supabase.removeChannel(channel);
}
