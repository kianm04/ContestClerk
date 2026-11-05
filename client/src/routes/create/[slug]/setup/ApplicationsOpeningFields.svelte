<script lang="ts">
	import { RadioGroup } from '$lib/components/ui/radio-group';
	import { hasChosenDates, type CreationDraft } from '$lib/creation-draft';
	import type { ApplicationsFormErrors, ApplicationsFormValues } from '$lib/creation-setup-forms';
	import { formatLongDay } from '$lib/creation-setup-status';
	import { fieldErrorId, fieldHelpId } from '$lib/form-fields';
	import { CLOSE_OFFSET_OPTIONS, relativeDeadlineInstant } from '$lib/relative-deadline';
	import ApplicationsOpenChoice from './ApplicationsOpenChoice.svelte';
	import ApplicationsOpeningMoment from './ApplicationsOpeningMoment.svelte';
	import DialogDatePicker from './DialogDatePicker.svelte';
	import DialogSelect from './DialogSelect.svelte';
	import SetupField from './SetupField.svelte';

	type Props = {
		values: ApplicationsFormValues;
		errors: ApplicationsFormErrors;
		draft: Pick<CreationDraft, 'startDate' | 'timezone' | 'prefillSources'>;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors, draft }: Props = $props();

	// Writable `$derived`: the choice the organiser makes now, starting from what is saved.
	let openMode = $derived<string>(values.openMode);
	let closeChoice = $derived(values.closeChoice);
	let closesOn = $derived(values.closesOn);

	const closeOptions = [...CLOSE_OFFSET_OPTIONS, { value: 'fixed', label: 'On a fixed date' }];

	/** "Closes on 2 April 2027.", worked out again as the offset changes. */
	const closingHelp = $derived.by(() => {
		if (closeChoice === 'fixed' || !hasChosenDates(draft)) return undefined;
		const closesAt = relativeDeadlineInstant(draft.startDate, Number(closeChoice), draft.timezone);
		return closesAt === null ? undefined : `Closes on ${formatLongDay(closesAt, draft.timezone)}.`;
	});
</script>

<!--
	The design offers two ways to open: on publishing, or on a day. A draft
	still set to open by hand ("manual", the server's fallback) shows neither
	chosen and keeps that setting until one is picked. shadcn's `RadioGroup`
	sends the choice as `openMode` in a hidden input.
-->
<fieldset class="mt-3.25">
	<legend class="fs-17 lh-22 font-semibold text-creation-ink-950">Applications open</legend>
	<RadioGroup
		name="openMode"
		bind:value={openMode}
		class="mt-1.75 grid-cols-1 gap-3 lg:grid-cols-[307fr_260fr] lg:gap-0"
	>
		<ApplicationsOpenChoice
			value="on_publish"
			label="When I publish"
			description="Applications will open when the conference is published."
			descriptionClass="lg:max-w-59.5"
		/>
		<ApplicationsOpenChoice
			value="scheduled"
			label="On a specific date"
			description="Choose a date and time for applications to open."
			descriptionClass="lg:max-w-56"
		/>
	</RadioGroup>
	{#if openMode === 'scheduled'}
		<ApplicationsOpeningMoment opensAt={values.opensAt} error={errors.opensAt} />
	{/if}
</fieldset>

<hr class="mt-4 border-creation-rule" />

<SetupField
	id="closeChoice"
	label="Applications close"
	isSection
	help={closingHelp}
	class="mt-2"
	controlClass="mt-0.5"
	helpClass="mt-0.5 fs-15 lh-18"
>
	<DialogSelect
		id="closeChoice"
		name="closeChoice"
		options={closeOptions}
		describedBy={closingHelp ? fieldHelpId('closeChoice') : undefined}
		bind:value={closeChoice}
	/>
</SetupField>
{#if closeChoice === 'fixed'}
	<SetupField id="closesOn" label="Closing day" error={errors.closesOn} class="mt-3">
		<DialogDatePicker
			id="closesOn"
			name="closesOn"
			describedBy={errors.closesOn ? fieldErrorId('closesOn') : undefined}
			bind:value={closesOn}
		/>
	</SetupField>
{/if}
