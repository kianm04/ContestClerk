<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import Button from '$lib/components/Button.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import type { CarriedField, ConfirmationQuestion } from '$lib/confirmation';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The question the `ConfirmButton` would have asked in its dialog. */
		question: ConfirmationQuestion;
		/** Every field of the first press, sent on unchanged. */
		fields: CarriedField[];
	};

	let { question, fields }: Props = $props();

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// `question.actionAddress` usually points at another page's own action, so
	// the answer here is a real navigation there rather than a redraw of this one.
	const inPlaceForm = createInPlaceForm();
</script>

<AuthCard title={question.title}>
	<p class="text-body text-ink-600">{question.text}</p>

	<!--
		A plain form posting to the action the button named, so this works with
		no JavaScript at all. The confirming button sends `confirm=1` as well,
		which is how an action can tell a question answered from one never asked.
	-->
	<form method="post" action={question.actionAddress} class="mt-6" use:enhance={inPlaceForm.submit}>
		<!-- The same field name can appear twice, so the fields are keyed by position. -->
		{#each fields as field, index (index)}
			<input type="hidden" name={field.name} value={field.value} />
		{/each}

		<FormActions>
			<!-- A link, because going back changes nothing. -->
			<Button label="Cancel" variant="secondary" href={question.returnAddress} />
			<Button
				label={question.label}
				variant={question.variant}
				name="confirm"
				value="1"
				isLoading={inPlaceForm.isBusy}
			/>
		</FormActions>
	</form>
</AuthCard>
