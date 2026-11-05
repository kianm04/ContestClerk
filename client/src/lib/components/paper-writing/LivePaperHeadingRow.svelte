<script lang="ts">
	import type { LivePaper } from '$lib/paper-live.svelte';
	import { openSuggestionsText } from '$lib/paper-comments';
	import type { PaperMargin } from '$lib/paper-margin-state.svelte';
	import PaperModeMenu from './PaperModeMenu.svelte';
	import PaperWritersPresent from './PaperWritersPresent.svelte';

	type Props = {
		heading: string;
		/** The heading's id, which also names the editor for a screen reader. */
		headingId: string;
		/** The live paper, or `null` while the server draws the page. */
		paper: LivePaper | null;
		margin: PaperMargin;
	};

	let { heading, headingId, paper, margin }: Props = $props();
</script>

<!--
	The heading, with the circles of whoever else is writing beside it and how
	many suggestions are still to be decided. On a phone the mode moves here
	from the toolbar, which has no room for it, and the count moves to the bar
	at the foot of the screen.
-->
<div class="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
	<h2 id={headingId} class="text-h3 text-foreground">{heading}</h2>
	{#if paper}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<PaperWritersPresent writers={paper.writers} status={paper.channelStatus} />
			{#if margin.editor}
				<div class="sm:hidden">
					<PaperModeMenu editor={margin.editor} isSuggesting={margin.isSuggesting} />
				</div>
			{/if}
			{#if margin.suggestionCount > 0}
				<span class="text-small whitespace-nowrap text-muted-foreground max-sm:hidden">
					{openSuggestionsText(margin.suggestionCount)}
				</span>
			{/if}
		</div>
	{/if}
</div>
