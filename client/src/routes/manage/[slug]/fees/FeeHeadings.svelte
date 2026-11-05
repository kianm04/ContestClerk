<script lang="ts">
	import { FEE_COLUMNS_CLASS } from '$lib/fee-list';

	/** The column headings, in the order of the cells in `FeeRow`. */
	const HEADINGS = [
		{ label: 'Fee', isNumber: false },
		{ label: 'Charged to', isNumber: false },
		{ label: 'Valid', isNumber: false },
		{ label: 'Amount', isNumber: true }
	];
</script>

<!--
	The headings over the fee rows, shown from `lg` up, where the rows line up
	as a table. They share their columns with every row through
	`FEE_COLUMNS_CLASS`. `aria-hidden` keeps a screen reader from reading them
	out on their own: every cell of a row makes sense by itself.
-->
<div
	aria-hidden="true"
	class="hidden border-b border-border text-small font-medium text-muted-foreground lg:grid {FEE_COLUMNS_CLASS}"
>
	<!-- The empty heading over the drag handles. -->
	<span></span>
	<!-- The headings never change, so each one's own words are its key. -->
	{#each HEADINGS as heading (heading.label)}
		<span class="px-3 py-2.5 {heading.isNumber ? 'text-right' : ''}">{heading.label}</span>
	{/each}
	<!-- The empty heading over each row's "Edit" and delete buttons. -->
	<span></span>
</div>
