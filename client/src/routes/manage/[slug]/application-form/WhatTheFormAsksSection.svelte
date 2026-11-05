<script lang="ts">
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import FieldRow from '$lib/components/manage/FieldRow.svelte';
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import {
		COMMITTEE_PREFERENCE_OPTIONS,
		type FormSettingsErrors,
		type FormSettingsValues
	} from '$lib/application-form-settings';

	type Props = {
		/** What the fields show: the saved settings, or what was typed into a refused form. */
		values: FormSettingsValues;
		/** One message per field that has something wrong with it. */
		errors: FormSettingsErrors;
		/** True once people have applied, when the preference count may go up but not down. */
		isPreferenceCountLocked: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors, isPreferenceCountLocked }: Props = $props();
</script>

<!-- Fields only: the page's one settings form wraps this section. -->
<FormSection
	title="What the form asks"
	description="Name, school, experience and contact details are always asked."
>
	{#if isPreferenceCountLocked}
		<!--
			Said here rather than by disabling the dropdown. A disabled field sends
			nothing at all, so saving the page would quietly wipe the setting; the
			server is what enforces the rule, and this only explains it.
		-->
		<Notice tone="info">
			People have already applied, so you can ask for more committee preferences but not fewer.
		</Notice>
	{/if}

	<!-- A row of two holding one field keeps the dropdown half as wide as the column. -->
	<FieldRow columns={2}>
		<SelectField
			label="Committee preferences"
			name="committeePreferenceCount"
			value={values.committeePreferenceCount}
			options={COMMITTEE_PREFERENCE_OPTIONS}
			error={errors.committeePreferenceCount}
			help="How many committees an applicant ranks."
			isDense
		/>
	</FieldRow>

	<CheckboxField
		label="Ask for a motivation"
		name="askMotivation"
		isChecked={values.askMotivation}
		help="A 1500-character box on the apply form."
	/>

	<CheckboxField
		label="Require a position paper"
		name="positionPaperRequired"
		isChecked={values.positionPaperRequired}
	/>

	<!--
		The deadline box is always in the HTML rather than appearing once the box
		above is ticked: the page has to work with JavaScript switched off, and the
		server is what refuses an empty one when the paper is required.
	-->
	<FieldRow columns={2}>
		<TextField
			label="Position paper deadline"
			name="positionPaperDeadline"
			value={values.positionPaperDeadline}
			error={errors.positionPaperDeadline}
			type="datetime-local"
			help="Only used when a paper is required."
			isDense
		/>
	</FieldRow>
</FormSection>
