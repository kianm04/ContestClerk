<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import MarkdownContent from '$lib/components/markdown-editor/MarkdownContent.svelte';
	import MarkdownEditor from '$lib/components/markdown-editor/MarkdownEditor.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { LABEL_CLASSES } from '$lib/form-fields';
	import Example from './Example.svelte';
	import Group from './Group.svelte';

	type Props = {
		/** The Markdown the editor starts from: the sample, or what was last shown formatted. */
		sampleMarkdown: string;
		/** The same Markdown as HTML, made safe on the server by `renderMarkdown`. */
		sampleMarkdownHtml: string;
	};

	let { sampleMarkdown, sampleMarkdownHtml }: Props = $props();
</script>

<Group id="markdown" title="Markdown editor">
	<Notice tone="info" title="The same Markdown, written and then shown">
		Format with the toolbar, with Ctrl or Cmd and B, I, U or K, or by typing Markdown such as
		**bold**. Press "Show it formatted" to see what the server makes of it. Without JavaScript the
		editor is a plain Markdown box in the same form.
	</Notice>

	<!--
		`method="get"` puts the Markdown into the address as `?sampleMarkdown=`,
		which `load` in `+page.server.ts` reads back and formats. `#markdown` keeps
		this group in view after the page comes back.
	-->
	<form method="get" action="#markdown" class="grid min-w-0 gap-4">
		<Example
			name="MarkdownEditor"
			props="name='sampleMarkdown', initialMarkdown, labelledBy='sample-markdown-label'"
		>
			<p id="sample-markdown-label" class={LABEL_CLASSES}>Sample notes</p>
			<MarkdownEditor
				name="sampleMarkdown"
				initialMarkdown={sampleMarkdown}
				labelledBy="sample-markdown-label"
			/>
		</Example>

		<div class="flex justify-end">
			<Button label="Show it formatted" variant="secondary" />
		</div>
	</form>

	<Example name="MarkdownContent" props="html = renderMarkdown(sampleMarkdown) on the server">
		<MarkdownContent html={sampleMarkdownHtml} />
	</Example>
</Group>
