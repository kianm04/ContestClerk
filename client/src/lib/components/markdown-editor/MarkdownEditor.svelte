<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import { tick, untrack } from 'svelte';
	import { NO_FORMATTING, createMarkdownEditor, focusMarkdownEditor } from '$lib/markdown-editor';
	import EditorPlaceholder from './EditorPlaceholder.svelte';
	import MarkdownTextArea from './MarkdownTextArea.svelte';
	import MarkdownToolbar from './MarkdownToolbar.svelte';

	type Props = {
		/** The name the Markdown is sent under when the form around the editor is submitted. */
		name: string;
		/** What the editor starts with. Later changes to it are ignored. */
		initialMarkdown: string;
		/** The id of the heading or label that names the writing area. */
		labelledBy: string;
		placeholder?: string;
		/** A smaller toolbar, without the heading menu, for short notes. */
		isCompact?: boolean;
		/** Puts the cursor in the writing area as soon as it starts, and whenever this turns on. */
		hasAutofocus?: boolean;
		/** Called with the Markdown after every change. */
		onChange?: (markdown: string) => void;
	};

	let {
		name,
		initialMarkdown,
		labelledBy,
		placeholder = 'Write here…',
		isCompact = false,
		hasAutofocus = false,
		onChange
	}: Props = $props();

	// `$props.id()` gives this editor an id of its own, the same on the server and in the browser.
	const uid = $props.id();

	// The Markdown now. It starts from `initialMarkdown` once and then follows the typing.
	// svelte-ignore state_referenced_locally
	let markdown = $state(initialMarkdown);
	let isMarkdownShown = $state(false);
	let isLinkOpen = $state(false);
	let formatting = $state(NO_FORMATTING);
	// `$state.raw` keeps Svelte from looking inside the library's own object.
	let editor: Editor | null = $state.raw(null);
	/*
		`bind:this` puts the real element here once Svelte has drawn it. Tiptap
		draws its writing area into an element it is handed, which is why this
		component needs `bind:this` (see CLAUDE.md).
	*/
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
			onLinkShortcut: () => (isLinkOpen = true)
		});
		editor = started;
		return () => started.destroy();
	});

	// Moves the cursor into the writing area, once `tick()` has let Svelte show it.
	// A prop alone cannot move the cursor, and a hidden area cannot take it.
	$effect(() => {
		if (!hasAutofocus || !editor) return;

		const started = editor;
		void tick().then(() => focusMarkdownEditor(started));
	});

	function handleMarkdownChange(next: string) {
		markdown = next;
		onChange?.(next);
	}

	function handleLinkClose() {
		isLinkOpen = false;
		if (editor) focusMarkdownEditor(editor);
	}

	/** Swap between the formatted text and its Markdown, reading back what was typed there. */
	function handleMarkdownToggle() {
		if (!editor) return;

		if (isMarkdownShown) editor.commands.setContent(markdown, { contentType: 'markdown' });

		isMarkdownShown = !isMarkdownShown;
		isLinkOpen = false;
	}
</script>

<!-- A form field for notes. The text of a paper has its own editor, `PaperEditor`. -->
<div class="rounded-control border border-border bg-background">
	{#if editor}
		<MarkdownToolbar
			{editor}
			controls={`${uid}-editor`}
			{formatting}
			{isMarkdownShown}
			{isCompact}
			{isLinkOpen}
			onLinkClick={() => (isLinkOpen = true)}
			onLinkClose={handleLinkClose}
			onMarkdownToggle={handleMarkdownToggle}
		/>
	{/if}

	<div class="relative" hidden={editor === null || isMarkdownShown}>
		<EditorPlaceholder text={placeholder} isShown={markdown === ''} />
		<div bind:this={writingArea}></div>
	</div>

	<MarkdownTextArea
		{name}
		value={markdown}
		{labelledBy}
		{placeholder}
		{hasAutofocus}
		isHidden={editor !== null && !isMarkdownShown}
		onInput={handleMarkdownChange}
	/>
</div>
