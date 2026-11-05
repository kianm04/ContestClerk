<script lang="ts">
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import FieldRow from '$lib/components/manage/FieldRow.svelte';
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import type { SelectOption } from '$lib/components/SelectField.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import type { ConferenceEditErrors, ConferenceEditValues } from '$lib/conference-details';

	type Props = {
		/** What the fields show: the saved details, or what was typed into a refused form. */
		values: ConferenceEditValues;
		/** One message per field that has something wrong with it. */
		errors: ConferenceEditErrors;
		/** Every timezone, worked out on the server by `$lib/timezones.ts`. */
		timezoneOptions: SelectOption[];
	};

	let { values, errors, timezoneOptions }: Props = $props();
</script>

<FormSection title="Place and dates">
	<FieldRow columns={2}>
		<TextField
			label="Venue name"
			name="venueName"
			value={values.venueName}
			error={errors.venueName}
			maxLength={200}
			isDense
		/>

		<TextField
			label="Venue address"
			name="venueAddress"
			value={values.venueAddress}
			error={errors.venueAddress}
			maxLength={200}
			isDense
		/>
	</FieldRow>

	<FieldRow columns={2}>
		<TextField
			label="City"
			name="city"
			value={values.city}
			error={errors.city}
			isRequired
			isDense
		/>

		<!-- `CountrySelect` builds the country list itself, so no page passes one. -->
		<CountrySelect
			name="countryCode"
			value={values.countryCode}
			error={errors.countryCode}
			isRequired
			isDense
		/>
	</FieldRow>

	<FieldRow columns={3}>
		<TextField
			label="First day"
			name="startDate"
			type="date"
			value={values.startDate}
			error={errors.startDate}
			isRequired
			isDense
		/>

		<TextField
			label="Last day"
			name="endDate"
			type="date"
			value={values.endDate}
			error={errors.endDate}
			isRequired
			isDense
		/>

		<SelectField
			label="Timezone"
			name="timezone"
			value={values.timezone}
			options={timezoneOptions}
			error={errors.timezone}
			isRequired
			help="Every time of this conference is shown in it."
			isDense
		/>
	</FieldRow>
</FormSection>
