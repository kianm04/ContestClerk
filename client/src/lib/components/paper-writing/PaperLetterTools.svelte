<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import {
		applyMarkdownCommand,
		type MarkdownCommand,
		type MarkdownFormatting
	} from '$lib/markdown-editor';
	import { TOOL_CLASSES } from '$lib/paper-toolbar';

	type Props = {
		editor: Editor;
		/** Which formatting the text at the cursor has, so its button shows as pressed. */
		formatting: MarkdownFormatting;
	};

	let { editor, formatting }: Props = $props();

	/** A button that shows its formatting as a letter: B in bold, I in italics, U underlined. */
	type LetterTool = { command: MarkdownCommand; label: string; letter: string; look: string };

	const LETTER_TOOLS: LetterTool[] = [
		{ command: 'bold', label: 'Bold', letter: 'B', look: 'text-body font-semibold' },
		{ command: 'italic', label: 'Italic', letter: 'I', look: 'text-body italic' },
		{
			command: 'underline',
			label: 'Underline',
			letter: 'U',
			look: 'text-body underline underline-offset-2'
		}
	];
</script>

<!-- The three text marks. The `(tool.command)` key lets Svelte reuse each button instead of rebuilding it. -->
{#each LETTER_TOOLS as tool (tool.command)}
	<button
		type="button"
		aria-label={tool.label}
		title={tool.label}
		aria-pressed={formatting[tool.command]}
		class="{TOOL_CLASSES} {tool.look}"
		onclick={() => applyMarkdownCommand(editor, tool.command)}
	>
		{tool.letter}
	</button>
{/each}
