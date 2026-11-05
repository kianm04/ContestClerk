<script lang="ts">
	import type { DaisAmendmentRow } from '$lib/amendment-queue';
	import PaperSideHeading from '$lib/components/paper-side/PaperSideHeading.svelte';
	import AmendmentReviewCard from './AmendmentReviewCard.svelte';

	type Props = {
		/** The draft's amendments, in the order the dais works through them. */
		rows: DaisAmendmentRow[];
		paperId: string;
		conferenceSlug: string;
		committeeSlug: string;
	};

	let { rows, paperId, conferenceSlug, committeeSlug }: Props = $props();
</script>

<!--
	An introduced draft's amendments on the dais's review, in the order the
	dais takes them: those still waiting first, an amendment to an amendment
	just before the one it changes, then those that have ended.
-->
<section aria-label="Amendments" class="mb-10">
	<PaperSideHeading title="Amendments" count={String(rows.length)} />
	{#if rows.length === 0}
		<p class="mt-3 text-small text-muted-foreground">No amendments yet.</p>
	{:else}
		<!-- `(row.card.id)` keys each card, so Svelte moves it when the order changes. -->
		<div class="mt-4 flex flex-col gap-4">
			{#each rows as row (row.card.id)}
				<AmendmentReviewCard {row} {paperId} {conferenceSlug} {committeeSlug} />
			{/each}
		</div>
	{/if}
</section>
