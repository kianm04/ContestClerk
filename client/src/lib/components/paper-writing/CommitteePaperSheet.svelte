<script lang="ts">
	import { COMMITTEE_PAPER_TEXT_CLASSES } from '$lib/paper-sheet';
	import type { ResolutionHeading } from '$lib/resolution-heading';
	import ResolutionSheetHeading from './ResolutionSheetHeading.svelte';

	type Props = {
		/** HTML that `renderMarkdown` in `$lib/server/markdown.ts` made from the paper's Markdown. */
		html: string;
		/** What a screen reader calls the sheet, such as "The working paper's text". */
		label: string;
		/** The lines a draft resolution or a directive opens with, drawn from the data. */
		heading?: ResolutionHeading;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { html, label, heading }: Props = $props();
</script>

<!--
	A paper written in committee, read only: the same sheet and type as its
	writer (`PaperEditor` with the committee paper look), without the toolbar.
	On a phone the screen is the sheet, so it has no border.

	`{@html}` draws a string as HTML instead of as text. It is only safe for HTML
	nobody can slip a script into, which is why it only ever draws what
	`renderMarkdown` made on the server. `resolution-text`, from the global
	stylesheet, letters a resolution's sub-clauses.
-->
<article
	aria-label={label}
	class={[
		'flex flex-col gap-4 pt-5 sm:border sm:border-border sm:px-8 sm:pt-10 sm:pb-12 lg:px-16 lg:pt-14 lg:pb-18',
		heading && 'resolution-text'
	]}
>
	{#if heading}
		<ResolutionSheetHeading {heading} />
	{/if}
	<div class={COMMITTEE_PAPER_TEXT_CLASSES}>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- made safe on the server, as said above -->
		{@html html}
	</div>
</article>
