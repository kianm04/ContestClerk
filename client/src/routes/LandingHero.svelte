<script lang="ts">
	import { DELEGATE_PITCH, ORGANISER_PITCH } from '$lib/landing';
	import HeroBackdrop from './HeroBackdrop.svelte';
	import HeroPitch from './HeroPitch.svelte';
</script>

<!--
	The top of the landing page, after its mockup (Trello RBz46aTQ): what
	MUNMeet offers delegates on the left and organisers on the right, each over
	a picture of its own.

	The page as a whole starts 4rem higher than usual, behind the top bar (see
	`+page.svelte`), so `pt-16` puts the words back under the bar while the
	pictures stay behind it. `relative` makes the section the box the pictures
	are placed against.

	The page needs one `<h1>` above the two halves' headings. The mockup draws
	none, so this one is for screen readers only: `sr-only` hides it on screen.
-->
<section class="relative px-4 pt-16">
	<HeroBackdrop />

	<h1 class="sr-only">MUNMeet, for Model UN delegates and organisers</h1>

	<!--
		Two columns from `lg` up, the second as wide as the card under it, so the
		organisers' words start where that card does.
	-->
	<div
		class="relative mx-auto grid max-w-[68.75rem] gap-12 pt-10 pb-16 lg:grid-cols-[minmax(0,1fr)_25.875rem] lg:gap-0 lg:pb-15"
	>
		<HeroPitch pitch={DELEGATE_PITCH} side="delegate" />
		<HeroPitch pitch={ORGANISER_PITCH} side="organiser" />
	</div>
</section>
