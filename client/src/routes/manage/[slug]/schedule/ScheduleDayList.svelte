<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { ScheduleEvent } from '$lib/schedule';
	import { manageScheduleUrl } from '$lib/urls';
	import ScheduleEventRow from './ScheduleEventRow.svelte';

	type Props = {
		/** The events of the open day, earliest first. */
		events: ScheduleEvent[];
		/** The conference's timezone, which every time is shown in. */
		timezone: string;
		/** The open day, `YYYY-MM-DD`. */
		activeDay: string;
		conferenceSlug: string;
		/** Sends "Delete" through the page's instant form (`+page.svelte`), which shows the result at once. */
		onDeleteEvent: SubmitFunction;
		/** The events the reader sees but may not change. */
		readOnlyIds: string[];
	};

	let { events, timezone, activeDay, conferenceSlug, onDeleteEvent, readOnlyIds }: Props = $props();

	const addEventHref = $derived(
		manageScheduleUrl(conferenceSlug, { day: activeDay, isAddingEvent: true })
	);
</script>

{#if events.length === 0}
	<EmptyState
		icon={CalendarDays}
		title="No events on this day."
		description="Add an event, or add committee sessions for every committee at once."
		actionLabel="Add event"
		actionHref={addEventHref}
	/>
{:else}
	<!-- Flat lines on the white page, each with its own thin line under it. -->
	<ul>
		<!-- The `(event.id)` key lets Svelte reuse list items instead of rebuilding them. -->
		{#each events as event (event.id)}
			<li class="border-b border-border">
				<ScheduleEventRow
					{event}
					{timezone}
					{activeDay}
					{conferenceSlug}
					{onDeleteEvent}
					canChange={!readOnlyIds.includes(event.id)}
				/>
			</li>
		{/each}
	</ul>
{/if}
