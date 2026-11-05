<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import { describeDetailsFailure, describeDetailsSaved } from '$lib/profile-presses';
	import {
		DIETARY_REQUIREMENTS_MAX_LENGTH,
		type DetailsFormErrors,
		type DetailsFormValues
	} from '$lib/profiles';

	type Props = {
		/** What the details hold now, or what was typed on a submit that failed. */
		values: DetailsFormValues;
		/** One message per field that has something wrong with it. */
		errors: DetailsFormErrors;
	};

	let { values, errors }: Props = $props();

	// Sends the form in the background (`$lib/instant-form.svelte.ts`) and
	// says "saved" the moment it is pressed, with no spinner, unless a field
	// is wrong. A save the server refuses marks its fields and says so in a
	// toast. `use:enhance` in the markup hands the form over; without
	// JavaScript it posts and reloads the page as before.
	const instantForm = createInstantForm({
		describeFailure: describeDetailsFailure,
		describeSuccess: describeDetailsSaved
	});
</script>

<div class="mb-4">
	<h2 class="font-display text-h2 text-brand-900">Private details</h2>
	<p class="mt-1 text-body text-ink-600">
		Only organisers of conferences you attend, and the head of a school delegation you join, can see
		these.
	</p>
</div>

<!--
	`action="?/updatePrivate"` sends this form to the other of the page's two
	actions, so saving one half never touches the other. Like the form above it
	this is ordinary HTML, and it leaves the checking to the server rather than
	to the browser's own `required`, so that everybody is told the same thing.
-->
<form
	method="post"
	action="?/updatePrivate"
	class="flex flex-col gap-4"
	use:enhance={instantForm.submit}
>
	<TextField
		label="Date of birth"
		name="dateOfBirth"
		type="date"
		value={values.dateOfBirth}
		error={errors.dateOfBirth}
		help="Some conferences have age limits."
	/>

	<TextField
		label="Phone"
		name="phone"
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

	<FormActions>
		<Button label="Save details" variant="primary" />
	</FormActions>
</form>
