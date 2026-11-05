<script lang="ts">
	import type { ScheduleEvent } from '$lib/schedule';
	import type { CalendarColumn } from '$lib/schedule-calendar';
	import type { RoomLink } from '$lib/schedule-rooms';
	import ScheduleListDay from './ScheduleListDay.svelte';

	type Props = {
		/** One entry per day, the same as the calendar's columns (`calendarColumns`). */
		columns: CalendarColumn[];
		timezone: string;
		/** The moment the page was drawn, which decides what is over and what is on now. */
		now: Date;
		badgeLabel: (event: ScheduleEvent) => string | null;
		/** The room each committee event links to, by event id. */
		roomLinks: Record<string, RoomLink>;
	};

	let { columns, timezone, now, badgeLabel, roomLinks }: Props = $props();
</script>

<!--
	The programme as a list, a day at a time, for reading or printing rather
	than placing in time. `@container` lets the days and rows inside lay
	themselves out by the list's own width, so the same list fits the full
	schedule and the narrower programme on a conference's page.
-->
<div class="@container">
	{#each columns as column (column.day)}
		<ScheduleListDay {column} {timezone} {now} {badgeLabel} {roomLinks} />
	{/each}
</div>
