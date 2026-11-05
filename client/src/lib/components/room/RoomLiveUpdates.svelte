<script lang="ts">
	// This component draws nothing. It keeps a room page listening to realtime
	// (`specs/02-architecture/realtime.md`) and reports whether the connection is
	// live through `onStatusChange`, so each page can show a paused connection in
	// its own words. The chair layout and the delegate live view both use it.

	import type { SupabaseClient } from '@supabase/supabase-js';
	import {
		PAUSED_RELOAD_SECONDS,
		closeCommitteeRoom,
		committeeRoomDependency,
		subscribeToCommitteeRoom,
		type LiveStatus
	} from '$lib/committee-room-live';
	import { createRoomReload } from '$lib/room-reload.svelte';

	type Props = {
		/** The browser's Supabase client, from the root layout. */
		supabase: SupabaseClient;
		committeeId: string;
		speakersListId: string | null;
		/**
		 * The session's General Speakers' List, heard as well while another list
		 * is active, so the GSL view sees a co-chair's addition at once. The
		 * delegate's live view leaves it out.
		 */
		generalSpeakersListId?: string | null;
		/** The current session, whose new roll calls the channel listens for. */
		sessionId: string | null;
		rollCallId: string | null;
		voteId?: string | null;
		/** Null until this component has started listening. */
		status: LiveStatus | null;
		/** Called whenever the connection starts, comes up or drops. */
		onStatusChange: (status: LiveStatus) => void;
	};

	let {
		supabase,
		committeeId,
		speakersListId,
		generalSpeakersListId = null,
		sessionId,
		rollCallId,
		voteId = null,
		status,
		onStatusChange
	}: Props = $props();

	// The page's `data` is replaced on every reload, and an `$effect` that read it directly
	// would close and reopen the channel each time. `$derived` only passes a change on when the
	// value itself is different, so the channel is reopened only when the list, the session, the
	// roll call or the vote it listens to really changes.
	const client = $derived(supabase);
	const watchedCommitteeId = $derived(committeeId);
	const watchedListId = $derived(speakersListId);
	const watchedGeneralListId = $derived(generalSpeakersListId);
	const watchedSessionId = $derived(sessionId);
	const watchedRollCallId = $derived(rollCallId);
	const watchedVoteId = $derived(voteId);

	// Reads the room again for each change heard, once nothing stands in the
	// way: a link being followed, or the reader's own presses still on their way
	// (`$lib/room-reload.svelte.ts`).
	const roomReload = createRoomReload(() => committeeRoomDependency(watchedCommitteeId));

	// Whether a channel of this page has been live before. A plain variable, not
	// `$state`: nothing on screen depends on it.
	let hasBeenLive = false;

	// `$effect` is how a component talks to something outside Svelte, here the
	// realtime connection. It runs in the browser only, again whenever one of
	// the ids above changes, and the function it returns closes the channel when
	// the ids change or the reader leaves the chair pages.
	$effect(() => {
		onStatusChange('connecting');

		// A channel that is being closed still reports "closed" a moment later.
		// By then a new channel may already be live, so a closed channel's news
		// is ignored rather than allowed to mark the page as paused.
		let isCurrentChannel = true;

		/**
		 * A channel live again after an earlier one (the room moved to another
		 * list, roll call or vote, or the connection came back) heard nothing
		 * while it was joining, so the room is read once more to catch up.
		 */
		function handleChannelStatus(channelStatus: LiveStatus) {
			if (!isCurrentChannel) return;

			onStatusChange(channelStatus);
			if (channelStatus !== 'live') return;
			if (hasBeenLive) roomReload.request();
			hasBeenLive = true;
		}

		const watch = {
			committeeId: watchedCommitteeId,
			speakersListId: watchedListId,
			generalSpeakersListId: watchedGeneralListId,
			sessionId: watchedSessionId,
			rollCallId: watchedRollCallId,
			voteId: watchedVoteId
		};
		const channel = subscribeToCommitteeRoom(
			client,
			watch,
			roomReload.request,
			handleChannelStatus
		);

		return () => {
			isCurrentChannel = false;
			closeCommitteeRoom(client, channel);
		};
	});

	// While the connection is down nothing tells the page about changes, so it
	// reads the room again every fifteen seconds until the connection is back
	// (`specs/02-architecture/realtime.md`).
	$effect(() => {
		if (status !== 'paused') return;

		const interval = setInterval(roomReload.request, PAUSED_RELOAD_SECONDS * 1000);

		return () => clearInterval(interval);
	});
</script>
