<script lang="ts">
	// This component draws nothing. It keeps a draft's page, and the dais's
	// review of it, listening to its amendments (`$lib/paper-amendments-live.ts`),
	// so a new amendment, a sponsor's answer or a seat's support shows on the
	// cards while the page is open, and reads them again every fifteen seconds
	// while the connection is down.

	import type { SupabaseClient } from '@supabase/supabase-js';
	import { PAUSED_RELOAD_SECONDS, type LiveStatus } from '$lib/committee-room-live';
	import {
		closePaperAmendments,
		paperAmendmentsDependency,
		subscribeToPaperAmendments
	} from '$lib/paper-amendments-live';
	import { createRoomReload } from '$lib/room-reload.svelte';

	type Props = {
		/** The browser's Supabase client, from the root layout. */
		supabase: SupabaseClient;
		paperId: string;
	};

	let { supabase, paperId }: Props = $props();

	// `$derived` only passes a change on when the value is different, so the
	// channel below is reopened when the page moves to another paper and not
	// on every reload of the same one.
	const client = $derived(supabase);
	const watchedPaperId = $derived(paperId);

	// Reads the amendments again for each change heard, once a link being
	// followed has finished loading (`$lib/room-reload.svelte.ts`).
	const amendmentsReload = createRoomReload(() => paperAmendmentsDependency(watchedPaperId));

	let status: LiveStatus = $state('connecting');
	// Whether a channel of this page has been live before; nothing on screen depends on it.
	let hasBeenLive = false;

	// `$effect` runs in the browser only, and again whenever one of the values
	// above changes. The function it returns closes the channel.
	$effect(() => {
		// A closed channel still reports "closed" a moment later, when a new one may be live already.
		let isCurrentChannel = true;

		// A new channel heard nothing while it was joining, so the amendments are read again once it is live.
		function handleChannelStatus(channelStatus: LiveStatus) {
			if (!isCurrentChannel) return;

			status = channelStatus;
			if (channelStatus !== 'live') return;
			if (hasBeenLive) amendmentsReload.request();
			hasBeenLive = true;
		}

		const channel = subscribeToPaperAmendments(
			client,
			watchedPaperId,
			amendmentsReload.request,
			handleChannelStatus
		);

		return () => {
			isCurrentChannel = false;
			closePaperAmendments(client, channel);
		};
	});

	$effect(() => {
		if (status !== 'paused') return;

		const interval = setInterval(amendmentsReload.request, PAUSED_RELOAD_SECONDS * 1000);

		return () => clearInterval(interval);
	});
</script>
