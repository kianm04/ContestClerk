<script lang="ts">
	import Stat from '$lib/components/Stat.svelte';
	import { isEveryPaperApproved } from '$lib/chair-papers';
	import type { PaperStatusCounts } from '$lib/documents-page';

	type Props = {
		/** How many seated delegates are at each status, over every seat. */
		counts: PaperStatusCounts;
	};

	let { counts }: Props = $props();
</script>

<section aria-label="Paper counts" class="flex flex-col gap-2">
	<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
		<Stat label="Awaiting review" value={counts.submitted} />
		<Stat label="Approved" value={counts.approved} />
		<Stat label="Changes requested" value={counts.changes_requested} />
		<Stat label="Missing" value={counts.missing} />
	</div>

	{#if isEveryPaperApproved(counts)}
		<p class="text-small font-medium text-success-700">Every paper is approved.</p>
	{/if}
</section>
