<script lang="ts">
	import QueueRow from '$lib/components/room/queue/QueueRow.svelte';
	import type { GslEntry } from '$lib/gsl-floor';
	import LivePanel from './LivePanel.svelte';

	type Props = {
		/** "Speakers’ list" or "Caucus speakers". */
		title: string;
		/** The seats waiting on the live list, in speaking order. */
		entries: GslEntry[];
		/** The reader's own seat, or null for staff watching. */
		mySeatId: string | null;
		/** The seats the latest roll call marked absent: they keep their place, and "Next" skips them. */
		absentSeatIds: string[];
	};

	let { title, entries, mySeatId, absentSeatIds }: Props = $props();
</script>

<!--
	Every waiting seat in order, drawn with the console's own row without its
	drag handle and its menu: the place, the flag, the country, "absent" beside
	a seat marked absent, and "You" on the reader's own row. Not drawn when
	nobody waits. `@container` lets each row measure the list's own width, and
	`[&>li:last-child]:border-b-0` takes the hairline off the last row, since
	the panel's own edge is under it.
-->
{#if entries.length > 0}
	<LivePanel {title}>
		<ol class="@container [&>li:last-child]:border-b-0">
			<!-- The `(entry.id)` key lets Svelte reuse rows instead of rebuilding them. -->
			{#each entries as entry, index (entry.id)}
				<QueueRow
					{entry}
					{index}
					isAbsent={absentSeatIds.includes(entry.seat.id)}
					isReader={entry.seat.id === mySeatId}
				/>
			{/each}
		</ol>
	</LivePanel>
{/if}
