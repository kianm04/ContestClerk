<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import {
		FORMAT_OPTIONS,
		type ProcedureFormErrors,
		type ProcedureFormValues
	} from '$lib/committee-procedure';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import AmendmentSettingsFields from './AmendmentSettingsFields.svelte';
	import DraftSettingsFields from './DraftSettingsFields.svelte';
	import ProcedureSelectField from './ProcedureSelectField.svelte';
	import ProcedureTickBox from './ProcedureTickBox.svelte';

	type Props = {
		values: ProcedureFormValues;
		errors: ProcedureFormErrors;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors }: Props = $props();

	/*
		The format chosen in the dropdown, which decides whether the crisis box
		shows. A `$derived` can be written to: it follows the saved format, and
		the dropdown's `onChange` moves it as soon as another is picked. Without
		JavaScript it stays on the saved one until the form is saved.
	*/
	let chosenFormat = $derived(values.format);

	// Sends the form in the background; without JavaScript it posts and reloads.
	const inPlaceForm = createInPlaceForm();
</script>

<!--
	Every setting of section 5, in its order, saved together by one plain
	update of the committee. The page's one primary button is "Save changes"
	above, so this one is secondary, like the other sections' own.
-->
<form
	method="post"
	action="?/saveProcedure"
	class="flex max-w-2xl flex-col gap-5 border-t border-border pt-5"
	use:enhance={inPlaceForm.submit}
>
	<ProcedureSelectField
		label="Format"
		name="format"
		value={values.format}
		options={FORMAT_OPTIONS}
		help="Start from leaves the format as it is."
		error={errors.format}
		onChange={(format) => (chosenFormat = format)}
	/>

	{#if chosenFormat === 'crisis'}
		<ProcedureTickBox
			name="crisisAllowsResolutions"
			label="Working papers and draft resolutions in a crisis committee"
			help="Off, the committee writes directives only."
			isChecked={values.crisisAllowsResolutions}
		/>
	{/if}

	<DraftSettingsFields {values} {errors} />

	<AmendmentSettingsFields {values} {errors} />

	<div>
		<Button label="Save settings" variant="secondary" size="dense" isLoading={inPlaceForm.isBusy} />
	</div>
</form>
