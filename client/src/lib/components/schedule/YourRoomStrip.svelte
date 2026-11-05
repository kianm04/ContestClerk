<script lang="ts">
	import type { RoomLink } from '$lib/schedule-rooms';
	import YourRoomLine from './YourRoomLine.svelte';

	/** One room the reader chairs or sits in today, and what that committee has on. */
	export type RoomLine = {
		link: RoomLink;
		/** "Committee session II is on until 12:30", or `null` when nothing more is on today. */
		status: string | null;
	};

	type Props = {
		/** One line for each room the reader chairs or sits in today. Nothing is drawn when empty. */
		rooms: RoomLine[];
	};

	let { rooms }: Props = $props();
</script>

<!--
	"Your room: UNSC", what is on there, and the way in (T171), along the top of
	the calendar on a conference day. It is the one tinted strip on the page, so
	the way into the room is the first thing the eye lands on, and "Open chair
	room" is the page's one dark blue button.
-->
{#if rooms.length > 0}
	<ul class="border-b border-border bg-brand-50">
		<!-- The `(room.link.committeeId)` key lets Svelte reuse lines instead of rebuilding them. -->
		{#each rooms as room (room.link.committeeId)}
			<YourRoomLine {room} />
		{/each}
	</ul>
{/if}
