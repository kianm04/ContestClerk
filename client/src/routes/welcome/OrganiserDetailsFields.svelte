<script lang="ts">
	import TextArea from '$lib/components/TextArea.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import {
		DIETARY_REQUIREMENTS_MAX_LENGTH,
		type WelcomeFormErrors,
		type WelcomeFormValues
	} from '$lib/profiles';

	type Props = {
		/** What was typed so far, so a failed submit keeps every answer. */
		values: WelcomeFormValues;
		/** One message per field that has something wrong with it. */
		errors: WelcomeFormErrors;
	};

	let { values, errors }: Props = $props();

	/** The four fields this block holds, in the order they are shown. */
	const OPTIONAL_FIELD_NAMES = [
		'phone',
		'dietaryRequirements',
		'emergencyContactName',
		'emergencyContactPhone'
	] as const;

	// The block starts closed, but not when there is something inside it to see:
	// after a failed submit it must show what was typed and any message under a
	// field, or somebody would be told the form is wrong with nothing on screen
	// to say where. `$derived` works this out again after every submit.
	const hasSomethingToShow = $derived(
		OPTIONAL_FIELD_NAMES.some((name) => values[name] !== '' || errors[name])
	);
</script>

<!--
	`<details>` is the browser's own collapsible block: clicking the `<summary>`
	opens and closes it with no JavaScript at all, which is why it is used here
	rather than a button that toggles a class. Everything inside is optional, so
	it starts closed, and the `open` attribute is written by the server, so this
	works with JavaScript switched off too.
-->
<details class="rounded-control border border-line p-3" open={hasSomethingToShow}>
	<summary class="cursor-pointer text-body text-ink-900">
		Details organisers may need (optional)
	</summary>

	<div class="mt-4 flex flex-col gap-4">
		<TextField
			label="Phone"
			name="phone"
			type="text"
			value={values.phone}
			error={errors.phone}
			autocomplete="tel"
		/>

		<TextArea
			label="Dietary requirements"
			name="dietaryRequirements"
			value={values.dietaryRequirements}
			error={errors.dietaryRequirements}
			rows={3}
			maxLength={DIETARY_REQUIREMENTS_MAX_LENGTH}
		/>

		<TextField
			label="Emergency contact name"
			name="emergencyContactName"
			value={values.emergencyContactName}
			error={errors.emergencyContactName}
		/>

		<TextField
			label="Emergency contact phone"
			name="emergencyContactPhone"
			value={values.emergencyContactPhone}
			error={errors.emergencyContactPhone}
		/>
	</div>
</details>
