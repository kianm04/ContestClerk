<script lang="ts">
	import type { LandingSectionWords } from '$lib/landing';

	type Props = {
		/** The id the section's `aria-labelledby` points at. */
		headingId: string;
		/** The small capitals, the title and the sentence. */
		words: LandingSectionWords;
		/** True centres the words, for a section that runs the full width. */
		isCentred?: boolean;
	};

	let { headingId, words, isCentred = false }: Props = $props();

	// `$derived` picks the classes again if `isCentred` ever changes.
	const blockClasses = $derived(
		isCentred ? 'mx-auto flex max-w-2xl flex-col items-center text-center' : 'max-w-2xl'
	);
</script>

<!--
	The words at the top of a section, in the manner of the hero's two halves
	(`HeroPitch.svelte`): small blue capitals, a title in the serif, and one
	sentence in grey. `[font-variation-settings:normal]` lets the browser use
	the serif's finer shape for large type, as the hero's headlines do.
-->
<div class={blockClasses}>
	<p class="text-label tracking-[0.14em] text-brand-700 uppercase">{words.eyebrow}</p>

	<h2
		id={headingId}
		class="mt-2.5 font-display text-h1-mobile font-medium text-ink-900 [font-variation-settings:normal] md:text-closing"
	>
		{words.title}
	</h2>

	{#if words.lead}
		<p class="mt-2.5 text-body text-ink-600">{words.lead}</p>
	{/if}
</div>
