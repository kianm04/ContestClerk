<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import type { OrganiserQuestion } from '$lib/organiser-close';

	type Props = {
		/** The questions in this column, in order. */
		questions: OrganiserQuestion[];
		/**
		 * True for a column after the first. Below `lg` it sits under the one
		 * before it, so its first question needs the hairline the others have.
		 */
		isFollowing: boolean;
	};

	// `$props()` is how a Svelte 5 component receives what its parent passes.
	let { questions, isFollowing }: Props = $props();
</script>

<!--
	One column of the organisers' questions: a row per question, which opens to
	its answer. It sits inside the accordion in `OrganiserQuestions.svelte`, so
	its items join that one accordion and only one answer is open in the two
	columns together.

	Only sizing and colour classes are passed to the accordion's parts; the
	project's own type tokens (`text-body`) would be mistaken for colours by the
	class merger, so the answer's size is written out. Questions have no id, so
	the `(item.question)` key tells Svelte which is which.
-->
<div
	class={[
		'flex min-w-0 flex-col lg:flex-1',
		isFollowing && 'border-t border-neutral-100 lg:border-t-0'
	]}
>
	{#each questions as item (item.question)}
		<Accordion.Item value={item.question} class="border-neutral-100">
			<Accordion.Trigger
				class="min-h-13 items-center gap-4 py-3.5 text-base text-ink-900 hover:no-underline **:data-[slot=accordion-trigger-icon]:text-ink-600"
			>
				{item.question}
			</Accordion.Trigger>
			<Accordion.Content class="pr-8 pb-[1.125rem] text-[0.9375rem]/6 text-ink-600">
				{item.answer}
			</Accordion.Content>
		</Accordion.Item>
	{/each}
</div>
