<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { ScheduleEvent } from '$lib/schedule';
	import { manageScheduleUrl } from '$lib/urls';

	type Props = {
		event: ScheduleEvent;
		/** The event's own day, so that "Edit" keeps the calendar on it. */
		day: string;
		conferenceSlug: string;
		/** Sends "Delete" through the page's instant form, which takes the block away at once. */
		onDeleteEvent: SubmitFunction;
	};

	let { event, day, conferenceSlug, onDeleteEvent }: Props = $props();

	// The copy's id and day come from the server, so "Duplicate" waits for it with a spinner.
	const duplicateForm = createInPlaceForm();
</script>

<!--
	What an organiser can do to the open event, under its details. Each action
	works without JavaScript: "Edit" is a link to `?edit=`, "Duplicate to next
	day" a form of its own, and "Delete" asks on the confirmation page first.
	The event's id travels in the duplicate form's address, as it does from a
	row's menu in the list.
-->
<div class="flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
	<Button
		label="Edit"
		variant="secondary"
		size="dense"
		href={manageScheduleUrl(conferenceSlug, { day, editEventId: event.id })}
	/>
	<!-- `use:enhance` hands the form to the helper above; without JavaScript it posts as usual. -->
	<form
		method="post"
		action="?/duplicateToNextDay&eventId={event.id}"
		use:enhance={duplicateForm.submit}
	>
		<Button
			label="Duplicate to next day"
			variant="secondary"
			size="dense"
			isLoading={duplicateForm.isBusy}
		/>
	</form>
	<ConfirmButton
		label="Delete"
		confirmTitle="Delete this event?"
		confirmText="It disappears from every schedule. Nobody is notified."
		formaction="?/deleteEvent"
		variant="quiet-danger"
		size="dense-sm"
		icon={Trash2}
		areFieldsInDialog
		onSubmit={onDeleteEvent}
	>
		<input type="hidden" name="eventId" value={event.id} />
	</ConfirmButton>
</div>
