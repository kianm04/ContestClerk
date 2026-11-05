<script lang="ts">
	import Check from '@lucide/svelte/icons/check';

	type Props = { isChosen: boolean };

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { isChosen }: Props = $props();
</script>

<!--
	The round mark in a choice card's top-right corner, 24 design pixels: the
	design's blue disc with a white tick on the chosen card, an empty 2 pixel
	ring on the others. The card's `aria-current` already tells a screen
	reader, so the mark is hidden from it.
-->
{#if isChosen}
	<span
		aria-hidden="true"
		class="absolute top-3.5 right-3.5 flex size-6 items-center justify-center rounded-full bg-creation-blue text-white"
	>
		<Check class="size-3.5" strokeWidth={3} />
	</span>
{:else}
	<span
		aria-hidden="true"
		class="absolute top-3.5 right-3.5 size-6 rounded-full border-2 border-creation-radio-border bg-white"
	></span>
{/if}
