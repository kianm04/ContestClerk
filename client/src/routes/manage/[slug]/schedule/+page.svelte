<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import { rowsAfterPresses, type RowChange } from '$lib/row-changes';
	import type { ScheduleEvent } from '$lib/schedule';
	import {
		describeScheduleEventFailure,
		expectScheduleEventRowChange
	} from '$lib/schedule-event-presses';
	import { manageScheduleUrl } from '$lib/urls';
	import ManageScheduleCalendar from './ManageScheduleCalendar.svelte';
	import ScheduleDayList from './ScheduleDayList.svelte';
	import ScheduleDayTabs from './ScheduleDayTabs.svelte';
	import ScheduleForms from './ScheduleForms.svelte';
	import ManageScheduleHeader from './ManageScheduleHeader.svelte';
	import SchedulePublicityForm from './SchedulePublicityForm.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference comes from. `load`
	// runs again whenever the address changes, such as on a day or an event, and after
	// every action. `form` is what the last action returned: the ones that work
	// redirect instead, so `form` is always a refusal.
	let { data, form }: PageProps = $props();

	// `$derived` works each of these out again whenever `data` or `form` changes.
	// A refused post hands back everything that was typed, so nothing is lost.
	const eventValues = $derived(form?.eventValues ?? data.eventForm);
	const eventErrors = $derived(form?.eventErrors ?? {});
	const sessionsValues = $derived(form?.sessionsValues ?? data.sessionsForm);
	const sessionsErrors = $derived(form?.sessionsErrors ?? {});

	const slug = $derived(data.conference.slug);
	const timezone = $derived(data.conference.timezone);
	const addEventHref = $derived(
		manageScheduleUrl(slug, { day: data.activeDay, isAddingEvent: true })
	);

	/*
		Deleting an event is fully worked out in the browser (`$lib/schedule-event-presses.ts`),
		so the row disappears at once instead of waiting for the server (T142).
		Duplicating an event keeps its own in-place spinner in `ScheduleEventRow`'s
		menu: the copy's id and day both come from the server.
	*/
	const eventChangesForm = createInstantForm<RowChange<ScheduleEvent>[]>({
		describeFailure: describeScheduleEventFailure
	});
	const submitEventChangePress = eventChangesForm.submitExpecting(expectScheduleEventRowChange);
	const shownEvents = $derived(rowsAfterPresses(data.events, eventChangesForm.presses));
	const shownDayEvents = $derived(rowsAfterPresses(data.dayEvents, eventChangesForm.presses));

	// While a form is open it takes the programme's place, so it is never a scroll away.
	const isFormOpen = $derived(eventValues !== null || sessionsValues !== null);
</script>

<svelte:head>
	<title>Schedule · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageScheduleHeader
	conferenceSlug={slug}
	{timezone}
	activeDay={data.activeDay}
	isList={data.isList}
	hasCommittees={data.committees.length > 0}
/>

<div class="flex flex-col">
	{#if form?.message}
		<div class="mb-5">
			<Notice tone="error">{form.message}</Notice>
		</div>
	{/if}

	{#if isFormOpen}
		<ScheduleForms
			{eventValues}
			{eventErrors}
			{sessionsValues}
			{sessionsErrors}
			committees={data.committees}
			canEditWholeProgramme={data.canEditWholeProgramme}
			{timezone}
			activeDay={data.activeDay}
			conferenceSlug={slug}
		/>
	{:else if data.isList}
		<ScheduleDayTabs days={data.days} activeDay={data.activeDay} conferenceSlug={slug} />
		<ScheduleDayList
			events={shownDayEvents}
			{timezone}
			activeDay={data.activeDay}
			conferenceSlug={slug}
			onDeleteEvent={submitEventChangePress}
			readOnlyIds={data.readOnlyIds}
		/>
	{:else if shownEvents.length > 0}
		<ManageScheduleCalendar
			conference={data.conference}
			days={data.days.map((day) => day.day)}
			events={shownEvents}
			today={data.today}
			activeDay={data.activeDay}
			now={data.now}
			openEventId={data.openEventId}
			onDeleteEvent={submitEventChangePress}
			readOnlyIds={data.readOnlyIds}
		/>
	{:else}
		<EmptyState
			icon={CalendarDays}
			title="No events yet."
			description="Add an event, or add committee sessions for every committee at once."
			actionLabel="Add event"
			actionHref={addEventHref}
		/>
	{/if}

	<!-- Whether the programme is public is the whole programme's question. -->
	{#if data.canEditWholeProgramme}
		<SchedulePublicityForm isSchedulePublic={data.isSchedulePublic} />
	{/if}
</div>
