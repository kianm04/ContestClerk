<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';
	import type { ScheduleEvent } from '$lib/schedule';
	import type { CalendarColumn, CalendarHours } from '$lib/schedule-calendar';
	import CalendarDayColumn, { type DetailsSide } from './CalendarDayColumn.svelte';
	import CalendarDayHeader from './CalendarDayHeader.svelte';
	import CalendarHourGutter from './CalendarHourGutter.svelte';

	type Props = {
		/** One column per day, built by `calendarColumns` in `$lib/schedule-calendar.ts`. */
		columns: CalendarColumn[];
		hours: CalendarHours;
		timezone: string;
		now: Date;
		/** The event whose details are open, from `?event=`, or `null`. */
		openEventId: string | null;
		eventHref: (event: ScheduleEvent) => ResolvedPathname;
		badgeLabel: (event: ScheduleEvent) => string | null;
		/** The open event's details, which the page draws and this places beside its block. */
		children?: Snippet;
	};

	let { columns, hours, timezone, now, openEventId, eventHref, badgeLabel, children }: Props =
		$props();

	// Where now sits down the side, taken from today's column when today is shown.
	const nowMinute = $derived(columns.find((column) => column.isToday)?.nowMinute ?? null);

	/**
	 * Which way an open event's details float: out to the right in the first
	 * half of the week, to the left in the second, so they stay on the page. A
	 * single day is wide enough to hold them inside its own column.
	 */
	function detailsSide(index: number): DetailsSide {
		if (columns.length === 1) {
			return 'inside';
		}

		return index >= columns.length / 2 ? 'left' : 'right';
	}

	const gridHeight = $derived(
		`height: calc(var(--grid-top) * 2 + var(--hour-height) * ${hours.lastHour - hours.firstHour})`
	);
</script>

<!--
	The week: day names along the top, hours down the side, and a column per day
	that the events are placed in. `--hour-height` is how tall an hour is drawn,
	taller on a phone where a single day has the whole width; `--grid-top` keeps
	the first hour's label from being cut off at the top. Every block, line and
	label below works its place out from these two.
-->
<div class="[--grid-top:12px] [--hour-height:64px] md:[--hour-height:48px]">
	<CalendarDayHeader {columns} />

	<div class="flex" style={gridHeight}>
		<CalendarHourGutter {hours} {nowMinute} {now} {timezone} />
		{#each columns as column, index (column.day)}
			<CalendarDayColumn
				{column}
				{hours}
				{timezone}
				{now}
				{openEventId}
				detailsSide={detailsSide(index)}
				{eventHref}
				{badgeLabel}
				{children}
			/>
		{/each}
	</div>
</div>
