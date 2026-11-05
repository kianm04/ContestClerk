<script lang="ts">
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import {
		canRemovePositionPaper,
		type PaperDeadline,
		type PositionPaperFile
	} from '$lib/documents';

	type Props = {
		/** The conference's position paper dates. */
		conference: PaperDeadline;
		/** The seat's paper as handed in, or `null` for none yet. */
		document: PositionPaperFile | null;
		/** The moment the page was drawn, shared with the rest of the page. */
		now: Date;
	};

	let { conference, document, now }: Props = $props();

	/*
		This only decides whether the button is drawn. The `remove` action asks
		`canRemovePositionPaper` again before it deletes anything, so a reader's
		wrong clock could at worst show the button, never get past the rule.
	*/
	const mayRemove = $derived(
		document !== null && canRemovePositionPaper(conference, document.reviewStatus, now)
	);
</script>

{#if mayRemove}
	<div class="mt-6">
		<ConfirmButton
			label="Remove position paper"
			confirmTitle="Remove your position paper?"
			confirmText="Your chair will no longer see a paper on file for this seat."
			formaction="?/remove"
			variant="danger"
			size="sm"
		/>
	</div>
{/if}
