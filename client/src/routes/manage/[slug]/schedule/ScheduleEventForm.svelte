<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { ScheduleCommittee } from '$lib/schedule';
	import { type ScheduleEventFormErrors, type ScheduleEventFormValues } from '$lib/schedule-form';
	import { manageScheduleUrl } from '$lib/urls';
	import ScheduleEventFields from './ScheduleEventFields.svelte';

	type Props = {
		/** What the fields show: a new event, the event being edited, or what was typed. */
		values: ScheduleEventFormValues;
		/** One message per field that has something wrong with it. */
		errors: ScheduleEventFormErrors;
		/** The committees an event for one committee can be for. */
		committees: ScheduleCommittee[];
		/** False for somebody who edits their own committees' programme only. */
		canEditWholeProgramme: boolean;
		/** The conference's timezone, which both times are typed in. */
		timezone: string;
		/** The open day, which "Cancel" goes back to. */
		activeDay: string;
		conferenceSlug: string;
	};

	let {
		values,
		errors,
		committees,
		canEditWholeProgramme,
		timezone,
		activeDay,
		conferenceSlug
	}: Props = $props();

	// `$derived` works these out again whenever the props change.
	const isEditing = $derived(values.eventId !== '');
	const heading = $derived(isEditing ? 'Edit event' : 'Add event');
	const cancelHref = $derived(manageScheduleUrl(conferenceSlug, { day: activeDay }));
	const duplicateAction = $derived(`?/duplicateToNextDay&eventId=${values.eventId}`);

	/*
		Sends the form in the background and redraws the page without reloading
		it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
		form over; without JavaScript it posts and reloads the page as before. A
		save closes this form entirely: both actions redirect to the day the
		event now falls on with `?edit=` and `?new=` gone, so there is nothing
		left here to empty.
	*/
	const inPlaceForm = createInPlaceForm();
</script>

<!--
	An ordinary HTML form, so adding and editing an event work with JavaScript
	switched off. The line above it separates it from the day's events.

	`group` and `group-has-[…]` are what show the committee picker only while
	"One committee" is chosen, with no JavaScript at all: the picker is hidden
	unless the form has an audience option that is selected (`:checked`) whose
	value is `committee`. The browser works that out itself on every change.
-->
<form
	method="post"
	action="?/saveEvent"
	class="group mt-8 border-t border-border"
	use:enhance={inPlaceForm.submit}
>
	<FormSection
		title={heading}
		description="One event on the programme, for everyone or for one committee."
	>
		<input type="hidden" name="eventId" value={values.eventId} />

		<ScheduleEventFields {values} {errors} {committees} {canEditWholeProgramme} {timezone} />

		<FormActions>
			<Button label="Cancel" variant="secondary" size="dense" href={cancelHref} />
			{#if isEditing}
				<!-- `skipsValidation` lets the copy go ahead even while a box above is
				half typed, because duplicating copies what is saved, not the form. -->
				<Button
					label="Duplicate to next day"
					variant="secondary"
					size="dense"
					formaction={duplicateAction}
					skipsValidation
					isLoading={inPlaceForm.isSending(duplicateAction)}
				/>
			{/if}
			<Button
				label="Save event"
				variant="primary"
				size="dense"
				type="submit"
				isLoading={inPlaceForm.isSending('?/saveEvent')}
			/>
		</FormActions>
	</FormSection>
</form>
