<script lang="ts">
	import { MAX_COMMITTEE_PREFERENCES } from '$lib/application-form-settings';
	import type { ApplicationsFormErrors, ApplicationsFormValues } from '$lib/creation-setup-forms';
	import { fieldHelpId } from '$lib/form-fields';
	import ApplicationsToggle from './ApplicationsToggle.svelte';
	import DialogSelect from './DialogSelect.svelte';
	import SetupField from './SetupField.svelte';

	type Props = {
		values: ApplicationsFormValues;
		errors: ApplicationsFormErrors;
		/** Applicants rank committees, so the choice waits until there are some. */
		committeeCount: number;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors, committeeCount }: Props = $props();

	// 0 to 3, as the dropdown lists them.
	const preferenceOptions = Array.from({ length: MAX_COMMITTEE_PREFERENCES + 1 }, (_, count) => ({
		value: String(count),
		label: count === 0 ? 'None' : count === 1 ? '1 preference' : `${count} preferences`
	}));

	// Writable `$derived`: the count chosen now, starting from what is saved,
	// so the help line under the dropdown follows the choice.
	let preferenceCount = $derived(values.committeePreferenceCount);

	const preferenceHelp = $derived.by(() => {
		if (committeeCount === 0) return 'Available once committees exist.';
		if (preferenceCount === '0') return 'Applicants do not rank committees.';
		if (preferenceCount === '1') return 'Applicants choose 1 preferred committee.';
		return `Applicants can select up to ${preferenceCount} preferred committees.`;
	});
</script>

<fieldset class="mt-3.25">
	<legend class="fs-17 lh-22 font-semibold text-creation-ink-950">Who can apply</legend>
	<div class="mt-1.5 grid grid-cols-1 gap-3 lg:grid-cols-[342fr_225fr] lg:gap-0">
		<!-- The design's own sentence under "Individual delegates", kept as drawn. -->
		<ApplicationsToggle
			kind="checkbox"
			name="acceptsIndividualApplications"
			label="Individual delegates"
			description="A school or society applies for several seats at once."
			isChecked={values.acceptsIndividualApplications}
		/>
		<ApplicationsToggle
			kind="checkbox"
			name="acceptsDelegations"
			label="Delegations"
			description="Groups of delegates apply together."
			isChecked={values.acceptsDelegations}
		/>
	</div>
</fieldset>

<SetupField
	id="committeePreferenceCount"
	label="Committee preferences"
	isSection
	help={preferenceHelp}
	error={errors.committeePreferenceCount}
	class="mt-4.5"
	controlClass="mt-0.5"
	helpClass="mt-0.5 fs-15 lh-18"
>
	<DialogSelect
		id="committeePreferenceCount"
		name="committeePreferenceCount"
		options={preferenceOptions}
		describedBy={fieldHelpId('committeePreferenceCount')}
		bind:value={preferenceCount}
	/>
</SetupField>

<fieldset class="mt-3.25">
	<legend class="fs-17 lh-22 font-semibold text-creation-ink-950">Additional requirements</legend>
	<ApplicationsToggle
		kind="switch"
		name="askMotivation"
		label="Ask for a motivation"
		description="Applicants will be asked to upload or write a motivation statement."
		isChecked={values.askMotivation}
		class="mt-1.5"
	/>
	<ApplicationsToggle
		kind="switch"
		name="positionPaperRequired"
		label="Require a position paper"
		description="Applicants will be asked to upload a position paper."
		isChecked={values.positionPaperRequired}
		class="mt-1.25"
	/>
</fieldset>
