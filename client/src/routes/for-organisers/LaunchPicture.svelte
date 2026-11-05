<script lang="ts">
	import LaunchPicturePublicPage from './LaunchPicturePublicPage.svelte';
	import LaunchPictureSteps from './LaunchPictureSteps.svelte';
</script>

<!--
	The picture for "Before you open": one card in two halves, the public page
	a draft becomes on the left and the last of the five steps of setting up on
	the right. It is a drawing of the product, so the whole of it is hidden from
	screen readers (`aria-hidden`) and the sentence before it says what it shows.

	The hairline between the halves is the card's own grey showing through a
	1px gap (`gap-px`). The halves wrap one under the other when the card is too
	narrow for both, so the picture needs no phone layout of its own.
-->
<p class="sr-only">
	A drawing of the last step of setting up Northbridge MUN 2027: its public page beside the five
	steps, with "Publish and open applications" chosen above the Publish button.
</p>

<div
	aria-hidden="true"
	class="flex flex-wrap gap-px overflow-hidden rounded-xl bg-neutral-100 text-ink-900 shadow-card"
>
	<LaunchPicturePublicPage />
	<LaunchPictureSteps />
</div>
