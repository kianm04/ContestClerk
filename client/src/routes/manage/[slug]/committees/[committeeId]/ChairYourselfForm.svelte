<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	/*
		Sends the form in the background and redraws the page without reloading
		it (`$lib/in-place-form.svelte.ts`). It waits for the server with the
		delayed spinner rather than showing the reader as a chair at once, because
		the page does not know their name or photo until it reloads.
	*/
	const chairYourselfForm = createInPlaceForm();
</script>

<!-- No fields: `?/chairYourself` only ever adds the person pressing it. -->
<!-- `-ml-3` lines the words, rather than the button's padding, up with the fields above. -->
<form method="post" action="?/chairYourself" class="-ml-3" use:enhance={chairYourselfForm.submit}>
	<Button
		label="Chair it yourself"
		variant="ghost"
		size="dense-sm"
		isLoading={chairYourselfForm.isBusy}
	/>
</form>
