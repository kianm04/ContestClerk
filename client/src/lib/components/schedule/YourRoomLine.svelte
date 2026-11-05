<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import type { RoomLine } from './YourRoomStrip.svelte';

	type Props = {
		/** The room, what its committee has on today, and the way in. */
		room: RoomLine;
	};

	let { room }: Props = $props();
</script>

<!-- One line of `YourRoomStrip`: "Your room: UNSC", what is on there, and the way in. -->
<li
	class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 not-first:border-t not-first:border-border md:px-8"
>
	<span aria-hidden="true" class="size-2 shrink-0 rounded-full bg-brand-500"></span>
	<span class="text-dense text-ink-900">
		Your room: <strong class="font-semibold">{room.link.heading}</strong>
	</span>
	{#if room.status}
		<span class="text-dense text-ink-600 max-md:basis-full max-md:pl-5">{room.status}</span>
	{/if}
	<span class="ml-auto max-md:w-full max-md:pl-5">
		<Button variant="primary" size="dense" href={room.link.href} label={room.link.label} />
	</span>
</li>
