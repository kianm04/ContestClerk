<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import type { ApplicationAnswers } from '$lib/applications';
	import type { ApplicationQuestion } from '$lib/application-questions';
	import QuestionField from './QuestionField.svelte';

	type Props = {
		/** The conference's own questions, in the order it asks them. */
		questions: ApplicationQuestion[];
		/** Every answer so far, keyed by question id. */
		values: ApplicationAnswers;
		/** One message per question that needs fixing, or nothing when none does. */
		errors: Record<string, string> | undefined;
	};

	let { questions, values, errors }: Props = $props();
</script>

<!-- The card is drawn by whoever has questions to put in it, so a conference
	with none shows no empty card. -->
<Card>
	<h2 class="mb-3 font-display text-h2 text-brand-900">Questions</h2>

	<!-- The `(question.id)` key lets Svelte reuse each field instead of
		rebuilding it, which keeps whatever has been typed into it. -->
	<div class="flex flex-col gap-4">
		{#each questions as question (question.id)}
			<QuestionField {question} value={values[question.id] ?? ''} error={errors?.[question.id]} />
		{/each}
	</div>
</Card>
