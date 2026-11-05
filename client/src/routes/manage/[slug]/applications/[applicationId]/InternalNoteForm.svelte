<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import { INTERNAL_NOTE_MAX_LENGTH } from '$lib/application-review';

	type Props = {
		/** Where the form posts, keeping the queue the page was opened from. */
		formaction: string;
		/** What is saved, or what was typed when the last save was refused. */
		internalNote: string;
		/** Why saving the note was refused, or `null`. */
		error: string | null;
		/**
		 * The page's instant form (`$lib/instant-form.svelte.ts`): the note is
		 * saved to the note itself the moment "Save note" is pressed, since it is
		 * only ever exactly what was typed (T142).
		 */
		onSubmit: SubmitFunction;
	};

	let { formaction, internalNote, error, onSubmit }: Props = $props();
</script>

<form method="post" action={formaction} class="flex flex-col gap-3" use:enhance={onSubmit}>
	<TextArea
		isDense
		label="Internal note"
		name="internalNote"
		value={internalNote}
		rows={3}
		maxLength={INTERNAL_NOTE_MAX_LENGTH}
		help="Only your team reads this."
	/>

	{#if error}
		<Notice tone="error">{error}</Notice>
	{/if}

	<div>
		<Button label="Save note" variant="secondary" size="dense" />
	</div>
</form>
