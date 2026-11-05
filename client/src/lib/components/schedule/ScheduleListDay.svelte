<script lang="ts">
	import CalendarDayName from './CalendarDayName.svelte';
	import type { ScheduleEvent } from '$lib/schedule';
	import type { CalendarColumn } from '$lib/schedule-calendar';
	import type { RoomLink } from '$lib/schedule-rooms';
	import ScheduleListRow from './ScheduleListRow.svelte';

	type Props = {
		/** The day, with its events already in order (`calendarColumns`). */
		column: CalendarColumn;
		timezone: string;
		now: Date;
		badgeLabel: (event: ScheduleEvent) => string | null;
		/** The room each committee event links to, by event id. */
		roomLinks: Record<string, RoomLink>;
	};

	let { column, timezone, now, badgeLabel, roomLinks }: Props = $props();
</script>

<!--
	One day of the list: the date on the left, as over the calendar's columns,
	and the day's events beside it. Where the list is narrow, on a phone or in
	the conference page's programme, the date sits above them instead. The
	`@3xl:` classes ask how wide the list is (`ScheduleList`), not the window.
-->
<section
	aria-label="{column.labels.weekday} {column.labels.dayOfMonth}"
	class="flex flex-col not-first:border-t not-first:border-border @3xl:flex-row"
>
	<div
		class="flex shrink-0 items-center gap-3 px-4 pt-3 @3xl:w-54 @3xl:items-start @3xl:py-3 @3xl:pl-8"
	>
		<CalendarDayName labels={column.labels} isToday={column.isToday} />
	</div>

	{#if column.events.length === 0}
		<p class="flex-1 px-4 py-3 text-dense text-ink-600 @3xl:border-l @3xl:border-border">
			No events on this day.
		</p>
	{:else}
		<ul class="min-w-0 flex-1 @3xl:border-l @3xl:border-border">
			{#each column.events as placed (placed.event.id)}
				<ScheduleListRow
					event={placed.event}
					{timezone}
					{now}
					badgeLabel={badgeLabel(placed.event)}
					roomLink={roomLinks[placed.event.id] ?? null}
				/>
			{/each}
		</ul>
	{/if}
</section>
