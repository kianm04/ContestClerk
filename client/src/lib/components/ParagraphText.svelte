<script lang="ts">
	import { splitIntoParagraphs } from '$lib/text';

	type Props = {
		/** Plain text as somebody typed it, with a blank line between paragraphs. */
		text: string;
	};

	let { text }: Props = $props();

	// `$derived` splits the text again whenever it changes.
	const paragraphs = $derived(splitIntoParagraphs(text));
</script>

<!--
	Every paragraph is put on the screen as text, never as HTML, so a
	description somebody typed can never run code on the page.
	`whitespace-pre-line` keeps the single line breaks inside one paragraph
	without needing a `<br>` for each of them.
-->
<div class="max-w-prose space-y-3 text-body">
	<!-- Paragraphs have no id of their own, so the place in the list is the key. -->
	{#each paragraphs as paragraph, index (index)}
		<p class="whitespace-pre-line">{paragraph}</p>
	{/each}
</div>
