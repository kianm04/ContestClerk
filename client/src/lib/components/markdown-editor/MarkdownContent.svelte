<script lang="ts">
	import { MARKDOWN_CONTENT_CLASSES } from '$lib/markdown';
	import { PAPER_SHEET_CLASSES } from '$lib/paper-sheet';

	type Props = {
		/** HTML that `renderMarkdown` in `$lib/server/markdown.ts` made from Markdown. */
		html: string;
		/** True for the text of a paper, drawn in the paper's own typeface (Trello S6HLyL5Y). */
		isSheet?: boolean;
	};

	let { html, isSheet = false }: Props = $props();

	// `$derived` picks the classes again should `isSheet` change.
	const classes = $derived(
		isSheet ? `${MARKDOWN_CONTENT_CLASSES} ${PAPER_SHEET_CLASSES}` : MARKDOWN_CONTENT_CLASSES
	);
</script>

<!--
	`{@html}` draws a string as HTML instead of as text. It is only safe for HTML
	nobody can slip a script into, which is why it only ever draws what
	`renderMarkdown` made on the server.
-->
<div class={classes}>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- made safe on the server, as said above -->
	{@html html}
</div>
