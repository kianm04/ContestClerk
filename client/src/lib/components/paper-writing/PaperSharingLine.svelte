<script lang="ts">
	import { lastEditedText } from '$lib/delegation-papers';
	import type { DraftEditor } from '$lib/paper-draft-autosave.svelte';

	type Props = {
		/** "Shared with St Aidan's Academy: Rachel Morgan, …", from `sharedWithText`. */
		sharedWith: string;
		/** Who saved the draft stored now, or `null` when there is none yet. */
		editor: DraftEditor | null;
		/** When it was saved, in milliseconds since 1970, or `null` when never. */
		savedAt: number | null;
		/** The signed-in writer, so their own edit reads "by you". */
		readerId: string;
	};

	let { sharedWith, editor, savedAt, readerId }: Props = $props();

	// The clock the "5 min ago" is counted from. `$state` redraws the line when it moves on.
	let now = $state(Date.now());

	/*
		Moves `now` on once a second, the way `DraftStatusLine` does. `$effect`
		runs in the browser once the component is on screen, and the function
		it returns stops the clock when the component goes away.
	*/
	$effect(() => {
		const clock = setInterval(() => (now = Date.now()), 1000);

		return () => clearInterval(clock);
	});

	const lastEdited = $derived(lastEditedText(editor, savedAt, readerId, now));
</script>

<!-- Who else may open and edit this draft (T147), and who edited it last. -->
<div class="flex flex-col gap-1 text-small text-muted-foreground">
	<p>{sharedWith}</p>
	{#if lastEdited}
		<p>{lastEdited}</p>
	{/if}
</div>
