<script lang="ts">
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import type { ResolvedPathname } from '$app/types';
	import { Button } from '$lib/components/ui/button';
	import { CLOSING_BAND } from '$lib/organiser-close';

	type Props = {
		/** Where "Create a conference" goes: the creation flow, through sign up for a visitor. */
		createConferenceHref: ResolvedPathname;
		/** Where "or run a quick session" goes, through sign up for a visitor. */
		quickSessionHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte 5 component receives what its parent passes.
	let { createConferenceHref, quickSessionHref }: Props = $props();
</script>

<!--
	The last band of the page, after the landing page's closing band
	(`LandingCallToAction.svelte`): centred words over two soft blue ribbons,
	the page's primary button again, and a text link under it.

	The ribbons are two thick lines drawn as SVG paths and softened by
	`blur-lg` into bands of light. `preserveAspectRatio="none"` stretches the
	drawing to the section's width, and `vector-effect="non-scaling-stroke"`
	keeps the lines equally thick while it does. A phone leaves them out, where
	they would be squeezed into slashes.

	The button is a shadcn `Button` drawn as a pill; given an `href`, it draws a
	link. The heading is set in the serif's shape for large type, like the
	page's other section titles: `[font-variation-settings:normal]` lets the
	browser choose it.
-->
<section aria-labelledby="closing-title" class="relative overflow-hidden px-4 pt-10 pb-16">
	<svg
		aria-hidden="true"
		class="pointer-events-none absolute inset-0 hidden size-full text-brand-100 blur-lg md:block"
		viewBox="0 0 1672 240"
		preserveAspectRatio="none"
		fill="none"
	>
		<path
			d="M -40 30 C 150 50, 250 55, 350 100 S 550 165, 800 260"
			stroke="currentColor"
			stroke-width="56"
			vector-effect="non-scaling-stroke"
		/>
		<path
			d="M 950 260 C 1150 150, 1300 120, 1400 85 S 1600 30, 1720 -5"
			stroke="currentColor"
			stroke-width="56"
			vector-effect="non-scaling-stroke"
		/>
	</svg>

	<div class="relative flex flex-col items-center text-center">
		<h2
			id="closing-title"
			class="font-display text-h1-mobile font-medium text-balance text-ink-900 [font-variation-settings:normal] md:text-closing"
		>
			{CLOSING_BAND.title}
		</h2>
		<p class="mt-1 text-body text-ink-600">{CLOSING_BAND.text}</p>
		<Button href={createConferenceHref} class="mt-4 h-11 gap-2 rounded-full px-7 text-base">
			{CLOSING_BAND.createLabel}
			<ArrowRight aria-hidden="true" />
		</Button>
		<a
			href={quickSessionHref}
			class="mt-1 inline-flex min-h-11 items-center text-body font-medium text-brand-700 no-underline hover:text-brand-900"
		>
			{CLOSING_BAND.quickSessionLabel}
		</a>
	</div>
</section>
