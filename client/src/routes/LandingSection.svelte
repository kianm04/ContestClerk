<script lang="ts">
	import type { Snippet } from 'svelte';
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import type { ResolvedPathname } from '$app/types';
	import Reveal from '$lib/components/Reveal.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { LandingSectionWords } from '$lib/landing';
	import LandingHeading from './LandingHeading.svelte';

	type Props = {
		/** A short word for the section, such as `journey`, to name its heading by. */
		id: string;
		words: LandingSectionWords;
		/**
		 * A link beside the words, such as "All conferences". Build it with a
		 * helper from `$lib/urls.ts`; a hand-written string is refused by the
		 * type check. Without one, no link is shown.
		 */
		linkHref?: ResolvedPathname;
		linkLabel?: string;
		/** True centres the words, for a section that runs the full width. */
		isCentred?: boolean;
		/** The section's body. */
		children: Snippet;
	};

	let { id, words, linkHref, linkLabel = '', isCentred = false, children }: Props = $props();

	// `$derived` works these out again if the props ever change.
	const headingId = $derived(`landing-${id}-heading`);
	const headerClasses = $derived(
		isCentred
			? 'flex flex-col items-center gap-5'
			: 'flex flex-col gap-5 md:flex-row md:items-end md:justify-between'
	);
</script>

<!--
	One section of the landing page: its words, an optional link, and then its
	body. The region is as wide as the hero's words, so everything down the
	page lines up with the headlines at the top.

	`aria-labelledby` points the `<section>` at its own heading, which makes it
	a named region that a screen reader can jump to and a browser test can find
	by name. The words rise into view through `Reveal`; the body is left to
	each section, which usually staggers its own items.

	The link is a shadcn `Button` drawn as an outline pill, the shape of the
	hero's links. Given an `href`, `Button` draws a link.
-->
<section aria-labelledby={headingId} class="mx-auto w-full max-w-[68.75rem] px-4 py-14 md:py-20">
	<Reveal>
		<div class={headerClasses}>
			<LandingHeading {headingId} {words} {isCentred} />

			{#if linkHref}
				<Button
					href={linkHref}
					variant="outline"
					class="h-11 shrink-0 rounded-full border-line bg-surface px-6 text-base"
				>
					{linkLabel}
					<ArrowRight aria-hidden="true" />
				</Button>
			{/if}
		</div>
	</Reveal>

	<div class="mt-8 md:mt-10">
		{@render children()}
	</div>
</section>
