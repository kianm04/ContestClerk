<script lang="ts">
	import type { Snippet } from 'svelte';
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import Reveal from '$lib/components/Reveal.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { LandingLink, LandingRow, LandingSectionWords } from '$lib/landing';
	import LandingHeading from './LandingHeading.svelte';
	import LandingRowList from './LandingRowList.svelte';

	type Props = {
		/** A short word for the section, such as `room`, to name its heading by. */
		id: string;
		words: LandingSectionWords;
		/** The rows under the words. */
		rows: LandingRow[];
		/** A pill link under the rows, or none. */
		link?: LandingLink;
		/** True puts the picture on the left instead of the right, for alternating sections. */
		isReversed?: boolean;
		/** The drawn picture of the product beside the words. */
		children: Snippet;
	};

	let { id, words, rows, link, isReversed = false, children }: Props = $props();

	// `$derived` works these out again if the props ever change.
	const headingId = $derived(`landing-${id}-heading`);

	/*
		Which side the picture sits on. From a tablet up the section is two
		columns, and a reversed section swaps them with `order`, so a page of
		sections puts the picture right, left, right. `order` moves what a reader
		sees and leaves the markup alone: a screen reader and the Tab key follow
		the markup, and hearing the words before the picture is the right way round.
	*/
	const wordsOrderClass = $derived(isReversed ? 'md:order-2' : '');
	const pictureOrderClass = $derived(isReversed ? 'md:order-1' : '');
</script>

<!--
	A section with words and rows on one side and a drawn picture of the
	product on the other, in the manner of the hero over the example: the
	words first, then a picture of what they describe. Each half rises into
	view on its own, the picture a beat after the words, and the rows follow
	one at a time.

	On a phone the grid has one column, `minmax(0,1fr)`. A grid column is
	never narrower than its widest content unless told it may be, so without
	the `0` the drawn console set the column's width and pushed the page off
	the side of the phone instead of shortening its own truncated lines.
-->
<section aria-labelledby={headingId} class="mx-auto w-full max-w-[68.75rem] px-4 py-14 md:py-20">
	<div class="grid grid-cols-[minmax(0,1fr)] items-center gap-10 md:grid-cols-2 md:gap-16">
		<Reveal class={wordsOrderClass}>
			<LandingHeading {headingId} {words} />

			<div class="mt-7">
				<LandingRowList {rows} />
			</div>

			{#if link}
				<div class="mt-8">
					<Button
						href={link.href}
						variant="outline"
						class="h-11 rounded-full border-line bg-surface px-6 text-base"
					>
						{link.label}
						<ArrowRight aria-hidden="true" />
					</Button>
				</div>
			{/if}
		</Reveal>

		<Reveal delay={120} class={pictureOrderClass}>
			{@render children()}
		</Reveal>
	</div>
</section>
