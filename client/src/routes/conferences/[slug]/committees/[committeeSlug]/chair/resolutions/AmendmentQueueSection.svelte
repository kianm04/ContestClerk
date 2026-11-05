<script lang="ts">
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import type { QueuedAmendment } from '$lib/amendment-queue';
	import { chairAmendmentUrl } from '$lib/urls';
	import AmendmentQueueListRow from './AmendmentQueueListRow.svelte';
	import AmendmentQueueTableRow from './AmendmentQueueTableRow.svelte';

	type Props = {
		/** The amendments waiting for the dais, in the order it will take them. */
		queue: QueuedAmendment[];
		conferenceSlug: string;
		committeeSlug: string;
	};

	let { queue, conferenceSlug, committeeSlug }: Props = $props();

	const COLUMNS: TableColumn[] = [
		{ key: 'position', label: 'Order', width: 'w-16' },
		{ key: 'amendment', label: 'Amendment' },
		{ key: 'draft', label: 'Draft', width: 'w-44' },
		{ key: 'proposer', label: 'Proposed by', width: 'w-36' },
		{ key: 'friendly', label: 'Kind', width: 'w-28' },
		{ key: 'move', label: 'Move', width: 'w-56' }
	];

	/** The amendment's card on its draft's review page, where the dais decides it. */
	function reviewHref(amendment: QueuedAmendment) {
		return chairAmendmentUrl(conferenceSlug, committeeSlug, amendment.paper.id, amendment.sequence);
	}
</script>

<!--
	The amendments waiting for the dais across every introduced draft, one
	queue in the order the dais takes them. `id` lets "Move up" come back here.
-->
<section id="amendments" aria-label="Amendments" class="scroll-mt-24">
	<h2 class="border-b border-foreground pb-2 font-display text-h2 text-foreground">Amendments</h2>

	{#if queue.length === 0}
		<p class="py-3 text-body text-muted-foreground">No amendment waits for the dais.</p>
	{:else}
		<div class="hidden md:block">
			<DataTable columns={COLUMNS} isDense>
				<!-- The `(amendment.id)` key lets Svelte move a row when the queue is reordered. -->
				{#each queue as amendment, index (amendment.id)}
					<AmendmentQueueTableRow
						{amendment}
						position={index + 1}
						href={reviewHref(amendment)}
						isFirst={index === 0}
						isLast={index === queue.length - 1}
					/>
				{/each}
			</DataTable>
		</div>

		<ol class="md:hidden">
			{#each queue as amendment, index (amendment.id)}
				<li>
					<AmendmentQueueListRow
						{amendment}
						position={index + 1}
						href={reviewHref(amendment)}
						isFirst={index === 0}
						isLast={index === queue.length - 1}
					/>
				</li>
			{/each}
		</ol>
	{/if}
</section>
