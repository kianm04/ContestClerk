<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import { Button } from '$lib/components/ui/button';
	import HeroPicture from './HeroPicture.svelte';
	import OrganiserHeroBackdrop from './OrganiserHeroBackdrop.svelte';

	type Props = {
		/** Straight to the form when signed in, through sign up first for a visitor. */
		createConferenceHref: ResolvedPathname;
		/** The same for a quick session. */
		quickSessionHref: ResolvedPathname;
	};

	// `$props()` hands a component what its parent passed it.
	let { createConferenceHref, quickSessionHref }: Props = $props();

	/* The two buttons are shadcn `Button`s drawn as the landing page's pills,
	   44px tall and round-ended. Only sizing and colour classes are passed,
	   never a project type token, which the class merger would mistake for a
	   colour. */
	const PILL_CLASSES = 'h-11 rounded-full text-base';
</script>

<!--
	The top of the page: the promise on the left, over the organisers' desk, and
	a drawn dashboard with a delegate's phone on the right.

	The two halves wrap rather than sit in a grid, as the design draws them: the
	words never grow past 28rem and the picture takes what is left, so from
	about 1024px they share a row and below it the picture drops under the
	words. `min-w-0` lets each half shrink below its content's width instead of
	pushing the page sideways on a phone.
-->
<section aria-labelledby="hero-title" class="relative px-4">
	<OrganiserHeroBackdrop />

	<div
		class="relative mx-auto flex max-w-[66.75rem] flex-wrap items-start gap-12 pt-11 pb-6 lg:pb-2"
	>
		<div class="min-w-0 flex-[0_1_28rem] lg:pt-9">
			<p class="text-label tracking-[0.14em] text-sand-700 uppercase">For organisers</p>

			<!-- `text-balance` evens out the lines, so no word is left alone on the last. -->
			<h1
				id="hero-title"
				class="mt-2.5 font-display text-[clamp(2rem,1.2rem_+_2.6vw,2.875rem)]/[clamp(2.25rem,1.3rem_+_2.6vw,2.875rem)] font-medium text-balance text-ink-900 [font-variation-settings:normal]"
			>
				One system, from the first application to the final vote.
			</h1>

			<p class="mt-3 text-base/6 text-ink-600">
				Registration and the committee room in one place. Give a delegate a seat once, and their
				invoice, their position paper and the chair's roll call all follow from it.
			</p>

			<div class="mt-6 flex flex-wrap gap-3">
				<Button href={createConferenceHref} class="{PILL_CLASSES} px-7">
					Create a conference
					<ArrowRight aria-hidden="true" />
				</Button>
				<Button
					href={quickSessionHref}
					variant="outline"
					class="{PILL_CLASSES} border-line bg-surface px-6"
				>
					Run a quick session
				</Button>
			</div>

			<p class="mt-4 text-small text-ink-600">
				A draft stays private until you publish it. €2.00 for each seat paid by card, nothing if you
				collect fees yourselves.
			</p>
		</div>

		<div class="min-w-0 flex-[1_1_30rem]">
			<HeroPicture />
		</div>
	</div>
</section>
