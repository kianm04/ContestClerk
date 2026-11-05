<!--
	`<script module>` runs once for the file rather than once per column, and is
	where a type other files import from this component lives.
-->
<script lang="ts" module>
	/** Which way an open event's details float from its block on a desktop. */
	export type DetailsSide = 'right' | 'left' | 'inside';

	/** The classes that place the details on each side. */
	const DETAILS_SIDE_CLASSES: Record<DetailsSide, string> = {
		right: 'md:left-[calc(100%-4px)]',
		left: 'md:right-[calc(100%+8px)]',
		inside: 'md:right-4'
	};
</script>

<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { Snippet } from 'svelte';
	import type { ScheduleEvent } from '$lib/schedule';
	import {
		hoursFromTop,
		type CalendarColumn,
		type CalendarHours,
		type PlacedEvent
	} from '$lib/schedule-calendar';
	import CalendarDayLines from './CalendarDayLines.svelte';
	import CalendarEventBlock from './CalendarEventBlock.svelte';

	type Props = {
		column: CalendarColumn;
		hours: CalendarHours;
		timezone: string;
		now: Date;
		/** The event whose details are open, or `null`. */
		openEventId: string | null;
		/** Which way the open event's details float, which the grid chooses by the column's place. */
		detailsSide: DetailsSide;
		/** The address that opens one event's details. */
		eventHref: (event: ScheduleEvent) => ResolvedPathname;
		/** The words on an event's badge, or `null` for none. */
		badgeLabel: (event: ScheduleEvent) => string | null;
		/** The open event's details, drawn beside its block. */
		children?: Snippet;
	};

	let {
		column,
		hours,
		timezone,
		now,
		openEventId,
		detailsSide,
		eventHref,
		badgeLabel,
		children
	}: Props = $props();

	const openPlaced: PlacedEvent | undefined = $derived(
		column.events.find((placed) => placed.event.id === openEventId)
	);

	/**
	 * Where the open event's details sit: level with the top of its block, or,
	 * for an event late in the day, level with its foot so they do not run off
	 * the bottom of the calendar. They are handed over as CSS variables, which
	 * only the desktop's `md:` classes read, so a phone's sheet ignores them.
	 */
	function detailsPosition(placed: PlacedEvent): string {
		const isLate = hoursFromTop(placed.startMinute, hours) > (hours.lastHour - hours.firstHour) / 2;
		const anchor = isLate ? placed.endMinute : placed.startMinute;
		const top = `--details-top: calc(var(--grid-top) + var(--hour-height) * ${hoursFromTop(anchor, hours)})`;

		return `${top}; --details-shift: ${isLate ? '-100%' : '0px'}`;
	}
</script>

<!--
	One day of the calendar. `relative` makes it the frame the event blocks are
	placed in with `absolute`. On a phone only the open day's column is shown;
	the strip of days above the calendar switches between them.
-->
<div
	role="group"
	aria-label="{column.labels.weekday} {column.labels.dayOfMonth}"
	class="relative min-w-0 flex-1 border-l border-border {column.isActive ? '' : 'max-md:hidden'}"
>
	<CalendarDayLines {hours} nowMinute={column.nowMinute} />

	{#each column.events as placed (placed.event.id)}
		<CalendarEventBlock
			{placed}
			{hours}
			{timezone}
			{now}
			href={eventHref(placed.event)}
			isOpen={placed.event.id === openEventId}
			badgeLabel={badgeLabel(placed.event)}
		/>
	{/each}

	{#if openPlaced && children}
		<!--
			The details float beside the block on a desktop, on the side the grid
			chose. On a phone they are a sheet along the foot of the screen instead (`EventDetails`), so this frame lets go of them.
		-->
		<div
			class="z-10 md:absolute md:top-(--details-top) md:w-91 md:translate-y-(--details-shift) {DETAILS_SIDE_CLASSES[
				detailsSide
			]}"
			style={detailsPosition(openPlaced)}
		>
			{@render children()}
		</div>
	{/if}
</div>
