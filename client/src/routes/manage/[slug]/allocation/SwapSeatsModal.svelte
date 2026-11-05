<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { swapSentence, type PendingSeatDrop } from '$lib/seat-drop';

	type Props = {
		/** The swap waiting for an answer, or null when the dialog is shut. */
		proposedSwap: PendingSeatDrop | null;
		/** Called when the organiser presses "Swap seats". */
		onConfirm: () => void;
		/** Called when they close the dialog without swapping. */
		onCancel: () => void;
	};

	let { proposedSwap, onConfirm, onCancel }: Props = $props();

	/* `$derived` recalculates whenever a new swap is proposed. A swap always
	   starts from a seat, so the other case is only there for the type. */
	const sentence = $derived.by(() => {
		if (proposedSwap === null || proposedSwap.source.kind !== 'seat') return '';

		return swapSentence(proposedSwap.source.seat, proposedSwap.target);
	});
</script>

<!--
	Dropping one delegate on another moves two people at once, which is harder
	to notice and to undo than a move, so the page asks first (T131). Only
	dragging opens it, and dragging needs JavaScript, so this dialog has no
	form of its own: "Swap seats" hands the drop back to `AllocationBoard`,
	which sends it through `SeatDropForm`.
-->
<Modal isOpen={proposedSwap !== null} title="Swap these two delegates?" onClose={onCancel}>
	<p class="text-body text-foreground">{sentence}</p>

	<div class="mt-6 flex flex-wrap justify-end gap-3">
		<Button type="button" variant="secondary" size="dense" label="Cancel" onclick={onCancel} />
		<Button type="button" variant="primary" size="dense" label="Swap seats" onclick={onConfirm} />
	</div>
</Modal>
