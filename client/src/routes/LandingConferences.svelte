<script lang="ts">
	import ConferenceCard from '$lib/components/ConferenceCard.svelte';
	import Reveal from '$lib/components/Reveal.svelte';
	import type { Conference } from '$lib/conferences';
	import { CONFERENCES_WORDS } from '$lib/landing';
	import { REVEAL_ITEM_CLASSES, staggerDelay } from '$lib/reveal';
	import { conferenceListUrl } from '$lib/urls';
	import LandingSection from './LandingSection.svelte';

	type Props = {
		/** The conferences taking applications right now, soonest first, from `load`. */
		conferences: Conference[];
		/** The moment the page was drawn, which decides each card's applications pill. */
		now: Date;
	};

	let { conferences, now }: Props = $props();
</script>

<!--
	The conferences a visitor could apply to today, read from the database by
	`+page.server.ts`: real conferences with their own photographs, drawn with
	the directory's own `ConferenceCard`, so they look exactly like the example
	card under the hero. The cards arrive one after another.

	With nothing to show, the section says so in one sentence with one link,
	and nothing else. Conferences have ids, so the `(conference.id)` key tells
	Svelte which card is which.
-->
<LandingSection
	id="conferences"
	words={CONFERENCES_WORDS}
	linkHref={conferenceListUrl()}
	linkLabel="All conferences"
>
	{#if conferences.length === 0}
		<p class="text-body text-ink-600">
			No conference is taking applications right now.
			<a href={conferenceListUrl()} class="text-brand-700 hover:underline">
				Browse every conference
			</a>
		</p>
	{:else}
		<Reveal>
			<ul class="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
				{#each conferences as conference, index (conference.id)}
					<li class={REVEAL_ITEM_CLASSES} style:transition-delay="{staggerDelay(index, 100)}ms">
						<ConferenceCard {conference} {now} />
					</li>
				{/each}
			</ul>
		</Reveal>
	{/if}
</LandingSection>
