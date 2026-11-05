<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import FormSelect from '$lib/components/FormSelect.svelte';
	import { Label } from '$lib/components/ui/label';
	import { PROCEDURE_OPTIONS } from '$lib/committee-procedure';
	import { fieldId, fieldHelpId } from '$lib/form-fields';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	// Sends the form in the background and redraws the page with the new
	// settings; without JavaScript it posts and reloads the page instead.
	const inPlaceForm = createInPlaceForm();
</script>

<!--
	"Start from": one press fills every setting below from North American or
	THIMUN procedure, through `apply_committee_procedure`. It saves at once, so
	the line under it says plainly what it replaces.
-->
<form
	method="post"
	action="?/applyProcedure"
	class="flex flex-col gap-1.5"
	use:enhance={inPlaceForm.submit}
>
	<Label for={fieldId('procedureName')} class="text-small font-medium">Start from</Label>
	<div class="flex gap-3">
		<FormSelect
			id={fieldId('procedureName')}
			name="procedureName"
			value="north_american"
			options={PROCEDURE_OPTIONS}
			class="max-w-64 min-w-0 flex-1"
		/>
		<Button label="Apply" variant="secondary" size="dense" isLoading={inPlaceForm.isBusy} />
	</div>
	<p id={fieldHelpId('procedureName')} class="text-small text-muted-foreground">
		Replaces every setting below except the format, and saves them.
	</p>
</form>
