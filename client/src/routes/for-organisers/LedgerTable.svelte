<script lang="ts">
	import { LEDGER_ROWS } from '$lib/organiser-start';
	import LedgerTableRow from './LedgerTableRow.svelte';
</script>

<!--
	The ledger on a desktop: a white card with a pale blue header row and one
	link per job under it. The four columns are the job, what it usually runs
	on, where it lives on MUNMeet, and the arrow; every row repeats the same
	`grid-cols-[…]` so the columns line up down the card.

	The header row is only a picture of the columns' names: each row says
	"Usually" and "On MUNMeet" to screen readers itself, so the header is hidden
	from them. The rows are a list, so a screen reader announces how many there
	are. Two rows link to the same chapter, so the `{#each}` key is the job.
-->
<div class="overflow-hidden rounded-xl bg-surface shadow-card">
	<div
		aria-hidden="true"
		class="grid grid-cols-[13rem_minmax(0,1fr)_minmax(0,1.25fr)_3rem] bg-brand-50 text-caption font-medium text-ink-600"
	>
		<span class="px-5 py-2.5">The job</span>
		<span class="px-5 py-2.5">Usually</span>
		<span class="relative px-5 py-2.5 text-ink-900">
			<span class="absolute inset-y-0 left-0 w-0.5 bg-brand-100"></span>
			On MUNMeet
		</span>
		<span></span>
	</div>

	<ul>
		{#each LEDGER_ROWS as row, index (row.job)}
			<li class="border-t border-neutral-100">
				<LedgerTableRow {row} {index} />
			</li>
		{/each}
	</ul>
</div>
