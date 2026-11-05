<script lang="ts">
	import CalendarDayName from './CalendarDayName.svelte';
	import type { CalendarColumn } from '$lib/schedule-calendar';

	type Props = {
		/** The calendar's days, one heading over each column. */
		columns: CalendarColumn[];
	};

	let { columns }: Props = $props();
</script>

<!--
	The row of day names over the calendar on a desktop: the date in a circle,
	filled dark blue for today, then the weekday and "Day 2". A phone has its
	strip of days instead (`CalendarDayStrip`). The empty first cell sits over
	the hours down the side.
-->
<div class="flex border-b border-border max-md:hidden">
	<div class="w-18 shrink-0"></div>
	{#each columns as column (column.day)}
		<div class="flex min-w-0 flex-1 items-center gap-3 border-l border-border px-3 py-3">
			<CalendarDayName labels={column.labels} isToday={column.isToday} />
		</div>
	{/each}
</div>
