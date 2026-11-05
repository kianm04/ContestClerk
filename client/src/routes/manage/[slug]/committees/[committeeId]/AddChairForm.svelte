<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { DEFAULT_CHAIR_TITLE, STAFF_TITLE_MAX_LENGTH } from '$lib/team';

	type Props = {
		/** The chair staff who do not chair this committee yet, as the picker lists them. */
		pickerOptions: { value: string; label: string }[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { pickerOptions }: Props = $props();

	/*
		Sends the form in the background and redraws the page without reloading it
		(`$lib/in-place-form.svelte.ts`); without JavaScript it still posts and
		reloads the page as before. Adding a chair empties the picker and the
		title box, the way a reload would leave them.

		This one waits for the server, with the delayed spinner, rather than
		showing the new chair at once (T142): the picker does not know the
		person's photo, so their row would change again when the answer arrived.
	*/
	const addChairForm = createInPlaceForm({ isResetAfterSave: true });
</script>

<!--
	Shares a wrapping row with "Invite a chair by email" (`ChairsPanel`).
	`items-start` keeps the boxes level when one of them shows an error under
	it, and `pt-6.5`, the height of a label, lines the button up with the boxes.
-->
<form
	method="post"
	action="?/addChair"
	class="flex min-w-0 flex-[1_1_22rem] items-start gap-2"
	use:enhance={addChairForm.submit}
>
	<div class="min-w-0 flex-[1_1_8rem]">
		<SelectField
			label="Or choose from your team"
			name="userId"
			value=""
			options={pickerOptions}
			placeholder="Choose somebody"
			isRequired
			isDense
		/>
	</div>

	<div class="w-28 shrink-0">
		<TextField
			label="Title"
			name="title"
			value=""
			placeholder={DEFAULT_CHAIR_TITLE}
			maxLength={STAFF_TITLE_MAX_LENGTH}
			isDense
		/>
	</div>

	<div class="pt-6.5">
		<Button label="Add chair" variant="secondary" size="dense" isLoading={addChairForm.isBusy} />
	</div>
</form>
