<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ResolvedPathname } from '$app/types';
	import type { ScheduleEvent } from '$lib/schedule';
	import {
		eventAudienceText,
		type CalendarColumn,
		type CalendarHours
	} from '$lib/schedule-calendar';
	import type { RoomLink } from '$lib/schedule-rooms';
	import CalendarGrid from './CalendarGrid.svelte';
	import EventDetails from './EventDetails.svelte';

	type Props = {
		columns: CalendarColumn[];
		hours: CalendarHours;
		timezone: string;
		now: Date;
		/** The event whose details are open, from `?event=`, or `null`. */
		openEvent: ScheduleEvent | null;
		/** The same page with the details closed. */
		closeHref: ResolvedPathname;
		eventHref: (event: ScheduleEvent) => ResolvedPathname;
		badgeLabel: (event: ScheduleEvent) => string | null;
		/** The room each committee event links to, by event id. */
		roomLinks: Record<string, RoomLink>;
		/** What an organiser can do to the open event, drawn at the foot of its details. */
		children?: Snippet;
	};

	let {
		columns,
		hours,
		timezone,
		now,
		openEvent,
		closeHref,
		eventHref,
		badgeLabel,
		roomLinks,
		children
	}: Props = $props();
</script>

<!--
	The calendar, and the open event's details beside its block. What goes
	between `<CalendarGrid>` and `</CalendarGrid>` reaches the grid as its
	`children`, and the grid draws it next to the open event.
-->
<CalendarGrid
	{columns}
	{hours}
	{timezone}
	{now}
	openEventId={openEvent?.id ?? null}
	{eventHref}
	{badgeLabel}
>
	{#if openEvent}
		<EventDetails
			event={openEvent}
			{timezone}
			{closeHref}
			audienceText={eventAudienceText(openEvent)}
			roomLink={roomLinks[openEvent.id] ?? null}
			{children}
		/>
	{/if}
</CalendarGrid>
