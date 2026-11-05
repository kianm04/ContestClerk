<script lang="ts">
	// `Snippet` is the type of the markup a component is handed between its tags.
	import type { Snippet } from 'svelte';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { PaperSubmit } from '$lib/paper-writing';

	type Props = {
		/** The `saveDraft` action "Save draft" posts to without JavaScript. */
		saveAction: string;
		/** "Submit for review" for the delegate in the seat; `null` for the rest of their delegation. */
		submit: PaperSubmit | null;
		/** The line under the fields of a form that cannot submit, such as "Only Rachel can submit this paper." */
		footnote: string | null;
		/** The writer's fields, drawn inside the form with `{@render children()}`. */
		children: Snippet;
	};

	let { saveAction, submit, footnote, children }: Props = $props();

	const draftForm = createInPlaceForm();
</script>

<!--
	The form a live position paper's fields post with. The delegate in the
	seat has "Submit for review", which `ConfirmButton` asks about before it
	sends the fields; the rest of their delegation only saves the draft
	(T147). The margin beside the paper has forms of its own, and a form
	cannot hold another, so this one holds the fields alone.
-->
{#if submit}
	<ConfirmButton
		label={submit.label}
		confirmTitle={submit.confirmTitle}
		confirmText={submit.confirmText}
		formaction={submit.formaction}
		variant="primary"
	>
		{@render children()}
	</ConfirmButton>
{:else}
	<form
		method="post"
		action={saveAction}
		class="flex flex-col gap-3"
		use:enhance={draftForm.submit}
	>
		{@render children()}
		{#if footnote}
			<p class="text-small text-muted-foreground">{footnote}</p>
		{/if}
	</form>
{/if}
