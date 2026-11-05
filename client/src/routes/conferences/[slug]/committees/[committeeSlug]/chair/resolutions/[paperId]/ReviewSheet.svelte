<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import { untrack } from 'svelte';
	import ResolutionSheetHeading from '$lib/components/paper-writing/ResolutionSheetHeading.svelte';
	import { base64ToBytes, openPaperDocument, seedPaperDocument } from '$lib/paper-document';
	import type { PaperMargin } from '$lib/paper-margin-state.svelte';
	import { createPaperReadingEditor } from '$lib/paper-reading-editor';
	import { COMMITTEE_PAPER_TEXT_CLASSES } from '$lib/paper-sheet';
	import type { ResolutionChecks } from '$lib/resolution-checks-state.svelte';
	import type { ResolutionHeading } from '$lib/resolution-heading';

	type Props = {
		/** The paper's Yjs document as submitted, in base64, or `null` when only Markdown was saved. */
		documentState: string | null;
		/** The paper's Markdown, which seeds a document when none was stored. */
		body: string;
		/** The same text as HTML from the server, drawn until the editor starts, and without JavaScript. */
		bodyHtml: string;
		/** What a screen reader calls the sheet, such as "The draft resolution's text". */
		label: string;
		/** The id of the page's title, which names the text. */
		labelledBy: string;
		heading: ResolutionHeading | null;
		margin: PaperMargin;
		checks: ResolutionChecks | null;
	};

	let { documentState, body, bodyHtml, label, labelledBy, heading, margin, checks }: Props =
		$props();

	// `$state.raw` keeps Svelte from looking inside the library's own object.
	let editor: Editor | null = $state.raw(null);
	// Tiptap draws the text into an element it is handed; `bind:this` puts it here.
	let readingArea: HTMLDivElement | undefined = $state();

	/*
		Opens the paper's document as it was submitted, or one seeded from its
		Markdown exactly as the authors' page seeds it, so the notes' anchors
		point at the same words. The document joins no channel and is never
		saved: nothing done here reaches the paper. `$effect` never runs on the
		server, so without JavaScript the HTML below is all there is.
	*/
	$effect(() => {
		if (!readingArea) return;

		const state = untrack(() => documentState);
		const document = openPaperDocument(
			state === null ? seedPaperDocument(untrack(() => body)) : base64ToBytes(state)
		);
		const started = createPaperReadingEditor({
			element: readingArea,
			document,
			id: 'paper-text',
			labelledBy: untrack(() => labelledBy),
			extensions: untrack(() => [...margin.extensions, ...(checks?.extensions ?? [])])
		});
		editor = started;
		const detachMargin = untrack(() => margin.attach(started));
		const detachChecks = untrack(() => checks?.attach(started));

		return () => {
			detachMargin();
			detachChecks?.();
			started.destroy();
			document.destroy();
			editor = null;
		};
	});
</script>

<!--
	The paper as it was submitted, read only, on the same sheet and in the same
	type as its writer. On a phone the screen is the sheet, so it has no
	border. `resolution-text`, from the global stylesheet, letters a
	resolution's sub-clauses.
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
	<!-- `overflow-x-clip` keeps a long word from widening a phone's page, as the writer's sheet does. -->
	<div class="relative overflow-x-clip" hidden={editor === null}>
		<div bind:this={readingArea}></div>
	</div>
	{#if editor === null}
		<!--
			`{@html}` draws a string as HTML instead of as text. It only ever draws
			what `renderMarkdown` made on the server, which nobody can slip a script into.
		-->
		<div class={COMMITTEE_PAPER_TEXT_CLASSES}>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- made safe on the server, as said above -->
			{@html bodyHtml}
		</div>
	{/if}
</article>
