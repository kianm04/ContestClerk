<script lang="ts">
	import CalendarGrid from '$lib/components/schedule/CalendarGrid.svelte';
	import ScheduleList from '$lib/components/schedule/ScheduleList.svelte';
	import { audienceBadgeLabel, type ScheduleEvent } from '$lib/schedule';
	import { calendarColumns, calendarHours } from '$lib/schedule-calendar';
	import { SAMPLE_CONFERENCE, SAMPLE_NOW, SAMPLE_SCHEDULE_EVENTS } from '$lib/styleguide-samples';
	import { styleguideUrl } from '$lib/urls';
	import Example from './Example.svelte';

	const timezone = SAMPLE_CONFERENCE.timezone;
	const hours = calendarHours(SAMPLE_SCHEDULE_EVENTS, timezone);

	// Two days, so the calendar shows a day with events beside an empty one.
	const columns = calendarColumns(['2026-11-14', '2026-11-15'], SAMPLE_SCHEDULE_EVENTS, {
		timezone,
		today: '2026-11-14',
		activeDay: '2026-11-14',
		startDate: '2026-11-14',
		endDate: '2026-11-15',
		now: SAMPLE_NOW,
		hours
	});

	/** The samples open nothing: every block leads back to the styleguide. */
	function eventHref() {
		return styleguideUrl();
	}

	function badgeLabel(event: ScheduleEvent) {
		return audienceBadgeLabel(event);
	}
</script>

<Example
	name="CalendarGrid"
	props="columns, hours, timezone, now, openEventId, eventHref, badgeLabel"
>
	<div class="rounded-control border border-border">
		<CalendarGrid
			{columns}
			{hours}
			{timezone}
			now={SAMPLE_NOW}
			openEventId={null}
			{eventHref}
			{badgeLabel}
		/>
	</div>
</Example>

<Example name="ScheduleList" props="columns, timezone, now, badgeLabel, roomLinks">
	<div class="rounded-control border border-border">
		<ScheduleList {columns} {timezone} now={SAMPLE_NOW} {badgeLabel} roomLinks={{}} />
	</div>
</Example>
