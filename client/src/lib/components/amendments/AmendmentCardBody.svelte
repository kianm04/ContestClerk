<script lang="ts">
	import type { AmendmentCard } from '$lib/amendment-cards';

	type Props = {
		/** The amendment, put into words on the server by `amendmentCards`. */
		card: AmendmentCard;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { card }: Props = $props();

	/* Written out in full, because Tailwind reads the class names out of this file. */
	const DOT_CLASSES = {
		neutral: 'bg-placeholder',
		success: 'bg-success',
		warning: 'bg-warning',
		danger: 'bg-destructive'
	};
</script>

<!--
	What one amendment says, as its card in the margin of a draft and on the
	dais's review show it: its number and where it stands, the change in one
	sentence, and who proposed it and when. The dot repeats the word in
	colour, so a screen reader skips it.
-->
<div class="flex items-baseline justify-between gap-3">
	<h3 class="text-small font-semibold text-foreground">{card.name}</h3>
	<span class="inline-flex items-center gap-1.5 text-caption whitespace-nowrap text-foreground">
		<span aria-hidden="true" class="size-1.5 shrink-0 rounded-full {DOT_CLASSES[card.tone]}"></span>
		{card.statusWord}
	</span>
</div>
<!--
	The sentence is safe HTML: `renderMarkdown` on the server sanitises it,
	and `{@html}` draws it as HTML instead of as text, so an underlined
	opening phrase stays underlined.
-->
<p class="mt-1.5 text-[0.875rem]/[1.375rem] break-words text-foreground">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- made safe on the server, as said above -->
	{@html card.sentenceHtml}
</p>
<p class="mt-1.5 text-caption text-muted-foreground">{card.metaLine}</p>
{#if card.answersLine}
	<p class="mt-1 text-caption text-muted-foreground">{card.answersLine}</p>
{/if}
{#if card.ruling}
	<!-- Why the dais ruled it out of order; the word above already says that it did. -->
	<p class="mt-1.5 text-caption text-foreground">{card.ruling}</p>
{/if}
