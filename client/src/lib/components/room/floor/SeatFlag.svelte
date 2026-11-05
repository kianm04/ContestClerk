<script lang="ts">
	import type { RoomSeat } from '$lib/committee-room';
	import { seatInitials } from '$lib/gsl-floor';
	import { flagUrl } from '$lib/media';

	type Props = {
		/** The seat whose flag is drawn. */
		seat: RoomSeat;
		/**
		 * `row` is 20×15, in a list or a menu; `floor` is the speaker's 64×48 (48×36 on a
		 * phone); `phone` the delegate live view's 40×30; `display` the projector's, 9% of
		 * the window's width.
		 */
		size: 'row' | 'floor' | 'phone' | 'display';
	};

	let { seat, size }: Props = $props();

	/* Written out in full so Tailwind can find the classes. All keep the 4:3 of a flag. */
	const SIZE_CLASSES = {
		row: 'w-5 rounded-[2px] text-[7px]',
		floor: 'w-16 rounded-[3px] text-lg max-md:w-12',
		phone: 'w-10 rounded-[2px] text-[9px]',
		display: 'w-[9vw] rounded-[4px] text-[1.4vw]'
	};

	/* flagcdn.com's picture about twice as wide as it is drawn, so it stays sharp. */
	const FLAG_SIZES = { row: 'sm', floor: 'lg', phone: 'md', display: 'xl' } as const;

	const sizeClasses = $derived(SIZE_CLASSES[size]);
	const flagSize = $derived(FLAG_SIZES[size]);
</script>

<!--
	A seat's flag, or its initials in the same 4:3 box when it has no country
	code (a custom member of a quick session). The seat's name is always written
	beside it, so the picture is left out of what a screen reader reads (`alt=""`).
-->
{#if seat.countryCode}
	<img
		src={flagUrl(seat.countryCode, flagSize)}
		alt=""
		class="inline-block aspect-[4/3] flex-none object-cover outline -outline-offset-1 outline-ink-900/10 {sizeClasses}"
	/>
{:else}
	<span
		aria-hidden="true"
		class="inline-grid aspect-[4/3] flex-none place-items-center bg-neutral-100 leading-none font-semibold tracking-[0.04em] text-neutral-700 {sizeClasses}"
	>
		{seatInitials(seat.name)}
	</span>
{/if}
