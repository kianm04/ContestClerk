<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import CalendarDayStrip from '$lib/components/schedule/CalendarDayStrip.svelte';
	import ScheduleCalendar from '$lib/components/schedule/ScheduleCalendar.svelte';
	import { dayInTimezone } from '$lib/dates';
	import { audienceBadgeLabel, type ScheduleEvent } from '$lib/schedule';
	import { calendarColumns, calendarHours } from '$lib/schedule-calendar';
	import { manageScheduleUrl } from '$lib/urls';
	import ManageEventActions from './ManageEventActions.svelte';

	type Props = {
		conference: { slug: string; timezone: string; startDate: string; endDate: string };
		/** Every day the calendar shows, `YYYY-MM-DD`. */
		days: string[];
		/** Every event still on the programme, deleted ones already taken away. */
		events: ScheduleEvent[];
		today: string;
		/** The day a phone shows. */
		activeDay: string;
		now: Date;
		/** The event whose details are open, from `?event=`, or `null`. */
		openEventId: string | null;
		onDeleteEvent: SubmitFunction;
		/** The events the reader sees but may not change, whose details show no actions. */
		readOnlyIds: string[];
	};

	let {
		conference,
		days,
		events,
		today,
		activeDay,
		now,
		openEventId,
		onDeleteEvent,
		readOnlyIds
	}: Props = $props();

	// `$derived` works each of these out again whenever the props change.
	const slug = $derived(conference.slug);
	const timezone = $derived(conference.timezone);
	const hours = $derived(calendarHours(events, timezone));
	const columns = $derived(
		calendarColumns(days, events, {
			timezone,
			startDate: conference.startDate,
			endDate: conference.endDate,
			today,
			activeDay,
			now,
			hours
		})
	);
	// A deleted event's details close the moment its block goes.
	const openEvent = $derived(events.find((event) => event.id === openEventId) ?? null);

	/** The day an event starts on, which its details and its "Edit" open on. */
	function eventDay(event: ScheduleEvent) {
		return dayInTimezone(new Date(event.startsAt), timezone);
	}

	function eventHref(event: ScheduleEvent) {
		return manageScheduleUrl(slug, { day: eventDay(event), openEventId: event.id });
	}

	/** An organiser sees who every event is for. */
	function badgeLabel(event: ScheduleEvent) {
		return audienceBadgeLabel(event);
	}
</script>

<!-- On a phone the calendar shows one day at a time, picked from this strip. -->
<CalendarDayStrip {columns} dayHref={(day) => manageScheduleUrl(slug, { day })} />

<div class="-mx-4 border-y border-border md:mx-0 md:rounded-control md:border-x">
	<ScheduleCalendar
		{columns}
		{hours}
		{timezone}
		{now}
		{openEvent}
		closeHref={manageScheduleUrl(slug, { day: activeDay })}
		{eventHref}
		{badgeLabel}
		roomLinks={{}}
	>
		<!-- Shown only while `openEvent` is set, so it is never null in here, and
			only for an event the reader may change. -->
		{#if openEvent && !readOnlyIds.includes(openEvent.id)}
			<ManageEventActions
				event={openEvent}
				day={eventDay(openEvent)}
				conferenceSlug={slug}
				{onDeleteEvent}
			/>
		{/if}
	</ScheduleCalendar>
</div>
