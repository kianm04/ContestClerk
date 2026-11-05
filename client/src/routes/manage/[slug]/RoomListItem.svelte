<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import type { LiveRoomRow } from '$lib/dashboard-rooms';
	import { chairRoomUrl } from '$lib/urls';
	import RoomPresence from './RoomPresence.svelte';

	type Props = {
		/** One committee room on a conference day. */
		room: LiveRoomRow;
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { room, conferenceSlug }: Props = $props();
</script>

<!--
	One room below `md`, which is what a phone shows: what the table says in a
	column, written as lines, with "Open chair room" beside who is present.
-->
<li class="flex flex-col gap-2.5 border-b border-border px-1 py-3.5 text-dense text-foreground">
	<div>
		<p class="font-medium">{room.name}</p>
		{#if room.code}
			<p class="text-small text-muted-foreground">{room.code}</p>
		{/if}
	</div>

	<p>{room.activity}</p>

	<div class="flex items-center justify-between gap-3">
		<p class="min-w-0 text-muted-foreground">
			Present: <RoomPresence {room} {conferenceSlug} /> · {room.chair}
		</p>
		<!-- `shrink-0` keeps the button's words on one line; the names wrap instead. -->
		<div class="shrink-0">
			<Button
				label="Open chair room"
				variant="secondary"
				size="dense"
				href={chairRoomUrl(conferenceSlug, room.committeeSlug)}
			/>
		</div>
	</div>
</li>
