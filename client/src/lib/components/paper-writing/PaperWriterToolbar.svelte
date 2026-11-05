<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import AddComment from 'carbon-icons-svelte/lib/AddComment.svelte';
	import ListBulleted from 'carbon-icons-svelte/lib/ListBulleted.svelte';
	import ListNumbered from 'carbon-icons-svelte/lib/ListNumbered.svelte';
	import {
		applyMarkdownCommand,
		applyMarkdownTextStyle,
		type MarkdownFormatting
	} from '$lib/markdown-editor';
	import type { PaperMargin } from '$lib/paper-margin-state.svelte';
	import { SEPARATOR_CLASSES, TOOL_CLASSES, WORD_TOOL_CLASSES } from '$lib/paper-toolbar';
	import PaperLetterTools from './PaperLetterTools.svelte';
	import PaperModeMenu from './PaperModeMenu.svelte';
	import ResolutionTools from './ResolutionTools.svelte';

	type Props = {
		/** The editor the toolbar formats. */
		editor: Editor;
		/** The id of the writing area the toolbar formats. */
		controls: string;
		/** Which formatting the text at the cursor has, so its button shows as pressed. */
		formatting: MarkdownFormatting;
		/** A live paper's margin, which adds "Editing" or "Suggesting" and "Comment". */
		margin?: PaperMargin;
		/** True for a draft resolution or a directive, whose clauses take the place of headings and lists. */
		isResolution?: boolean;
	};

	let { editor, controls, formatting, margin, isResolution = false }: Props = $props();

	// A suggestion is made of words, so a heading or a list cannot be suggested yet.
	const isSuggesting = $derived(margin?.isSuggesting ?? false);

	/** The heading button turns the line into a heading, or back into normal text. */
	function handleHeadingClick() {
		applyMarkdownTextStyle(editor, formatting.textStyle === 'heading' ? 'paragraph' : 'heading');
	}
</script>

<!--
	The paper writer's formatting, as drawn for it: on a live paper the mode
	first, then a heading, the three text marks, the two lists and "Comment".
	A draft resolution has no headings or lists: its clauses are numbered as
	they are written, so it has the indent buttons and "Opening phrase" in
	their place. A link is added with Ctrl+K or Cmd+K. On a phone the mode
	sits under the title and "Comment" in the bar at the bottom.
	`role="toolbar"` tells a screen reader these buttons all work on the
	writing area below.
-->
<div
	role="toolbar"
	aria-label="Formatting"
	aria-controls={controls}
	class="flex flex-wrap items-center gap-0.5 border-b border-border py-1 sm:border-b-0 sm:py-0"
>
	{#if margin}
		<div class="max-sm:hidden"><PaperModeMenu {editor} {isSuggesting} /></div>
		<span aria-hidden="true" class={SEPARATOR_CLASSES}></span>
	{/if}
	{#if isResolution}
		<PaperLetterTools {editor} {formatting} />
		<ResolutionTools {editor} {isSuggesting} />
	{:else}
		<button
			type="button"
			aria-label="Heading"
			title="Heading"
			aria-pressed={formatting.textStyle === 'heading'}
			disabled={isSuggesting}
			class="{TOOL_CLASSES} font-display text-h3"
			onclick={handleHeadingClick}
		>
			H
		</button>
		<PaperLetterTools {editor} {formatting} />
		<button
			type="button"
			aria-label="Bulleted list"
			title="Bulleted list"
			aria-pressed={formatting.bulletList}
			disabled={isSuggesting}
			class={TOOL_CLASSES}
			onclick={() => applyMarkdownCommand(editor, 'bulletList')}
		>
			<ListBulleted size={16} aria-hidden="true" />
		</button>
		<button
			type="button"
			aria-label="Numbered list"
			title="Numbered list"
			aria-pressed={formatting.orderedList}
			disabled={isSuggesting}
			class={TOOL_CLASSES}
			onclick={() => applyMarkdownCommand(editor, 'orderedList')}
		>
			<ListNumbered size={16} aria-hidden="true" />
		</button>
	{/if}
	{#if margin}
		<span aria-hidden="true" class={SEPARATOR_CLASSES}></span>
		<button
			type="button"
			class="{WORD_TOOL_CLASSES} max-sm:hidden"
			onclick={() => margin.startComment()}
		>
			<AddComment size={16} aria-hidden="true" />
			Comment
		</button>
	{/if}
</div>
