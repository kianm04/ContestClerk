<script lang="ts">
	import type { Snippet } from 'svelte';
	import Reveal from '$lib/components/Reveal.svelte';
	import type { LandingRow, LandingSectionWords } from '$lib/landing';
	import LandingHeading from '../LandingHeading.svelte';
	import LandingRowList from '../LandingRowList.svelte';

	type Props = {
		/** The section's id, which the ledger's links point at, such as `fees`. */
		id: string;
		words: LandingSectionWords;
		/** The rows under the words. */
		rows: LandingRow[];
		/** True puts the picture on the left on a desktop, and still under the words on a phone. */
		isReversed?: boolean;
		/**
		 * How the two halves share a row, as Tailwind `flex-[grow_shrink_basis]`
		 * classes: the design gives each section its own proportions, a wide
		 * table taking more room than a narrow list.
		 */
		wordsClass: string;
		pictureClass: string;
		/** The space between the halves, across and down. */
		gapClass: string;
		/** The drawn picture beside the words, passed between the tags. */
		children: Snippet;
	};

	let {
		id,
		words,
		rows,
		isReversed = false,
		wordsClass,
		pictureClass,
		gapClass,
		children
	}: Props = $props();

	// `$derived` works this out again if the props ever change.
	const headingId = $derived(`${id}-title`);

	/*
		A reversed section is `flex-row-reverse`: the words stay first in the
		markup, so a screen reader and the Tab key meet them before the picture,
		but on a desktop the picture is drawn on the left. When the halves no
		longer fit side by side they wrap, and the words stay on top.
	*/
	const directionClass = $derived(isReversed ? 'flex-row-reverse' : '');
</script>

<!--
	A chapter of the conference's year, in the landing page's manner: small
	capitals, a serif title, one sentence and rows on one side, a drawn
	picture of the product on the other. The halves wrap rather than sit in a
	grid, so each section can keep the design's own proportions, and each rises
	into view as the reader scrolls to it (`Reveal`), the picture a beat after
	the words. `min-w-0` lets a half shrink below its content's width instead
	of pushing the page sideways on a phone.
-->
<section
	{id}
	aria-labelledby={headingId}
	class="mx-auto w-full max-w-[68.75rem] scroll-mt-20 px-4 py-[clamp(3.5rem,6.4vw,5rem)]"
>
	<div class="flex flex-wrap items-center {directionClass} {gapClass}">
		<Reveal class="min-w-0 {wordsClass}">
			<LandingHeading {headingId} {words} />

			<div class="mt-7">
				<LandingRowList {rows} />
			</div>
		</Reveal>

		<Reveal delay={120} class="min-w-0 {pictureClass}">
			{@render children()}
		</Reveal>
	</div>
</section>
