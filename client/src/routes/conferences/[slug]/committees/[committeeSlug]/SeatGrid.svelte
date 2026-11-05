<script lang="ts">
	import Armchair from '@lucide/svelte/icons/armchair';
	import type { PublicSeat } from '$lib/committees';
	import Avatar from '$lib/components/Avatar.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import Section from '$lib/components/Section.svelte';

	type Props = {
		seats: PublicSeat[];
		/** The reader's own seat, highlighted. `null` when they have none here. */
		mySeatId: string | null;
		/** Whether the delegates' names came back. See `CommitteeViewer` for the rule. */
		canSeeSeatHolders: boolean;
	};

	let { seats, mySeatId, canSeeSeatHolders }: Props = $props();

	/* The box every seat sits in, and the two colours it comes in, written out in
	   full because Tailwind reads the class names out of this file and cannot
	   follow a name that is glued together while the page runs. */
	const SEAT_ROW_CLASSES =
		'flex flex-wrap items-center gap-2 rounded-control border border-line p-2 text-small';
	const MY_SEAT_BACKGROUND = 'bg-brand-100';
	const OTHER_SEAT_BACKGROUND = 'bg-surface';

	/** The classes one seat row gets. The reader's own seat is the coloured one. */
	function seatRowClasses(seatId: string): string {
		const background = seatId === mySeatId ? MY_SEAT_BACKGROUND : OTHER_SEAT_BACKGROUND;

		return `${SEAT_ROW_CLASSES} ${background}`;
	}

	/**
	 * What a seat held for a school says: the school's name, or only the word
	 * when this reader is not allowed to know which school it is.
	 * `reservedFor` in `$lib/server/committee-page.ts` decides which of the two.
	 */
	function reservationLabel(seat: PublicSeat): string {
		if (!seat.reservedForName) {
			return 'Reserved';
		}

		return `${seat.reservedForName} · reserved`;
	}
</script>

<Section title="Seats" icon={Armchair}>
	{#if seats.length === 0}
		<EmptyState
			icon={Armchair}
			title="Seats will be announced soon."
			description="The organisers have not published the seat list yet."
		/>
	{:else}
		<ul class="grid grid-cols-2 gap-2 lg:grid-cols-3">
			<!-- The `(seat.id)` key lets Svelte reuse list items instead of rebuilding them. -->
			{#each seats as seat (seat.id)}
				<li class={seatRowClasses(seat.id)}>
					{#if seat.countryCode}
						<Flag countryCode={seat.countryCode} />
					{/if}

					<span class="min-w-0 flex-1">{seat.name}</span>

					<!--
						A visitor is told whether a seat is taken but never by whom, which is
						the whole reason the `public_seats` view exists. So a delegate's name
						shows only to a reader the seat list itself was handed to, and the
						"Taken" badge stands in for everybody else.

						The badge also stands in for a taken seat whose delegate has no name to
						show, which an account made before the trigger that writes a profile row
						has. Saying nothing at all there would read as a free seat, which is the
						one thing it must not say.

						A seat a school has been promised but not yet filled is neither free nor
						taken, so it says the school's name rather than a badge: it is a fact
						about the seat and not a state of it, the way a delegate's name is.

						The only case that shows nothing is a visitor looking at a free seat,
						where there is genuinely nothing to say, so the chain has no final branch.
					-->
					{#if canSeeSeatHolders && seat.holderName}
						<span class="flex items-center gap-2 text-ink-900">
							<Avatar name={seat.holderName} imagePath={seat.holderAvatarPath} size="sm" />
							{seat.holderName}
						</span>
					{:else if canSeeSeatHolders && seat.isReserved}
						<span class="text-ink-600">{reservationLabel(seat)}</span>
					{:else if canSeeSeatHolders && !seat.isTaken}
						<span class="text-ink-600">Free</span>
					{:else if seat.isTaken}
						<Badge tone="neutral" label="Taken" />
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</Section>
