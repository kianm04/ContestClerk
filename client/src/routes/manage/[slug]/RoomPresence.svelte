<script lang="ts">
	import type { LiveRoomRow } from '$lib/dashboard-rooms';
	import { chairRollCallUrl } from '$lib/urls';

	type Props = {
		/** One committee room on a conference day. */
		room: LiveRoomRow;
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { room, conferenceSlug }: Props = $props();
</script>

<!--
	Who is present, while the room sits: "38 of 42" opens the roll call the
	count comes from. A room that is not sitting has nobody to count.
-->
{#if room.presence === null}
	<span class="text-muted-foreground">–</span>
{:else}
	<a href={chairRollCallUrl(conferenceSlug, room.committeeSlug)} class="text-link hover:underline"
		>{room.presence}</a
	>
{/if}
