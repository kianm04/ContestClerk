<script lang="ts">
	import FieldRow from '$lib/components/manage/FieldRow.svelte';
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import RadioGroup from '$lib/components/RadioGroup.svelte';
	import type { RadioOption } from '$lib/components/RadioGroup.svelte';
	import type { SelectOption } from '$lib/components/SelectField.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import type { ConferenceEditErrors, ConferenceEditValues } from '$lib/conference-details';
	import CurrencyField from './CurrencyField.svelte';

	type Props = {
		/** What the fields show: the saved details, or what was typed into a refused form. */
		values: ConferenceEditValues;
		/** One message per field that has something wrong with it. */
		errors: ConferenceEditErrors;
		/** The three `conference_level` values with the words a reader sees. */
		levelOptions: RadioOption[];
		/** Every currency the app knows, such as "EUR · Euro". */
		currencyOptions: SelectOption[];
		/** True once the conference has an invoice, which fixes its currency for good. */
		isCurrencyLocked: boolean;
	};

	let { values, errors, levelOptions, currencyOptions, isCurrencyLocked }: Props = $props();
</script>

<FormSection title="Audience">
	<RadioGroup
		legend="Level"
		name="level"
		value={values.level}
		options={levelOptions}
		error={errors.level}
		isDense
	/>

	<FieldRow columns={2}>
		<TextField
			label="Language"
			name="language"
			value={values.language}
			error={errors.language}
			isRequired
			maxLength={60}
			isDense
		/>

		<TextField
			label="Expected delegates"
			name="expectedDelegates"
			type="number"
			min={1}
			max={5000}
			value={values.expectedDelegates}
			error={errors.expectedDelegates}
			help="Leave empty if you do not know yet."
			isDense
		/>
	</FieldRow>

	<!--
		The two ages only ever hold two digits, so they get narrow boxes (140px in
		the design) and the currency takes the rest of the row. On a phone the
		ages share a row and the currency goes under them.
	-->
	<div class="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-[8.75rem_8.75rem_1fr]">
		<TextField
			label="Minimum age"
			name="minAge"
			type="number"
			min={10}
			max={99}
			value={values.minAge}
			error={errors.minAge}
			isDense
		/>

		<TextField
			label="Maximum age"
			name="maxAge"
			type="number"
			min={10}
			max={99}
			value={values.maxAge}
			error={errors.maxAge}
			isDense
		/>

		<div class="col-span-2 sm:col-span-1">
			<CurrencyField
				value={values.currency}
				options={currencyOptions}
				isLocked={isCurrencyLocked}
				error={errors.currency}
			/>
		</div>
	</div>
</FormSection>
