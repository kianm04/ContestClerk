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

<!-- One room in the Rooms table, from `md` up. -->
<tr class="border-b border-border text-dense text-foreground">
	<td class="p-3">
		<p class="font-medium">{room.name}</p>
		{#if room.code}
			<p class="text-small text-muted-foreground">{room.code}</p>
		{/if}
	</td>
	<td class="p-3">{room.activity}</td>
	<td class="p-3 whitespace-nowrap tabular-nums">
		<RoomPresence {room} {conferenceSlug} />
	</td>
	<td class="p-3">{room.chair}</td>
	<td class="p-3">
		<Button
			label="Open chair room"
			variant="secondary"
			size="dense-sm"
			href={chairRoomUrl(conferenceSlug, room.committeeSlug)}
		/>
	</td>
</tr>
