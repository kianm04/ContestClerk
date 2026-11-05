<script lang="ts">
	import Flag from '$lib/components/Flag.svelte';
	import type { AllocatableSeat } from '$lib/allocation';

	type Props = {
		/** The free seat this box offers. */
		seat: AllocatableSeat;
		/** Whether a refused post sent this seat back ticked. */
		isChecked: boolean;
		/** Called when the box is ticked or unticked, so the picker can count. */
		onToggle: (event: Event) => void;
	};

	let { seat, isChecked, onToggle }: Props = $props();
</script>

<label class="text-ink-700 flex items-center gap-2 text-body">
	<input
		type="checkbox"
		name="seatIds"
		value={seat.id}
		checked={isChecked}
		onchange={onToggle}
		class="h-4 w-4"
	/>
	{#if seat.countryCode}
		<Flag countryCode={seat.countryCode} />
	{/if}
	{seat.name}
</label>
