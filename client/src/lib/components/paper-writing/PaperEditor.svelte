<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import { untrack } from 'svelte';
	import LinkPopover from '$lib/components/markdown-editor/LinkPopover.svelte';
	import {
		NO_FORMATTING,
		createMarkdownEditor,
		focusMarkdownEditor,
		type EditorLook
	} from '$lib/markdown-editor';
	import type { LiveDocument } from '$lib/markdown-editor-live';
	import type { PaperMargin } from '$lib/paper-margin-state.svelte';
	import type { PaperHeading } from '$lib/paper-sheet';
	import type { ResolutionChecks } from '$lib/resolution-checks-state.svelte';
	import type { ResolutionHeading } from '$lib/resolution-heading';
	import PaperSheetText from './PaperSheetText.svelte';
	import PaperWriterToolbar from './PaperWriterToolbar.svelte';

	type Props = {
		/** The name the Markdown is sent under when the form around the editor is submitted. */
		name: string;
		/** What the editor starts with when it is not written live. Later changes are ignored. */
		initialMarkdown: string;
		/** The id of the heading that names the writing area. */
		labelledBy: string;
		/** What an empty paper says, naming what goes in it. */
		placeholder: string;
		/** Called with the Markdown after every change, the others' too when written live. */
		onChange?: (markdown: string) => void;
		/** The shared document, for a paper several people write at once (T148). */
		live?: LiveDocument;
		/** Whose text this is: a position paper, or a paper written in committee. */
		look: Exclude<EditorLook, 'box'>;
		/** What a screen reader calls the sheet, such as "The working paper's text". */
		sheetLabel: string;
		/** The lines a position paper opens with, drawn above its text. */
		sheetHeading?: PaperHeading;
		/** The comments and suggestions beside a live paper, which follow this editor. */
		margin?: PaperMargin;
		/**
		 * A draft resolution's or a directive's clauses: their opening phrases
		 * styled, their format checks followed, and the heading drawn from the data.
		 */
		resolution?: { checks: ResolutionChecks; heading: ResolutionHeading; isDraft: boolean };
	};

	let {
		name,
		initialMarkdown,
		labelledBy,
		placeholder,
		onChange,
		live,
		look,
		sheetLabel,
		sheetHeading,
		margin,
		resolution
	}: Props = $props();

	// `$props.id()` gives this editor an id of its own, the same on the server and in the browser.
	const uid = $props.id();

	// The Markdown now. It starts from `initialMarkdown` once and then follows the typing.
	// svelte-ignore state_referenced_locally
	let markdown = $state(initialMarkdown);
	let isLinkOpen = $state(false);
	let formatting = $state(NO_FORMATTING);
	// `$state.raw` keeps Svelte from looking inside the library's own object.
	let editor: Editor | null = $state.raw(null);
	// Tiptap draws its writing area into an element it is handed; `bind:this` puts it here.
	let writingArea: HTMLDivElement | undefined = $state();

	/*
		Starts the editor once the element above exists, and stops it when this
		component goes away. `$effect` never runs on the server, so without
		JavaScript the plain Markdown box is all there is.
	*/
	$effect(() => {
		if (!writingArea) return;

		const started = createMarkdownEditor({
			element: writingArea,
			markdown: untrack(() => markdown),
			id: `${uid}-editor`,
			labelledBy: untrack(() => labelledBy),
			placeholder: untrack(() => placeholder),
			onChange: handleMarkdownChange,
			onFormattingChange: (next) => (formatting = next),
			onLinkShortcut: () => (isLinkOpen = true),
			live: untrack(() => live),
			look: untrack(() => look),
			extensions: untrack(() => [
				...(margin?.extensions ?? []),
				...(resolution?.checks.extensions ?? [])
			])
		});
		editor = started;
		const detachMargin = untrack(() => margin?.attach(started));
		const detachChecks = untrack(() => resolution?.checks.attach(started));

		return () => {
			detachMargin?.();
			detachChecks?.();
			started.destroy();
		};
	});

	function handleMarkdownChange(next: string) {
		markdown = next;
		onChange?.(next);
	}

	function handleLinkClose() {
		isLinkOpen = false;
		if (editor) focusMarkdownEditor(editor);
	}
</script>

<!-- The toolbar, with the box for a link's address opening just under it, over the text. -->
<div class="relative mb-2">
	{#if editor}
		<PaperWriterToolbar
			{editor}
			controls={`${uid}-editor`}
			{formatting}
			{margin}
			isResolution={resolution !== undefined}
		/>
		{#if isLinkOpen}
			<LinkPopover {editor} onClose={handleLinkClose} />
		{/if}
	{/if}
</div>

<PaperSheetText
	bind:writingArea
	isEditorRunning={editor !== null}
	{markdown}
	{name}
	{labelledBy}
	{placeholder}
	{sheetLabel}
	{sheetHeading}
	resolutionHeading={resolution?.heading}
	isSerif={look === 'position-paper'}
	isResolution={resolution?.isDraft ?? false}
	onInput={handleMarkdownChange}
/>
