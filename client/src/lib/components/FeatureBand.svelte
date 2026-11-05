<script lang="ts">
	import type { Snippet } from 'svelte';
	import { publicMediaUrl } from '$lib/media';

	type Props = {
		/** A small word above the title, such as "For organisers". */
		eyebrow: string;
		title: string;
		description: string;
		/** Where the picture sits in the `public-media` bucket. Without it the band is text only. */
		imagePath?: string | null;
		/**
		 * What the picture shows. With `imagePath` it is the picture's alt text.
		 * Without one, the band draws a `brand-50` box with this caption in it, in the
		 * place a screenshot not yet taken will go.
		 */
		imageCaption?: string;
		/** True puts the picture on the left instead of the right, for alternating bands. */
		isReversed?: boolean;
		/** A button or link under the description. */
		children?: Snippet;
	};

	let {
		eyebrow,
		title,
		description,
		imagePath,
		imageCaption,
		isReversed = false,
		children
	}: Props = $props();

	/*
		Which side of the band each half sits on.

		The `md:` half is the alternation: from a tablet up the band is two
		columns, and a reversed band swaps them so that a page of bands puts the
		picture left, right, left, right.

		The `order-1` and `order-2` without a prefix are the phone layout, where
		the band is a single column. `05-pages/public/for-organisers.md` asks for
		the picture above the text there, on every band, so both halves carry the
		same pair whether the band is reversed or not. It is done with `order`
		rather than by writing the picture first in the markup, because `order`
		moves what a reader sees and leaves the markup alone: a screen reader and
		the Tab key follow the markup, and hearing "A public page in an afternoon"
		before the caption of its screenshot is the right way round.
	*/
	const textOrderClass = $derived(isReversed ? 'order-2 md:order-2' : 'order-2 md:order-1');
	const imageOrderClass = $derived(isReversed ? 'order-1 md:order-1' : 'order-1 md:order-2');
</script>

<!-- No padding of its own: the page that lists the bands puts its 40px section gap
	between them, as `/for-organisers` does. With padding here as well, two bands
	were 80px apart and the first sat 80px under the page header. -->
<section class="grid items-center gap-6 md:grid-cols-2">
	<div class={textOrderClass}>
		<p class="text-label text-brand-700 uppercase">{eyebrow}</p>
		<h2 class="mt-1 font-display text-h1-mobile text-brand-900 md:text-h1">{title}</h2>
		<p class="mt-2 max-w-prose text-body text-ink-600">{description}</p>

		{#if children}
			<div class="mt-4 flex flex-wrap items-center gap-2">
				{@render children()}
			</div>
		{/if}
	</div>

	<!--
		16:10 rather than a photograph's 4:3, because the pictures a band shows are
		screenshots of pages, which are wider than they are tall. `object-cover`
		crops whatever it is given to that shape, from the top, where a page's
		heading is. The quiet border and shadow set a screenshot's own white page
		apart from the grey page it sits on.

		The caption is the alt text: a screenshot is the product itself, so a
		screen reader is told what it shows. With no caption it stays `alt=""`,
		because the band's title and description already say what it is about.
	-->
	{#if imagePath}
		<img
			src={publicMediaUrl(imagePath)}
			alt={imageCaption ?? ''}
			class="aspect-[16/10] w-full rounded-2xl border border-line object-cover object-top shadow-card {imageOrderClass}"
		/>
	{:else if imageCaption}
		<!--
			A stand-in for a screenshot that has not been taken yet. It is the same
			shape, the same size and on the same side as the real picture, so adding
			the picture later changes nothing about the layout.
		-->
		<div
			class="flex aspect-[16/10] w-full items-center justify-center rounded-2xl bg-brand-50 px-4 text-center text-small text-brand-700 {imageOrderClass}"
		>
			{imageCaption}
		</div>
	{/if}
</section>
