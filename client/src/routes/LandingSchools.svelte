<script lang="ts">
	import Reveal from '$lib/components/Reveal.svelte';
	import * as Card from '$lib/components/ui/card';
	import { SCHOOLS_WORDS, SCHOOL_STEPS } from '$lib/landing';
	import { REVEAL_ITEM_CLASSES, staggerDelay } from '$lib/reveal';
	import LandingSection from './LandingSection.svelte';
</script>

<!--
	What a school does, in three numbered steps, each a shadcn `Card` with the
	example's soft shadow. They sit side by side from a tablet up and follow
	the words in one after another. The steps have no id, so the `(step.title)`
	key tells Svelte which is which.
-->
<LandingSection id="schools" words={SCHOOLS_WORDS} isCentred>
	<Reveal>
		<ol class="grid gap-5 md:grid-cols-3">
			{#each SCHOOL_STEPS as step, index (step.title)}
				<li class={REVEAL_ITEM_CLASSES} style:transition-delay="{staggerDelay(index, 120)}ms">
					<Card.Root class="h-full gap-0 rounded-2xl p-6 shadow-card ring-0">
						<span
							class="flex size-8 items-center justify-center rounded-full bg-brand-100 text-small font-semibold text-brand-900 tabular-nums"
						>
							{index + 1}
						</span>
						<h3 class="mt-4 text-h3 text-ink-900">{step.title}</h3>
						<p class="mt-1 text-small text-ink-600">{step.detail}</p>
					</Card.Root>
				</li>
			{/each}
		</ol>
	</Reveal>
</LandingSection>
