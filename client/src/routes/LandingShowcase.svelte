<script lang="ts">
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import { SHOWCASE_STORIES, type ShowcaseView } from '$lib/landing-showcase';
	import DelegateSlides from './DelegateSlides.svelte';
	import ShowcaseConferenceCard from './ShowcaseConferenceCard.svelte';
	import ShowcaseJourney from './ShowcaseJourney.svelte';
	import ShowcaseSwitch from './ShowcaseSwitch.svelte';

	type Props = {
		/** Whose view of the example is shown, read from the address by `load`. */
		view: ShowcaseView;
	};

	let { view }: Props = $props();

	// `$derived` picks the story again whenever the switch changes the view.
	const story = $derived(SHOWCASE_STORIES[view]);
</script>

<!--
	The example under the hero, after the landing page's mockup (Trello
	RBz46aTQ): a switch, then a conference card and, past an arrow, how that
	conference looks to a delegate or an organiser using MUNMeet.

	The cards are a picture of the product rather than the product, so they sit
	in a `<figure>`, hidden from screen readers with `aria-hidden`, and the
	`<figcaption>` says in words what they show. `sr-only` hides the caption
	and the heading on screen, since the mockup draws neither.

	The delegate's view is a carousel of five slides instead (Trello BJyr90Wx),
	which runs the full width of the window and says in its pictures' `alt`
	what each stage shows; the organiser's view still has the two cards.

	The whole example settles into place a beat after the hero's words, as the
	page loads, and stays still for anybody who asked for less motion.
-->
<section
	aria-labelledby="landing-example-heading"
	class="relative animate-in px-4 delay-300 duration-700 ease-out fill-mode-both fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
>
	<h2 id="landing-example-heading" class="sr-only">See how it works</h2>

	<ShowcaseSwitch {view} />

	<figure class={['mx-auto mt-3.5', view === 'organiser' && 'max-w-[68.75rem]']}>
		<figcaption class="sr-only">{story.description}</figcaption>

		{#if view === 'delegate'}
			<DelegateSlides />
		{:else}
			<div
				aria-hidden="true"
				class="grid gap-6 lg:grid-cols-[minmax(0,32.375rem)_1fr_minmax(0,31.5rem)] lg:gap-0"
			>
				<ShowcaseConferenceCard />
				<ArrowRight
					size={32}
					class="hidden self-center justify-self-center text-brand-700/50 lg:block"
				/>
				<ShowcaseJourney {story} />
			</div>
		{/if}
	</figure>
</section>
