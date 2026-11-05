<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Section from '$lib/components/Section.svelte';
	import ScheduleList from '$lib/components/schedule/ScheduleList.svelte';
	import { dayInTimezone } from '$lib/dates';
	import { groupEventsByDay, type ScheduleEvent } from '$lib/schedule';
	import { calendarColumns, calendarHours } from '$lib/schedule-calendar';
	import { conferenceScheduleUrl } from '$lib/urls';

	type Props = {
		/** The public programme: `everyone` events only, earliest first. */
		events: ScheduleEvent[];
		conference: { slug: string; timezone: string; startDate: string; endDate: string };
		/** The moment the page was drawn, which decides which events are over. */
		now: Date;
		/**
		 * Where "Announcements" beside "Full schedule" goes, or `null` to leave it
		 * out. Only a participant or a member of staff gets one.
		 */
		announcementsHref: ResolvedPathname | null;
	};

	let { events, conference, now, announcementsHref }: Props = $props();

	/*
		The same list as the full schedule's (`?view=list`), with only the days
		that have something on. `$derived` builds it again whenever the events
		change. A visitor sees only events for everybody, so no event carries an
		audience badge, and no event leads into a committee's room.
	*/
	const columns = $derived(
		calendarColumns(
			groupEventsByDay(events, conference.timezone).map((group) => group.day),
			events,
			{
				timezone: conference.timezone,
				startDate: conference.startDate,
				endDate: conference.endDate,
				today: dayInTimezone(now, conference.timezone),
				activeDay: '',
				now,
				hours: calendarHours(events, conference.timezone)
			}
		)
	);
</script>

<Section
	title="Programme"
	icon={Calendar}
	description="All times {conference.timezone}"
	viewAllHref={conferenceScheduleUrl(conference.slug)}
	viewAllLabel="Full schedule"
	extraLinkHref={announcementsHref ?? undefined}
	extraLinkLabel="Announcements"
>
	<div class="-mx-4 border-y border-border md:mx-0 md:rounded-control md:border-x">
		<ScheduleList
			{columns}
			timezone={conference.timezone}
			{now}
			badgeLabel={() => null}
			roomLinks={{}}
		/>
	</div>
</Section>
