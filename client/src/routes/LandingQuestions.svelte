<script lang="ts">
	import Reveal from '$lib/components/Reveal.svelte';
	import * as Accordion from '$lib/components/ui/accordion';
	import * as Card from '$lib/components/ui/card';
	import { LANDING_QUESTIONS, QUESTIONS_WORDS } from '$lib/landing';
	import LandingSection from './LandingSection.svelte';
</script>

<!--
	The questions a visitor tends to ask, as a shadcn `Accordion` inside a
	shadcn `Card` with the example's soft shadow: one row per question, which
	opens to its answer, one at a time (`type="single"`). The accordion is
	driven by JavaScript, so until it arrives the questions are listed and
	their answers closed. Questions have no id, so the `(item.question)` key
	tells Svelte which is which.

	Only sizing and colour classes are passed to the accordion's parts; the
	project's own type tokens would be mistaken for colours by the class merger.
-->
<LandingSection id="questions" words={QUESTIONS_WORDS} isCentred>
	<Reveal>
		<Card.Root class="mx-auto max-w-3xl gap-0 rounded-2xl px-6 py-1 shadow-card ring-0">
			<Accordion.Root type="single">
				{#each LANDING_QUESTIONS as item (item.question)}
					<Accordion.Item value={item.question} class="border-neutral-100">
						<Accordion.Trigger class="min-h-11 py-3.5 text-base text-ink-900 hover:no-underline">
							{item.question}
						</Accordion.Trigger>
						<Accordion.Content class="max-w-prose pb-4 text-base text-ink-600">
							{item.answer}
						</Accordion.Content>
					</Accordion.Item>
				{/each}
			</Accordion.Root>
		</Card.Root>
	</Reveal>
</LandingSection>
