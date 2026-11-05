<script lang="ts">
	import { flagUrl } from '$lib/media';
	import type { Seat } from '$lib/organiser-seats';

	type Props = {
		seat: Seat;
		/** True for the first seat under the committee's heading, which has no rule above it. */
		isFirst: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { seat, isFirst }: Props = $props();
</script>

<!--
	One seat of the drawn grid: the flag, the country, and who holds it. A
	reserved seat is pale blue with the school's name in dark blue; the seat
	ringed in light blue (`inset-ring-2`) is where the dragged delegate is
	about to land; a vacated seat keeps the lifted delegate's name as a dashed
	ghost. The flag's faint edge is an outline pulled 1px inside it, as in
	`Flag.svelte`, so a white flag still has an edge.
-->
<div
	class={[
		'flex min-h-12 items-center gap-2.5 px-3.5 py-1.5',
		!isFirst && 'border-t border-neutral-100',
		(seat.state === 'reserved' || seat.isDropTarget) && 'bg-brand-50',
		seat.isDropTarget && 'inset-ring-2 inset-ring-brand-500'
	]}
>
	<img
		src={flagUrl(seat.countryCode)}
		alt=""
		class="h-[0.9375rem] w-5 flex-none rounded-[2px] object-cover outline-1 -outline-offset-1 outline-ink-900/10"
	/>
	<div class="flex min-w-0 flex-1 flex-col items-start">
		{#if seat.state === 'reserved'}
			<span class="flex w-full justify-between gap-2 text-caption">
				<span class="text-ink-600">{seat.country}</span>
				<span class="font-medium text-brand-900">Reserved</span>
			</span>
			<span class="font-medium text-brand-900">{seat.holder}</span>
		{:else}
			<span class="text-caption text-ink-600">{seat.country}</span>
			{#if seat.state === 'filled'}
				<span class="font-medium">{seat.holder}</span>
			{:else if seat.state === 'free'}
				<span class="text-ink-600">Free</span>
			{:else}
				<span
					class="-ml-[0.3125rem] rounded-[0.25rem] border border-dashed border-input px-1 text-ink-400"
				>
					{seat.holder}
				</span>
			{/if}
		{/if}
	</div>
</div>
