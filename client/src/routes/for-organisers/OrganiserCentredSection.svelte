<script lang="ts">
	import type { Snippet } from 'svelte';
	import Reveal from '$lib/components/Reveal.svelte';
	import type { LandingSectionWords } from '$lib/landing';
	import LandingHeading from '../LandingHeading.svelte';

	type Props = {
		/** The section's id, which the ledger's links point at, such as `days`. */
		id: string;
		words: LandingSectionWords;
		/** True for the first section under the hero, which sits a little closer to it. */
		isFirst?: boolean;
		/** Everything under the heading, passed between the tags. */
		children: Snippet;
	};

	let { id, words, isFirst = false, children }: Props = $props();

	// `$derived` works these out again if the props ever change.
	const headingId = $derived(`${id}-title`);
	const topSpaceClass = $derived(isFirst ? 'pt-14' : 'pt-[clamp(3.5rem,6.4vw,5rem)]');
</script>

<!--
	A chapter whose picture is too wide to share a row with its words: the
	ledger, the seat grid and the committee room. The heading is centred over
	the full width, and what follows rises into view a beat after it.
	`scroll-mt-20` keeps the heading clear of the top bar when a ledger link
	jumps here.
-->
<section
	{id}
	aria-labelledby={headingId}
	class="mx-auto w-full max-w-[68.75rem] scroll-mt-20 px-4 pb-[clamp(3.5rem,6.4vw,5rem)] {topSpaceClass}"
>
	<Reveal>
		<LandingHeading {headingId} {words} isCentred />
	</Reveal>

	<Reveal delay={120} class="mt-10">
		{@render children()}
	</Reveal>
</section>
