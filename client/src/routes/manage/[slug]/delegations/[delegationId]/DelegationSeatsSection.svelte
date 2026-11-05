<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Stat from '$lib/components/Stat.svelte';
	import type { SeatGroup } from '$lib/allocation';
	import type { DelegationProgress, DelegationSeatGroup, DelegationStatus } from '$lib/delegations';
	import ReservedSeats from './ReservedSeats.svelte';
	import SeatPicker from './SeatPicker.svelte';

	type Props = {
		/** Requested, allocated and assigned, from `delegationProgress`. */
		progress: DelegationProgress;
		/** The seats already reserved for this delegation, under their committees. */
		seatGroups: DelegationSeatGroup[];
		/** Whether this delegation may still be given more seats, by this reader. */
		canAllocate: boolean;
		/** Whether this reader may take a seat back, with `decide_applications`. */
		canRemove: boolean;
		/** The conference's free seats, grouped under their committee, for the picker. */
		freeSeatsByCommittee: SeatGroup[];
		/** The seats ticked when the last post was refused, so they come back ticked. */
		selectedSeatIds: string[];
		/** Why the last allocation was refused, or `null`. */
		error: string | null;
		/** What the note to the head said when the last post was refused. */
		decisionNote: string;
		/** `submitted` makes the picker's button accept the delegation as well as fill it. */
		status: DelegationStatus;
		/** For the picker's link to the allocation grid in its empty state. */
		slug: string;
		/** Sends "Remove" and "Accept and allocate" through the page's instant form. */
		onSubmit: SubmitFunction;
	};

	let {
		progress,
		seatGroups,
		canAllocate,
		canRemove,
		freeSeatsByCommittee,
		selectedSeatIds,
		error,
		decisionNote,
		status,
		slug,
		onSubmit
	}: Props = $props();
</script>

<div class="flex flex-col gap-4">
	<div class="grid grid-cols-3 gap-2">
		<Stat label="Requested" value={progress.requested} />
		<Stat label="Allocated" value={progress.allocated} />
		<Stat label="Assigned" value={progress.assigned} />
	</div>

	<ReservedSeats seatsByCommittee={seatGroups} {canRemove} {onSubmit} />

	{#if canAllocate}
		<SeatPicker
			{freeSeatsByCommittee}
			{selectedSeatIds}
			{error}
			{decisionNote}
			{status}
			{slug}
			{onSubmit}
		/>
	{/if}
</div>
