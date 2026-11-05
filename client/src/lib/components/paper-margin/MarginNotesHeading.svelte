<script lang="ts">
	import AddComment from 'carbon-icons-svelte/lib/AddComment.svelte';
	import PaperSideHeading from '$lib/components/paper-side/PaperSideHeading.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { MarginNotes } from '$lib/paper-margin';
	import type { PaperMargin } from '$lib/paper-margin-state.svelte';

	type Props = {
		notes: MarginNotes;
		margin: PaperMargin;
		isScriptRunning: boolean;
	};

	let { notes, margin, isScriptRunning }: Props = $props();

	// A text read without a toolbar has nowhere else for "Comment", so it waits under the title.
	const canStart = $derived(isScriptRunning && notes.isOpen && margin.editor !== null);
</script>

<!--
	The title of the dais's notes, with how many are open, kept on show beside
	the text as the other blocks beside a paper are. "Comment" starts a note on
	the words selected in the text, or on the whole paper when none are. On a
	phone it waits in the bar at the bottom of the screen instead.
-->
<div class="mb-4">
	<PaperSideHeading title={notes.title} count={String(notes.count)} />
	{#if canStart}
		<!-- Kept in its place while a note is written, so the cards below do not jump. -->
		<Button
			variant="outline"
			class="mt-3 h-8 gap-2 border-input px-3 text-small font-medium max-sm:hidden {margin.isWritingNew
				? 'invisible'
				: ''}"
			onclick={() => margin.startComment()}
		>
			<AddComment size={16} aria-hidden="true" />
			Comment
		</Button>
	{/if}
</div>
