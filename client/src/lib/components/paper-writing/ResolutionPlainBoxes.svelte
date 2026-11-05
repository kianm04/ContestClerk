<script lang="ts">
	import MarkdownTextArea from '$lib/components/markdown-editor/MarkdownTextArea.svelte';
	import { joinResolutionMarkdown, splitResolutionMarkdown } from '$lib/resolution-text';

	type Props = {
		/** The paper's one text, cut into its two parts for the boxes. */
		markdown: string;
		/** Called with the two parts joined again after every change. */
		onInput: (markdown: string) => void;
	};

	let { markdown, onInput }: Props = $props();

	// `$props.id()` gives the labels ids of their own, the same on the server and in the browser.
	const uid = $props.id();

	// The parts as the page drew them; after that each box keeps what is typed into it.
	// svelte-ignore state_referenced_locally
	const start = splitResolutionMarkdown(markdown);
	let parts = $state({ ...start });

	function handlePartInput(part: 'preamble' | 'operative', value: string) {
		parts[part] = value;
		onInput(joinResolutionMarkdown(parts.preamble, parts.operative));
	}
</script>

<!--
	A draft resolution without JavaScript: the preamble and the operative
	clauses in two boxes, sent as `preamble` and `operative` and joined into
	one text on the server (`readCommitteePaperForm`). With the script running
	the editor shows both parts as one text, and these boxes are hidden.
-->
<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-2">
		<p id="{uid}-preamble" class="text-label text-foreground">Preamble</p>
		<div class="rounded-control border border-input">
			<MarkdownTextArea
				name="preamble"
				value={start.preamble}
				labelledBy="{uid}-preamble"
				placeholder="Preambulatory clauses, each ending with a comma"
				onInput={(value) => handlePartInput('preamble', value)}
			/>
		</div>
	</div>
	<div class="flex flex-col gap-2">
		<p id="{uid}-operative" class="text-label text-foreground">Operative clauses</p>
		<div class="rounded-control border border-input">
			<MarkdownTextArea
				name="operative"
				value={start.operative}
				labelledBy="{uid}-operative"
				placeholder="1. Operative clauses, numbered, each ending with a semicolon"
				onInput={(value) => handlePartInput('operative', value)}
			/>
		</div>
	</div>
</div>
