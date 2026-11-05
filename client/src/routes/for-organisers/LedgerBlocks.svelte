<script lang="ts">
	import { LEDGER_ROWS } from '$lib/organiser-start';
	import LedgerBlock from './LedgerBlock.svelte';
</script>

<!--
	The ledger below `lg`: the same seven links, each a block of its own in one
	white card, with a hairline between them (`divide-y`). The rows are a list,
	so a screen reader announces how many there are. Two rows link to the same
	chapter, so the `{#each}` key is the job.
-->
<ul
	class="flex flex-col divide-y divide-neutral-100 overflow-hidden rounded-xl bg-surface shadow-card"
>
	{#each LEDGER_ROWS as row, index (row.job)}
		<li><LedgerBlock {row} {index} /></li>
	{/each}
</ul>
