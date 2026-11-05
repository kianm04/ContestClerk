<script lang="ts">
	import type { ApplicationQuestion } from '$lib/application-questions';
	import QuestionRow from './QuestionRow.svelte';

	type Props = {
		slug: string;
		questions: ApplicationQuestion[];
		/** One line a row on the Setup panel; the dialog adds each question's type and the arrows to move it. */
		isCompact?: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { slug, questions, isCompact = false }: Props = $props();
</script>

<!-- The custom questions in the order applicants meet them, split by hairlines. -->
{#if questions.length === 0}
	<p class="border-t border-creation-rule py-2.5 pl-5 fs-14 text-creation-ink-275">
		No custom questions.
	</p>
{:else}
	<ol class="flex flex-col">
		<!-- Keyed by id, so a moved question keeps its row. -->
		{#each questions as question, index (question.id)}
			<QuestionRow
				{slug}
				{question}
				{isCompact}
				isFirst={index === 0}
				isLast={index === questions.length - 1}
			/>
		{/each}
	</ol>
{/if}
