<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import { UNASSIGNED_SEAT_LABEL, removeSeatActionUrl } from '$lib/delegation-review';
	import { committeeHeading } from '$lib/committees';
	import type { DelegationSeat, DelegationSeatCommittee } from '$lib/delegations';

	type Props = {
		/** The committee the seat belongs to, for the heading in front of it. */
		committee: DelegationSeatCommittee;
		/** The reserved seat this row is about. */
		seat: DelegationSeat;
		/** False for a reader who may not decide applications, whose row has no "Remove". */
		canRemove: boolean;
		/** Sends "Remove" through the page's instant form (`$lib/instant-form.svelte.ts`, T142). */
		onSubmit: SubmitFunction;
	};

	let { committee, seat, canRemove, onSubmit }: Props = $props();

	// `$derived` writes this again whenever the seat changes, which is every time
	// `load` runs and hands down fresh seats.
	const holderName = $derived(seat.holder === null ? UNASSIGNED_SEAT_LABEL : seat.holder.fullName);
</script>

<li class="flex items-center justify-between gap-3 border-b border-border pb-2">
	<span class="flex min-w-0 items-center gap-2 text-body text-foreground">
		<span class="text-muted-foreground">{committeeHeading(committee)}</span>
		{#if seat.countryCode}
			<Flag countryCode={seat.countryCode} />
		{/if}
		<span class="truncate">{seat.name}</span>
		<span class="truncate text-small text-muted-foreground">{holderName}</span>
	</span>

	<!--
		`ConfirmButton` renders a form of its own, so the seat it is about travels
		in the address rather than in a hidden field.
	-->
	{#if canRemove}
		<ConfirmButton
			label="Remove"
			confirmTitle="Remove this seat?"
			confirmText="The seat becomes free for anybody again, and an unpaid invoice is reissued for the seats that are left."
			formaction={removeSeatActionUrl(seat.id)}
			size="dense-sm"
			{onSubmit}
		/>
	{/if}
</li>
