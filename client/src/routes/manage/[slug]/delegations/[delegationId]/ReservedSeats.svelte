<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { NO_RESERVED_SEATS } from '$lib/delegation-review';
	import type { DelegationSeatGroup } from '$lib/delegations';
	import ReservedSeatRow from './ReservedSeatRow.svelte';

	type Props = {
		/** The seats reserved for this delegation, under their committees. */
		seatsByCommittee: DelegationSeatGroup[];
		/** Whether each row has its "Remove" button. */
		canRemove: boolean;
		/** Sends "Remove" through the page's instant form (`$lib/instant-form.svelte.ts`, T142). */
		onSubmit: SubmitFunction;
	};

	let { seatsByCommittee, canRemove, onSubmit }: Props = $props();

	/*
		One entry per seat, each carrying its own committee. The seats arrive
		grouped, but the list below shows them one after another with the committee
		written in front of each, so flattening them here keeps the markup a single
		loop instead of a loop inside a loop. `$derived` builds it again whenever
		`load` hands down fresh seats.
	*/
	const rows = $derived(
		seatsByCommittee.flatMap((group) =>
			group.seats.map((seat) => ({ committee: group.committee, seat }))
		)
	);
</script>

{#if rows.length === 0}
	<p class="text-body text-ink-600">{NO_RESERVED_SEATS}</p>
{:else}
	<ul class="flex flex-col gap-2">
		<!-- The `(row.seat.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each rows as row (row.seat.id)}
			<ReservedSeatRow committee={row.committee} seat={row.seat} {canRemove} {onSubmit} />
		{/each}
	</ul>
{/if}
