<script lang="ts">
	import type { Editor } from '@tiptap/core';
	import TextIndentLess from 'carbon-icons-svelte/lib/TextIndentLess.svelte';
	import TextIndentMore from 'carbon-icons-svelte/lib/TextIndentMore.svelte';
	import { SEPARATOR_CLASSES, TOOL_CLASSES, WORD_TOOL_CLASSES } from '$lib/paper-toolbar';
	import { indentClause, markOpeningPhrase, outdentClause } from '$lib/resolution-editor';

	type Props = {
		editor: Editor;
		/** True while suggesting: a suggestion is made of words, so a clause cannot be moved in one. */
		isSuggesting: boolean;
	};

	let { editor, isSuggesting }: Props = $props();
</script>

<!--
	A draft resolution's own tools, after the text marks: moving a clause out
	and in, which makes it a sub-clause of the one above, and "Opening phrase",
	which styles the selected words as a phrase that is on no list.
-->
<span aria-hidden="true" class={SEPARATOR_CLASSES}></span>
<button
	type="button"
	aria-label="Move the clause out"
	title="Move the clause out"
	disabled={isSuggesting}
	class={TOOL_CLASSES}
	onclick={() => outdentClause(editor)}
>
	<TextIndentLess size={16} aria-hidden="true" />
</button>
<button
	type="button"
	aria-label="Move the clause in"
	title="Move the clause in"
	disabled={isSuggesting}
	class={TOOL_CLASSES}
	onclick={() => indentClause(editor)}
>
	<TextIndentMore size={16} aria-hidden="true" />
</button>
<span aria-hidden="true" class={SEPARATOR_CLASSES}></span>
<button
	type="button"
	disabled={isSuggesting}
	class={WORD_TOOL_CLASSES}
	onclick={() => markOpeningPhrase(editor)}
>
	Opening phrase
</button>
