<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { DENSE_LABEL_CLASSES, fieldErrorId } from '$lib/form-fields';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { ScheduleCommittee } from '$lib/schedule';
	import {
		EVENT_LOCATION_MAX_LENGTH,
		EVENT_TITLE_MAX_LENGTH,
		SCHEDULE_TIME_STEP_SECONDS,
		type CommitteeSessionsFormErrors,
		type CommitteeSessionsFormValues
	} from '$lib/schedule-form';
	import { manageScheduleUrl } from '$lib/urls';

	type Props = {
		/** What the fields show: the defaults, or what was typed before a refusal. */
		values: CommitteeSessionsFormValues;
		errors: CommitteeSessionsFormErrors;
		/** Every committee of the conference, one tick box each. */
		committees: ScheduleCommittee[];
		/** The conference's timezone, which the times are typed in. */
		timezone: string;
		/** The open day, which "Cancel" goes back to. */
		activeDay: string;
		conferenceSlug: string;
	};

	let { values, errors, committees, timezone, activeDay, conferenceSlug }: Props = $props();

	const timeHelp = $derived(`In ${timezone}.`);
	const cancelHref = $derived(manageScheduleUrl(conferenceSlug, { day: activeDay }));

	/*
		Sends the form in the background and redraws the page without reloading
		it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
		form over; without JavaScript it posts and reloads the page as before. A
		save closes this form entirely: the redirect drops `?sessions=1`, so
		there is nothing left here to empty.
	*/
	const inPlaceForm = createInPlaceForm();
</script>

<!--
	An ordinary HTML form: every ticked box sends its own `committeeIds` field.
	The line above it separates it from the day's events.
-->
<form
	method="post"
	action="?/addCommitteeSessions"
	class="mt-8 border-t border-border"
	use:enhance={inPlaceForm.submit}
>
	<FormSection
		title="Add committee sessions"
		description="One event for every ticked committee, for that committee only."
	>
		<div class="grid gap-5 md:grid-cols-2">
			<TextField
				isDense
				label="Title"
				name="titlePattern"
				value={values.titlePattern}
				error={errors.titlePattern}
				help={'{n} becomes each committee’s session number.'}
				isRequired
				maxLength={EVENT_TITLE_MAX_LENGTH}
			/>
			<TextField
				isDense
				label="Location"
				name="locationPattern"
				value={values.locationPattern}
				error={errors.locationPattern}
				help={'{room} becomes each committee’s room, or TBA.'}
				maxLength={EVENT_LOCATION_MAX_LENGTH}
			/>
		</div>

		<div class="grid gap-5 md:grid-cols-3">
			<TextField label="Day" name="day" type="date" value={values.day} isRequired isDense />
			<TextField
				isDense
				label="Starts"
				name="startTime"
				type="time"
				value={values.startTime}
				error={errors.startsAt}
				help={timeHelp}
				isRequired
				step={SCHEDULE_TIME_STEP_SECONDS}
			/>
			<TextField
				isDense
				label="Ends"
				name="endTime"
				type="time"
				value={values.endTime}
				error={errors.endsAt}
				isRequired
				step={SCHEDULE_TIME_STEP_SECONDS}
			/>
		</div>

		<fieldset aria-describedby={errors.committeeIds ? fieldErrorId('committeeIds') : undefined}>
			<legend class={DENSE_LABEL_CLASSES}>Committees</legend>
			<ul class="grid gap-1 md:grid-cols-2">
				<!-- The `(committee.id)` key lets Svelte reuse list items instead of rebuilding them. -->
				{#each committees as committee (committee.id)}
					<li>
						<label class="flex min-h-10 items-center gap-3 text-dense text-foreground">
							<input
								type="checkbox"
								name="committeeIds"
								value={committee.id}
								checked={values.committeeIds.includes(committee.id)}
								class="h-5 w-5 rounded border-border text-link"
							/>
							{committee.name}
						</label>
					</li>
				{/each}
			</ul>
			<FieldError id={fieldErrorId('committeeIds')} message={errors.committeeIds} />
		</fieldset>

		<FormActions>
			<Button label="Cancel" variant="secondary" size="dense" href={cancelHref} />
			<Button
				label="Add sessions"
				variant="primary"
				size="dense"
				type="submit"
				isLoading={inPlaceForm.isBusy}
			/>
		</FormActions>
	</FormSection>
</form>
