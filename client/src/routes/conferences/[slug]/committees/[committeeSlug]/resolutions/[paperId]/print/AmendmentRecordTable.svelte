<script lang="ts">
	import type { RecordedAmendment } from '$lib/amendment-record';

	type Props = {
		/** Every amendment the committee decided, by number (`recordedAmendments`). */
		amendments: RecordedAmendment[];
	};

	let { amendments }: Props = $props();

	// The cells of the drawn table: a grey rule under each row, the words at the top of the row.
	const cellClasses = 'border-b border-border py-2 pr-3 text-left align-top';
	const headerClasses = 'border-b border-foreground py-2 pr-3 text-left font-semibold';
</script>

<!--
	The record copy's "Amendments" table, as drawn between the text and the
	printed line: a section title on its black rule, then one row for each
	amendment and how it ended. It is a table on paper too, so it is the same
	on a phone, where the words wrap within their columns.
-->
<h2 class="mt-10 border-b border-foreground pb-2 font-display text-h2">Amendments</h2>
<table class="w-full border-collapse text-[0.875rem]/5">
	<thead>
		<tr>
			<th scope="col" class="{headerClasses} w-7 text-right">No.</th>
			<th scope="col" class="{headerClasses} pl-3">Proposed by</th>
			<th scope="col" class={headerClasses}>Amendment</th>
			<th scope="col" class={headerClasses}>Outcome</th>
		</tr>
	</thead>
	<tbody>
		<!-- `(amendment.id)` keys each row to its amendment, so Svelte tells them apart. -->
		{#each amendments as amendment (amendment.id)}
			<tr>
				<td class="{cellClasses} text-right tabular-nums">{amendment.sequence}</td>
				<td class="{cellClasses} pl-3 whitespace-nowrap">{amendment.proposedBy}</td>
				<td class={cellClasses}>{amendment.words}</td>
				<td class={cellClasses}>{amendment.outcome}</td>
			</tr>
		{/each}
	</tbody>
</table>
