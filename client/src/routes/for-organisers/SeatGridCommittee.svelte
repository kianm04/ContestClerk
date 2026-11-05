<script lang="ts">
	import type { SeatCommittee } from '$lib/organiser-seats';
	import SeatGridSeat from './SeatGridSeat.svelte';

	type Props = {
		committee: SeatCommittee;
		/** False for every column after the first: those get a rule on the left and hide on a phone. */
		isFirst: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { committee, isFirst }: Props = $props();
</script>

<!--
	One committee's column of the drawn seat grid: its name and count on pale
	blue, six seats, and how many more follow. A phone shows only the first
	column, so the others are `hidden` until `lg`. `{#each … (key)}` repeats a
	seat for every item, and the key tells Svelte which drawn seat is which.
-->
<div class={['min-w-0 flex-col', isFirst ? 'flex' : 'hidden border-l border-neutral-100 lg:flex']}>
	<div class="flex flex-col bg-brand-50 px-3.5 py-2.5">
		<span class="font-semibold">{committee.name}</span>
		<span class="text-caption text-ink-600 tabular-nums">
			{committee.filledCount} of {committee.seatCount} filled
		</span>
	</div>
	{#each committee.seats as seat, index (seat.countryCode)}
		<SeatGridSeat {seat} isFirst={index === 0} />
	{/each}
	<span
		class="border-t border-neutral-100 px-3.5 pt-2.5 pb-3.5 text-caption text-ink-600 tabular-nums"
	>
		{committee.moreSeatCount} more seats
	</span>
</div>
