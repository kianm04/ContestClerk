<script lang="ts">
	import AddComment from 'carbon-icons-svelte/lib/AddComment.svelte';
	import { Button } from '$lib/components/ui/button';
	import { openSuggestionsText } from '$lib/paper-comments';
	import type { PaperMargin } from '$lib/paper-margin-state.svelte';

	type Props = { margin: PaperMargin };

	let { margin }: Props = $props();
</script>

<!--
	A phone's toolbar has no room for "Comment", so it waits in a bar at the
	bottom of the screen, with how many suggestions are still to be decided.
	`sticky bottom-0` keeps it there while the paper scrolls under it.
-->
<div class="sticky bottom-0 -mx-4 mt-8 border-t border-border bg-background px-4 py-2 sm:hidden">
	{#if margin.suggestionCount > 0}
		<p class="mb-2 text-small text-muted-foreground">
			{openSuggestionsText(margin.suggestionCount)}
		</p>
	{/if}
	<Button variant="outline" size="lg" class="h-11 gap-2" onclick={() => margin.startComment()}>
		<AddComment size={16} aria-hidden="true" />
		Comment
	</Button>
</div>
