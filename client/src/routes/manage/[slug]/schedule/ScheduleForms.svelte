<script lang="ts">
	import type { ScheduleCommittee } from '$lib/schedule';
	import type {
		CommitteeSessionsFormErrors,
		CommitteeSessionsFormValues,
		ScheduleEventFormErrors,
		ScheduleEventFormValues
	} from '$lib/schedule-form';
	import AddCommitteeSessionsForm from './AddCommitteeSessionsForm.svelte';
	import ScheduleEventForm from './ScheduleEventForm.svelte';

	type Props = {
		/** The add or edit form's fields, or `null` while it is closed. */
		eventValues: ScheduleEventFormValues | null;
		eventErrors: ScheduleEventFormErrors;
		/** "Add committee sessions"'s fields, or `null` while it is closed. */
		sessionsValues: CommitteeSessionsFormValues | null;
		sessionsErrors: CommitteeSessionsFormErrors;
		committees: ScheduleCommittee[];
		/** False for somebody who edits their own committees' programme only. */
		canEditWholeProgramme: boolean;
		timezone: string;
		activeDay: string;
		conferenceSlug: string;
	};

	let {
		eventValues,
		eventErrors,
		sessionsValues,
		sessionsErrors,
		committees,
		canEditWholeProgramme,
		timezone,
		activeDay,
		conferenceSlug
	}: Props = $props();
</script>

<!-- Whichever of the two forms the address opened. On a phone the fields wrap under the form's title (`FormSection`). -->
{#if eventValues}
	<ScheduleEventForm
		values={eventValues}
		errors={eventErrors}
		{committees}
		{canEditWholeProgramme}
		{timezone}
		{activeDay}
		{conferenceSlug}
	/>
{/if}

{#if sessionsValues}
	<AddCommitteeSessionsForm
		values={sessionsValues}
		errors={sessionsErrors}
		{committees}
		{timezone}
		{activeDay}
		{conferenceSlug}
	/>
{/if}
