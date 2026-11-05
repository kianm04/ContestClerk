<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import CalendarDayStrip from '$lib/components/schedule/CalendarDayStrip.svelte';
	import ScheduleCalendar from '$lib/components/schedule/ScheduleCalendar.svelte';
	import ScheduleList from '$lib/components/schedule/ScheduleList.svelte';
	import YourRoomStrip from '$lib/components/schedule/YourRoomStrip.svelte';
	import { audienceBadgeLabel, showsAudienceBadge, type ScheduleEvent } from '$lib/schedule';
	import { dayInTimezone } from '$lib/dates';
	import { calendarColumns, calendarHours, roomStatusText } from '$lib/schedule-calendar';
	import { scheduleSwitchItems } from '$lib/schedule-conference';
	import { conferenceScheduleUrl } from '$lib/urls';
	import ScheduleTitleRow from './ScheduleTitleRow.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned. It is replaced
	// with fresh results every time the URL changes, such as when a day is
	// picked or an event's details are opened.
	let { data }: PageProps = $props();

	// `$derived` works each of these out again whenever `data` changes.
	const slug = $derived(data.conference.slug);
	const timezone = $derived(data.conference.timezone);
	const hours = $derived(calendarHours(data.events, timezone));
	const columns = $derived(
		calendarColumns(
			data.days.map((day) => day.day),
			data.events,
			{ ...data.conference, today: data.today, activeDay: data.activeDay, now: data.now, hours }
		)
	);
	const openEvent = $derived(data.events.find((event) => event.id === data.openEventId) ?? null);
	const switchItems = $derived(scheduleSwitchItems(data.myConferences, slug));
	const roomLines = $derived(
		data.yourRooms.map((link) => ({
			link,
			status: roomStatusText(link.committeeId, data.events, data.now, timezone)
		}))
	);

	/** Opens one event's details, on its own day so a phone shows it too. */
	function eventHref(event: ScheduleEvent) {
		const day = dayInTimezone(new Date(event.startsAt), timezone);

		return conferenceScheduleUrl(slug, { day, openEventId: event.id });
	}

	/** A delegate sees a badge on their committee's events; staff see one on every event. */
	function badgeLabel(event: ScheduleEvent): string | null {
		return showsAudienceBadge(event, data.showsEveryAudience) ? audienceBadgeLabel(event) : null;
	}
</script>

<svelte:head>
	<title>Schedule · {data.conference.name} · MUNMeet</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<ScheduleTitleRow
		conference={data.conference}
		{switchItems}
		calendarHref={conferenceScheduleUrl(slug, { day: data.activeDay })}
		listHref={conferenceScheduleUrl(slug, { isList: true })}
		isList={data.isList}
	/>

	{#if data.hasEvents}
		<!-- On a phone the calendar shows one day at a time, picked from this strip. -->
		{#if !data.isList}
			<CalendarDayStrip {columns} dayHref={(day) => conferenceScheduleUrl(slug, { day })} />
		{/if}

		<!-- The programme in one frame: the way into the reader's room along its top. -->
		<div class="-mx-4 border-y border-border md:mx-0 md:rounded-control md:border-x">
			<YourRoomStrip rooms={roomLines} />

			{#if data.isList}
				<ScheduleList
					{columns}
					{timezone}
					now={data.now}
					{badgeLabel}
					roomLinks={data.eventRoomLinks}
				/>
			{:else}
				<ScheduleCalendar
					{columns}
					{hours}
					{timezone}
					now={data.now}
					{openEvent}
					closeHref={conferenceScheduleUrl(slug, { day: data.activeDay })}
					{eventHref}
					{badgeLabel}
					roomLinks={data.eventRoomLinks}
				/>
			{/if}
		</div>
	{:else}
		<!-- A room can be open on the day even before the programme is published. -->
		<YourRoomStrip rooms={roomLines} />
		<EmptyState
			icon={CalendarDays}
			title="The organisers have not published a programme yet."
			description="Events appear here once the organisers add them."
		/>
	{/if}
</div>
