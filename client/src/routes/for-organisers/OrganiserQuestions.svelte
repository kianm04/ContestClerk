<script lang="ts">
	import * as Accordion from '$lib/components/ui/accordion';
	import {
		ORGANISER_QUESTION_COLUMNS,
		QUESTIONS_EMAIL,
		QUESTIONS_HEADING
	} from '$lib/organiser-close';
	import OrganiserQuestionsColumn from './OrganiserQuestionsColumn.svelte';

	// The question that is open. It starts on the first, as the design draws
	// it. `$state` makes it reactive, and `bind:value` below lets the accordion
	// change it when another question is pressed.
	let openQuestion = $state(ORGANISER_QUESTION_COLUMNS[0][0].question);
</script>

<!--
	The questions organisers ask first: the section's heading, centred, then the
	landing page's accordion inside a white card with a soft shadow, and an
	address for anything else. The section around this block is the page's, and
	is named by the heading's `id="questions-title"`.

	The accordion is shadcn's `Accordion`, with `type="single"` so one answer is
	open at a time. Its questions run in two columns from the `lg` width up and
	one under the other below it, but stay in one accordion, so opening a
	question in one column closes the one open in the other. The columns have
	no id, so their place in the list is the key.
-->
<div class="flex flex-col items-center text-center">
	<p class="text-label tracking-[0.14em] text-brand-700 uppercase">{QUESTIONS_HEADING.eyebrow}</p>
	<h2
		id="questions-title"
		class="mt-2.5 font-display text-h1-mobile font-medium text-balance text-ink-900 [font-variation-settings:normal] md:text-closing"
	>
		{QUESTIONS_HEADING.title}
	</h2>
</div>

<div class="mt-10 rounded-xl bg-surface px-6 py-1 shadow-card">
	<Accordion.Root
		type="single"
		bind:value={openQuestion}
		class="lg:flex-row lg:items-start lg:gap-x-12"
	>
		{#each ORGANISER_QUESTION_COLUMNS as questions, index (index)}
			<OrganiserQuestionsColumn {questions} isFollowing={index > 0} />
		{/each}
	</Accordion.Root>
</div>

<p class="mt-6 text-center text-body text-ink-600">
	Something else? Write to <a
		href="mailto:{QUESTIONS_EMAIL}"
		class="font-medium text-brand-700 no-underline hover:text-brand-900">{QUESTIONS_EMAIL}</a
	>.
</p>
