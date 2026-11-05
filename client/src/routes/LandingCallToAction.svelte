<script lang="ts">
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import Reveal from '$lib/components/Reveal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { CLOSING_CALL } from '$lib/landing';
</script>

<!--
	The last band of the landing page, after its mockup (Trello RBz46aTQ): one
	more call to sign up, over two soft blue ribbons.

	The ribbons are two thick lines drawn as SVG paths, traced from the mockup,
	and `blur-lg` softens them into bands of light. `preserveAspectRatio="none"`
	stretches the drawing to fill the section whatever its width, and
	`vector-effect="non-scaling-stroke"` keeps the lines equally thick while it
	does. A phone leaves them out, where they would be squeezed into slashes.

	The heading is set in the serif's shape for large type, like the two at the
	top of the page; `HeroPitch.svelte` explains `[font-variation-settings:normal]`.
	The button is a shadcn `Button` drawn as the mockup's pill; given an
	`href`, it draws a link. The words rise into view through `Reveal`.
-->
<section class="relative overflow-hidden px-4 pt-10 pb-16">
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

	<Reveal class="relative">
		<div class="flex flex-col items-center gap-1 text-center">
			<h2
				class="font-display text-h1-mobile text-ink-900 [font-variation-settings:normal] md:text-h1 lg:text-closing"
			>
				{CLOSING_CALL.heading}
			</h2>
			<p class="text-body text-ink-600 lg:text-small">{CLOSING_CALL.text}</p>
			<div class="mt-3">
				<Button href={CLOSING_CALL.link.href} class="h-11 rounded-full px-7 text-base">
					{CLOSING_CALL.link.label}
					<ArrowRight aria-hidden="true" />
				</Button>
			</div>
		</div>
	</Reveal>
</section>
