<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import { INTERNAL_NOTE_MAX_LENGTH } from '$lib/application-review';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** What is saved, or what was typed when the last save was refused. */
		internalNote: string;
		/** Why saving the note was refused, or `null`. */
		error: string | null;
		/** Where the form posts: the list, keeping its tab and this application. */
		saveNoteAction: string;
	};

	let { internalNote, error, saveNoteAction }: Props = $props();

	// Sends the note in the background and redraws the list and the panel with
	// what was saved (`$lib/in-place-form.svelte.ts`).
	const inPlaceForm = createInPlaceForm();
</script>

<form
	method="post"
	action={saveNoteAction}
	class="flex flex-col gap-3"
	use:enhance={inPlaceForm.submit}
>
	<TextArea
		isDense
		label="Note for organisers"
		name="internalNote"
		idKey="panel-internal-note"
		value={internalNote}
		rows={3}
		maxLength={INTERNAL_NOTE_MAX_LENGTH}
		help="Only your team reads this."
	/>

	{#if error}
		<Notice tone="error">{error}</Notice>
	{/if}

	<div>
		<Button label="Save note" variant="secondary" size="dense-sm" isLoading={inPlaceForm.isBusy} />
	</div>
</form>
