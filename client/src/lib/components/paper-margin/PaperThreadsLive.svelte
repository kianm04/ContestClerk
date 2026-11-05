<script lang="ts">
	// This component draws nothing. It keeps a paper page listening to its
	// comment threads (`$lib/paper-threads-live.ts`), so another writer's
	// comment or reply shows in the margin while the page is open, and reads
	// the threads again every fifteen seconds while the connection is down.

	import type { SupabaseClient } from '@supabase/supabase-js';
	import { PAUSED_RELOAD_SECONDS, type LiveStatus } from '$lib/committee-room-live';
	import type { PaperCommentTarget } from '$lib/paper-comments';
	import {
		closePaperThreads,
		paperThreadsDependency,
		subscribeToPaperThreads
	} from '$lib/paper-threads-live';
	import { createRoomReload } from '$lib/room-reload.svelte';

	type Props = {
		/** The browser's Supabase client, from the root layout. */
		supabase: SupabaseClient;
		paper: PaperCommentTarget;
		/** The threads the page shows, and their comments. */
		threadIds: string[];
		commentIds: string[];
	};

	let { supabase, paper, threadIds, commentIds }: Props = $props();

	// The page's data is replaced on every reload, with new arrays and objects
	// even when nothing changed, and an `$effect` that read them directly would
	// reopen the channel each time. `$derived` only passes a change on when the
	// value is different, so the ids are joined into strings, which stay the
	// same while the threads do.
	const client = $derived(supabase);
	const paperKind = $derived(paper.kind);
	const paperId = $derived(paper.kind === 'committee' ? paper.paperId : paper.seatId);
	const watchedThreadIds = $derived(threadIds.join(','));
	const watchedCommentIds = $derived(commentIds.join(','));

	const watchedPaper = (): PaperCommentTarget =>
		paperKind === 'committee'
			? { kind: 'committee', paperId: paperId }
			: { kind: 'position', seatId: paperId };

	// Reads the threads again for each change heard, once a link being followed
	// has finished loading (`$lib/room-reload.svelte.ts`).
	const threadsReload = createRoomReload(() => paperThreadsDependency(watchedPaper()));

	let status: LiveStatus = $state('connecting');
	// Whether a channel of this page has been live before. A plain variable,
	// not `$state`: nothing on screen depends on it.
	let hasBeenLive = false;

	// `$effect` runs in the browser only, and again whenever one of the values
	// above changes. The function it returns closes the channel.
	$effect(() => {
		// A closed channel still reports "closed" a moment later, when a new
		// one may be live already, so a closed channel's news is ignored.
		let isCurrentChannel = true;

		// A new thread means a new channel, which heard nothing while it was
		// joining, so the threads are read once more when it is live.
		function handleChannelStatus(channelStatus: LiveStatus) {
			if (!isCurrentChannel) return;

			status = channelStatus;
			if (channelStatus !== 'live') return;
			if (hasBeenLive) threadsReload.request();
			hasBeenLive = true;
		}

		const watch = {
			paper: watchedPaper(),
			threadIds: watchedThreadIds === '' ? [] : watchedThreadIds.split(','),
			commentIds: watchedCommentIds === '' ? [] : watchedCommentIds.split(',')
		};
		const channel = subscribeToPaperThreads(
			client,
			watch,
			threadsReload.request,
			handleChannelStatus
		);

		return () => {
			isCurrentChannel = false;
			closePaperThreads(client, channel);
		};
	});

	$effect(() => {
		if (status !== 'paused') return;

		const interval = setInterval(threadsReload.request, PAUSED_RELOAD_SECONDS * 1000);

		return () => clearInterval(interval);
	});
</script>
