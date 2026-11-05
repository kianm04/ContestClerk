<script lang="ts">
	import type { PaperForScreen } from '$lib/papers-on-floor';
	import DisplayClause from './DisplayClause.svelte';
	import DisplayPaperText from './DisplayPaperText.svelte';
	import DisplayPreamble from './DisplayPreamble.svelte';

	type Props = {
		/** The paper the dais put on screen, and the part of it on screen, drawn on the server. */
		paper: PaperForScreen;
	};

	let { paper }: Props = $props();
</script>

<!--
	The paper the dais put on screen, in place of the floor, as drawn: a grey
	line naming it and where the projector stands in it ("Draft resolution
	1.1 · Operative clause 1 of 6"), its title large in the serif, then the
	part the dais has stepped to. A draft resolution or a directive is shown
	one clause at a time, its preambulatory clauses together first; any other
	paper is shown whole. Whatever is shown scrolls inside its own area, as the
	projector's page itself never scrolls.

	`[font-variation-settings:normal]` lets the browser set the title in the
	serif's cut for large sizes, finer and narrower, as drawn, in place of the
	small-size cut the site holds its headings in (layout.css), which reads
	heavy across a room at this size.
-->
<p class="mt-[2.6vw] text-[2vw]/[1.2] font-medium text-muted-foreground">
	{paper.name}{paper.position ? ` · ${paper.position}` : ''}
</p>
<h1
	class="mt-[0.6vw] max-w-[80vw] font-display text-[3.4vw]/[1.15] font-semibold text-balance [font-variation-settings:normal]"
>
	{paper.title}
</h1>

<div class="mt-[2.4vw] min-h-0 flex-1 overflow-y-auto text-[1.7vw]/[1.42] break-words">
	{#if paper.page.shows === 'clause'}
		<DisplayClause clause={paper.page} />
	{:else if paper.page.shows === 'preamble'}
		<DisplayPreamble preamble={paper.page} />
	{:else if paper.page.shows === 'text'}
		<DisplayPaperText html={paper.page.html} />
	{/if}
</div>
