<script lang="ts">
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import FileField from '$lib/components/FileField.svelte';
	import RadioGroup from '$lib/components/RadioGroup.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { SAMPLE_COMMITTEE_OPTIONS, SAMPLE_EXPERIENCE_OPTIONS } from '$lib/styleguide-samples';
	import type { SampleErrors } from './+page.server';
	import Example from './Example.svelte';

	type Props = {
		/** What the dummy action sent back, or `null` before the button was pressed. */
		errors: SampleErrors | null;
	};

	let { errors }: Props = $props();
</script>

<Example name="TextField" props="value, help, isRequired, error">
	<div class="grid gap-4">
		<TextField label="Full name" name="fullName" value="Amara Osei" error={errors?.fullName} />
		<TextField
			label="Email"
			name="email"
			value="amara@example.test"
			type="email"
			help="We only ever write to you about this conference."
			isRequired={true}
			error={errors?.email}
		/>
		<TextField label="Nickname" name="nickname" value="" placeholder="Optional" />
	</div>
</Example>

<Example name="TextField" props="type number / date, with min, max and step">
	<div class="grid gap-4">
		<TextField
			label="Seats wanted"
			name="seats"
			value="12"
			type="number"
			min={1}
			max={40}
			step={1}
			error={errors?.seats}
		/>
		<TextField
			label="Applications close"
			name="deadline"
			value="2026-12-14"
			type="date"
			error={errors?.deadline}
		/>
	</div>
</Example>

<Example name="TextArea" props="rows, maxLength (which adds the character count), error">
	<TextArea
		label="About you"
		name="about"
		value="I have chaired twice and would like a crisis committee."
		rows={4}
		maxLength={500}
		help="A few sentences is plenty."
		error={errors?.about}
	/>
</Example>

<Example name="SelectField" props="options, placeholder, isRequired, error">
	<SelectField
		label="First choice committee"
		name="committee"
		value=""
		options={SAMPLE_COMMITTEE_OPTIONS}
		placeholder="Choose a committee"
		isRequired={true}
		error={errors?.committee}
	/>
</Example>

<Example name="CountrySelect" props="name, value, error · it brings its own country list">
	<CountrySelect name="country" value="NL" error={errors?.country} />
</Example>

<Example name="CheckboxField" props="label, isChecked, help">
	<CheckboxField
		label="I agree to the code of conduct"
		name="agree"
		isChecked={false}
		help="You cannot take part without agreeing to it."
	/>
</Example>

<Example name="RadioGroup" props="legend, options with a description each, error">
	<RadioGroup
		legend="How much MUN experience do you have?"
		name="experience"
		value="beginner"
		options={SAMPLE_EXPERIENCE_OPTIONS}
		error={errors?.experience}
	/>
</Example>

<Example name="FileField" props="accept, maxSizeMb, help, currentFileName, error">
	<FileField
		label="Position paper"
		name="positionPaper"
		accept="application/pdf,.docx"
		maxSizeMb={5}
		help="PDF or Word."
		currentFileName="position-paper-v2.pdf"
		error={errors?.positionPaper}
	/>
</Example>

<Example name="FieldError" props="id, message · on its own, outside a field">
	<FieldError id="field-standalone-error" message="This is what one error line looks like." />
</Example>
