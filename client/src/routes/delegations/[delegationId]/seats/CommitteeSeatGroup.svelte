<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { committeeHeading } from '$lib/committees';
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import type { DelegationSeat, DelegationSeatCommittee, UnseatedMember } from '$lib/delegations';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import SeatAssignForm from './SeatAssignForm.svelte';

	type Props = {
		/** Which delegation these seats belong to. The Unassign button's address needs it. */
		delegationId: string;
		committee: DelegationSeatCommittee;
		/** The seats this delegation holds in that committee, in the organisers' order. */
		seats: DelegationSeat[];
		/** Everybody in the delegation with no seat yet, offered by every dropdown below. */
		unseatedMembers: UnseatedMember[];
		/** The reader's own id, so a dropdown can mark their own name "(you)". */
		myUserId: string;
		/** False from the conference's first day, when only organisers may still move people. */
		canChangeSeats: boolean;
		/** The page's instant form, which every seat's "Assign" and "Unassign" is sent through. */
		onSubmit: SubmitFunction;
	};

	let {
		delegationId,
		committee,
		seats,
		unseatedMembers,
		myUserId,
		canChangeSeats,
		onSubmit
	}: Props = $props();

	// A committee without a short name shows its full name at the top instead.
	// `CommitteeCard` heads itself the same way. `$derived` works it out again
	// whenever `committee` changes.
	const heading = $derived(committeeHeading(committee));
</script>

<Card>
	<div class="flex items-start justify-between gap-2">
		<h2 class="text-h3">{heading}</h2>

		<Badge
			tone={statusBadgeTone('experience_level', committee.level)}
			label={statusLabel('experience_level', committee.level)}
		/>
	</div>

	{#if committee.abbreviation}
		<p class="text-body">{committee.name}</p>
	{/if}

	<ul class="mt-3 divide-y divide-line">
		<!-- The `(seat.id)` key lets Svelte reuse each row instead of rebuilding it. -->
		{#each seats as seat (seat.id)}
			<li class="flex flex-wrap items-center gap-3 py-2">
				{#if seat.countryCode}
					<Flag countryCode={seat.countryCode} />
				{/if}

				<span class="text-body">{seat.name}</span>

				<div class="ml-auto">
					<SeatAssignForm
						{delegationId}
						{seat}
						{unseatedMembers}
						{myUserId}
						{canChangeSeats}
						{onSubmit}
					/>
				</div>
			</li>
		{/each}
	</ul>
</Card>
