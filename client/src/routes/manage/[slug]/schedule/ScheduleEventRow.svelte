<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Dropdown, { type DropdownItem } from '$lib/components/Dropdown.svelte';
	import { formatEventTime, type ScheduleEvent } from '$lib/schedule';
	import { scheduleAudienceText } from '$lib/schedule-audience';
	import { manageScheduleUrl } from '$lib/urls';

	type Props = {
		event: ScheduleEvent;
		/** The conference's timezone, which the times are shown in. */
		timezone: string;
		/** The open day, so that "Edit" keeps the reader on it. */
		activeDay: string;
		conferenceSlug: string;
		/** Sends "Delete" through the day list's instant form (`ScheduleDayList`, `+page.svelte`). */
		onDeleteEvent: SubmitFunction;
		/** False for an event the reader sees but may not change, which then shows no actions. */
		canChange: boolean;
	};

	let { event, timezone, activeDay, conferenceSlug, onDeleteEvent, canChange }: Props = $props();

	/*
		The menu posts "Duplicate to next day" with the event's id in the action's
		own address, because the menu is one small form shared by all its lines.
		Both forms add `view=list`, so the answer leaves the organiser on the list.
		`$derived` builds the lines again when the event changes.
	*/
	const menuItems: DropdownItem[] = $derived([
		{
			label: 'Edit',
			href: manageScheduleUrl(conferenceSlug, { day: activeDay, editEventId: event.id })
		},
		{
			label: 'Duplicate to next day',
			formaction: `?/duplicateToNextDay&eventId=${event.id}&view=list`
		}
	]);
</script>

<!--
	One flat line of the day: the time, the title with its place under it, who
	it is for, and the actions. `flex-wrap` drops who it is for and the actions
	under the title on a phone, where the four cannot share one line.
-->
<div class="flex min-h-15 flex-wrap items-center gap-x-4 gap-y-2 px-1 py-2 text-dense">
	<span class="w-28 shrink-0 text-foreground tabular-nums">{formatEventTime(event, timezone)}</span>
	<div class="min-w-0 flex-[1_1_12rem]">
		<p class="font-medium text-foreground">{event.title}</p>
		{#if event.location}
			<p class="text-small text-muted-foreground">{event.location}</p>
		{/if}
	</div>
	<span class="w-35 shrink-0 text-muted-foreground">{scheduleAudienceText(event)}</span>
	{#if canChange}
		<div class="flex items-center gap-2">
			<Dropdown label="Actions for {event.title}" icon={Ellipsis} items={menuItems} isQuiet />
			<!-- Delete sits beside the menu rather than in it: `ConfirmButton` is a
			form of its own, and a form cannot sit inside the menu's form. The id
			travels inside the dialog, which a closed dialog still sends, so no empty
			line above the button pushes it out of line with the menu (T137). It is a
			grey bin that turns red under the pointer; "Delete" is its name. -->
			<ConfirmButton
				label="Delete"
				confirmTitle="Delete this event?"
				confirmText="It disappears from every schedule. Nobody is notified."
				formaction="?/deleteEvent&view=list"
				variant="quiet-danger"
				size="dense-sm"
				icon={Trash2}
				areFieldsInDialog
				onSubmit={onDeleteEvent}
			>
				<input type="hidden" name="eventId" value={event.id} />
			</ConfirmButton>
		</div>
	{/if}
</div>
