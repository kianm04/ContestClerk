<script lang="ts">
	import SelectField from '$lib/components/SelectField.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import type { ScheduleCommittee } from '$lib/schedule';
	import {
		AUDIENCE_OPTIONS,
		EVENT_DESCRIPTION_MAX_LENGTH,
		EVENT_LOCATION_MAX_LENGTH,
		EVENT_TITLE_MAX_LENGTH,
		SCHEDULE_TIME_STEP_SECONDS,
		type ScheduleEventFormErrors,
		type ScheduleEventFormValues
	} from '$lib/schedule-form';

	type Props = {
		/** What the fields show: a new event, the event being edited, or what was typed. */
		values: ScheduleEventFormValues;
		/** One message per field that has something wrong with it. */
		errors: ScheduleEventFormErrors;
		/** The committees an event for one committee can be for: every one, or the reader's own. */
		committees: ScheduleCommittee[];
		/** False for somebody who edits their own committees' programme only. */
		canEditWholeProgramme: boolean;
		/** The conference's timezone, which both times are typed in. */
		timezone: string;
	};

	let { values, errors, committees, canEditWholeProgramme, timezone }: Props = $props();

	// Somebody who edits their own committees' programme is offered "One
	// committee" only, and the server refuses anything else they post.
	const audienceOptions = $derived(
		canEditWholeProgramme
			? AUDIENCE_OPTIONS
			: AUDIENCE_OPTIONS.filter((option) => option.value === 'committee')
	);

	const timeHelp = $derived(`In ${timezone}.`);
	const committeeOptions = $derived(
		committees.map((committee) => ({ value: committee.id, label: committee.name }))
	);
</script>

<TextField
	isDense
	label="Title"
	name="title"
	value={values.title}
	error={errors.title}
	isRequired
	maxLength={EVENT_TITLE_MAX_LENGTH}
/>

<div class="grid gap-5 md:grid-cols-2">
	<TextField
		isDense
		label="Starts"
		name="startsAt"
		type="datetime-local"
		value={values.startsAt}
		error={errors.startsAt}
		help={timeHelp}
		isRequired
		step={SCHEDULE_TIME_STEP_SECONDS}
	/>
	<TextField
		isDense
		label="Ends"
		name="endsAt"
		type="datetime-local"
		value={values.endsAt}
		error={errors.endsAt}
		help={timeHelp}
		isRequired
		step={SCHEDULE_TIME_STEP_SECONDS}
	/>
</div>

<TextField
	isDense
	label="Location"
	name="location"
	value={values.location}
	error={errors.location}
	maxLength={EVENT_LOCATION_MAX_LENGTH}
/>

<!--
	`group-has-[…]` shows the committee picker only while "One committee" is
	chosen, with no JavaScript at all: it reads the `group` class on the form
	this component is rendered inside, which `ScheduleEventForm.svelte` sets.
-->
<div class="grid gap-5 md:grid-cols-2">
	<SelectField
		isDense
		label="Audience"
		name="audience"
		value={values.audience}
		error={errors.audience}
		options={audienceOptions}
		isRequired
	/>
	<div class="hidden group-has-[option[value=committee]:checked]:block">
		<SelectField
			isDense
			label="Committee"
			name="committeeId"
			value={values.committeeId}
			error={errors.committeeId}
			options={committeeOptions}
			placeholder="Pick the committee"
		/>
	</div>
</div>

<TextArea
	isDense
	label="Description"
	name="description"
	value={values.description}
	error={errors.description}
	maxLength={EVENT_DESCRIPTION_MAX_LENGTH}
/>
