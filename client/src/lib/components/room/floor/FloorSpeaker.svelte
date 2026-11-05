<script lang="ts">
	import type { RoomSeat } from '$lib/committee-room';
	import SeatFlag from './SeatFlag.svelte';

	type Props = {
		/** The seat with the floor: its country (or name), flag and delegate. */
		seat: RoomSeat;
		/**
		 * `console` is the chair's floor; `phone` the delegate live view's panel;
		 * `display` the projector's, sized as a share of the window's width.
		 */
		size?: 'console' | 'phone' | 'display';
	};

	// `$props()` is how a Svelte 5 component receives what its parent passes in.
	let { seat, size = 'console' }: Props = $props();

	/*
		Each size's gap, country and delegate, written out in full so Tailwind
		can find the classes. On the console the country is 44/48, 36/40 on a
		narrower laptop and 32/36 on a phone; the phone's panel is 26/32; the
		projector's is 6% of the window's width (`display.md`, "Sizes").
	*/
	const GAP_CLASSES = { console: 'gap-5 max-md:gap-4', phone: 'gap-3', display: 'gap-[2.4vw]' };
	const COUNTRY_CLASSES = {
		console: 'text-display max-[1100px]:text-[36px]/10 max-md:text-display-mobile',
		phone: 'text-[26px]/8 font-semibold',
		display: 'text-[6vw]/[1.05] font-semibold'
	};
	const DELEGATE_CLASSES = {
		console: 'mt-0.5',
		phone: 'text-small',
		display: 'mt-[0.6vw] text-[2vw]/[1.2]'
	};
	const FLAG_SIZES = { console: 'floor', phone: 'phone', display: 'display' } as const;
</script>

<!--
	Who has the floor: the flag, the country in the display serif, and the
	delegate's name under it. A seat with no delegate shows its country alone,
	never "Delegate". No "Speaking now" pill: a running clock already says it.
-->
<div class="flex min-w-0 items-center {GAP_CLASSES[size]}">
	<SeatFlag {seat} size={FLAG_SIZES[size]} />
	<div class="min-w-0">
		<p class="font-display text-balance {COUNTRY_CLASSES[size]}">
			{seat.name}
		</p>
		{#if seat.delegateName}
			<p class="text-ink-600 {DELEGATE_CLASSES[size]}">{seat.delegateName}</p>
		{/if}
	</div>
</div>
