<script lang="ts">
	import type { RoomSeat } from '$lib/committee-room';

	type Props = {
		/** The next waiting seats "Next" would call, at most three (`nextSeats` in `$lib/watched-floor.ts`). */
		seats: RoomSeat[];
	};

	let { seats }: Props = $props();

	// "United Kingdom · Brazil · Russian Federation".
	const names = $derived(seats.map((seat) => seat.name).join(' · '));
</script>

<!--
	Who speaks next, along the bottom under a hairline: only the next three,
	since the projector is read from the back of the room and the whole list
	is on every phone. Not drawn when nobody waits.
-->
{#if seats.length > 0}
	<p class="flex gap-[2vw] border-t border-line pt-[2vw] text-[2vw]/[1.3]">
		<span class="shrink-0 text-ink-600">Next</span>
		<span class="min-w-0 truncate">{names}</span>
	</p>
{/if}
