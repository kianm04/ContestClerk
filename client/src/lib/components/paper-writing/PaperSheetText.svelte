<script lang="ts">
	import MarkdownTextArea from '$lib/components/markdown-editor/MarkdownTextArea.svelte';
	import type { PaperHeading } from '$lib/paper-sheet';
	import type { ResolutionHeading } from '$lib/resolution-heading';
	import PaperSheetHeading from './PaperSheetHeading.svelte';
	import ResolutionPlainBoxes from './ResolutionPlainBoxes.svelte';
	import ResolutionSheetHeading from './ResolutionSheetHeading.svelte';

	type Props = {
		/** The element the editor draws its writing area into, handed back up with `bind:`. */
		writingArea?: HTMLDivElement;
		/** True once the editor has started, which hides the plain box. */
		isEditorRunning: boolean;
		/** The Markdown now, for the plain box and to know when the paper is empty. */
		markdown: string;
		name: string;
		labelledBy: string;
		placeholder: string;
		/** What a screen reader calls the sheet, such as "The working paper's text". */
		sheetLabel: string;
		/** The lines a position paper opens with, drawn above its text. */
		sheetHeading?: PaperHeading;
		/** The lines a draft resolution or a directive opens with, drawn from the data. */
		resolutionHeading?: ResolutionHeading;
		/** A position paper's placeholder is set in the serif its text is. */
		isSerif: boolean;
		/** A draft resolution, which without JavaScript is written in two boxes, its two parts. */
		isResolution?: boolean;
		onInput: (markdown: string) => void;
	};

	// `$bindable()` lets the parent write `bind:writingArea` and read the element back.
	let {
		writingArea = $bindable(),
		isEditorRunning,
		markdown,
		name,
		labelledBy,
		placeholder,
		sheetLabel,
		sheetHeading,
		resolutionHeading,
		isSerif,
		isResolution = false,
		onInput
	}: Props = $props();
</script>

<!--
	The sheet the paper is written on. Its border turns light blue while the
	cursor is in the text (`focus-within:`), which is all the focus ring the
	writing area has. On a phone the screen is the sheet, so it has no border.
	`resolution-text`, from the global stylesheet, letters a resolution's sub-clauses.
-->
<article
	aria-label={sheetLabel}
	class={[
		'flex flex-col gap-4 pt-5 transition-colors sm:border sm:border-border sm:px-8 sm:pt-10 sm:pb-12 sm:focus-within:border-ring lg:px-16 lg:pt-14 lg:pb-18',
		resolutionHeading && 'resolution-text'
	]}
>
	{#if sheetHeading}
		<PaperSheetHeading heading={sheetHeading} />
	{:else if resolutionHeading}
		<ResolutionSheetHeading heading={resolutionHeading} />
	{/if}
	<!--
		`overflow-x-clip` cuts off the name over somebody's cursor at the paper's
		right edge, which would otherwise widen a phone's page. It clips sideways
		only, so the name above the first line still shows.
	-->
	<div class="relative overflow-x-clip" hidden={!isEditorRunning}>
		<!-- Drawn over the empty paper. A screen reader hears it from `aria-placeholder` instead. -->
		{#if markdown === ''}
			<p
				class="pointer-events-none absolute top-0 left-0 text-body text-placeholder"
				class:font-display={isSerif}
				aria-hidden="true"
			>
				{placeholder}
			</p>
		{/if}
		<div bind:this={writingArea}></div>
	</div>
	<!-- Without JavaScript the plain box is the whole editor, sent under the same name. -->
	{#if isResolution}
		<div hidden={isEditorRunning}>
			<ResolutionPlainBoxes {markdown} {onInput} />
		</div>
	{:else}
		<div class="rounded-control border border-input" hidden={isEditorRunning}>
			<MarkdownTextArea {name} value={markdown} {labelledBy} {placeholder} {onInput} />
		</div>
	{/if}
</article>
