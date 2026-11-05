<script lang="ts">
	import { SEAT_COLUMNS_CLASS } from '$lib/committee-editor';

	/** The column headings, in the order of the cells in `SeatRow`. */
	const HEADINGS = ['Seat', 'Kind', 'Held by'];
</script>

<!--
	The headings over the seat rows, shown from `sm` up, where the rows line up
	as a table. They share their columns with every row through
	`SEAT_COLUMNS_CLASS`. `aria-hidden` keeps a screen reader from reading them
	out on their own: each row says what it holds itself.

	They sit outside the list's `<ul>`, because the dragging helper treats
	every row inside it as one that can be dragged.
-->
<div
	aria-hidden="true"
	class="hidden border-b border-border text-small font-medium text-muted-foreground sm:grid {SEAT_COLUMNS_CLASS}"
>
	<!-- The empty heading over the drag handles and arrows. -->
	<span></span>
	<!-- A list of plain words has no ids, so each heading is keyed by its position. -->
	{#each HEADINGS as heading, index (index)}
		<span class="px-3 py-2.5">{heading}</span>
	{/each}
	<!-- The empty heading over the buttons. -->
	<span></span>
</div>
