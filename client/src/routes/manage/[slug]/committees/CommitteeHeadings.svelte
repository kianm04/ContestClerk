<script lang="ts">
	import { COMMITTEE_COLUMNS_CLASS } from '$lib/committee-list';

	/** The column headings, in the order of the cells in `CommitteeRow`. */
	const HEADINGS = [
		{ label: 'Committee', isNumber: false },
		{ label: 'Level', isNumber: false },
		{ label: 'Topics', isNumber: true },
		{ label: 'Seats', isNumber: true },
		{ label: 'Chairs', isNumber: false },
		{ label: 'Background guide', isNumber: false }
	];
</script>

<!--
	The headings over the committee rows, shown from `xl` up, where the rows
	line up as a table. They share their columns with every row through
	`COMMITTEE_COLUMNS_CLASS`. `aria-hidden` keeps a screen reader from reading
	them out on their own: each cell of a row says what it holds itself.
-->
<div
	aria-hidden="true"
	class="hidden border-b border-border text-small font-medium text-muted-foreground xl:grid {COMMITTEE_COLUMNS_CLASS}"
>
	<!-- The empty heading over the drag handles. -->
	<span></span>
	<!-- The headings never change, so each one's own words are its key. -->
	{#each HEADINGS as heading (heading.label)}
		<span class="px-3 py-2.5 {heading.isNumber ? 'text-right' : ''}">{heading.label}</span>
	{/each}
</div>
