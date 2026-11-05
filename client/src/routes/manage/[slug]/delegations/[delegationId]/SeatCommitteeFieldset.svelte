<script lang="ts">
	import type { SeatGroup } from '$lib/allocation';
	import SeatCheckbox from './SeatCheckbox.svelte';

	type Props = {
		/** One committee and the free seats left in it. */
		group: SeatGroup;
		/** The seats a refused post sent back ticked. */
		selectedSeatIds: string[];
		/** Called when a box is ticked or unticked, so the picker can count. */
		onToggle: (event: Event) => void;
	};

	let { group, selectedSeatIds, onToggle }: Props = $props();
</script>

<fieldset class="flex flex-col gap-1">
	<legend class="text-small font-medium text-ink-900">{group.committeeLabel}</legend>

	<!-- The `(seat.id)` key lets Svelte reuse the boxes instead of rebuilding them. -->
	{#each group.seats as seat (seat.id)}
		<SeatCheckbox {seat} isChecked={selectedSeatIds.includes(seat.id)} {onToggle} />
	{/each}
</fieldset>
