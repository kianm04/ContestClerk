<script lang="ts">
	import Reveal from '$lib/components/Reveal.svelte';
	import { JOURNEY_STEPS, JOURNEY_WORDS } from '$lib/landing';
	import { staggerDelay } from '$lib/reveal';
	import LandingJourneyStep from './LandingJourneyStep.svelte';
	import LandingSection from './LandingSection.svelte';

	/** How far apart the steps arrive, so the line has time to reach each one. */
	const STEP_SPACING_MS = 120;

	const lastIndex = JOURNEY_STEPS.length - 1;
</script>

<!--
	The six steps of a conference, on one line, in the manner of the example's
	timeline: numbered blue circles joined by a pale blue line. On a phone and
	a tablet the steps stack and the line runs down their left; from `lg`
	(1024px) up they sit side by side and the line runs across. Each step
	draws the piece of line to the next one (`LandingJourneyStep`), and the
	steps arrive one after another, so the line reads as being drawn across
	the page.
-->
<LandingSection id="journey" words={JOURNEY_WORDS} isCentred>
	<Reveal>
		<ol class="grid gap-7 lg:grid-cols-6 lg:gap-6">
			<!-- Steps have no id, so the `(step.title)` key tells Svelte which is which. -->
			{#each JOURNEY_STEPS as step, index (step.title)}
				<LandingJourneyStep
					{step}
					number={index + 1}
					isLast={index === lastIndex}
					delay={staggerDelay(index, STEP_SPACING_MS)}
				/>
			{/each}
		</ol>
	</Reveal>
</LandingSection>
