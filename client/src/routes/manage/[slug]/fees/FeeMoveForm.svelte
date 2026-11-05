<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { pendingMoveFrom, type PendingMove } from '$lib/list-move-preview';

	type Props = {
		feeId: string;
		/** Named in the two buttons' labels, so a screen reader says which fee is moving. */
		feeName: string;
		/** True for the topmost row, which cannot move up, and the last, which cannot move down. */
		isFirst: boolean;
		isLast: boolean;
		/** Tells the list which fee is moving and which way, so it can show the new order at once. */
		onMoveSend: (move: PendingMove | null) => void;
		/** Tells the list the move has settled, whether it saved or was refused. */
		onMoveSettle: () => void;
	};

	let { feeId, feeName, isFirst, isLast, onMoveSend, onMoveSettle }: Props = $props();

	/*
		Sends the move in the background and redraws the page without reloading
		it (`$lib/in-place-form.svelte.ts`); without JavaScript it still posts and
		reloads the page as before. `onSend` reads which way the pressed button
		moves this fee from the address's own query string and tells the list, so
		it can show the new order at once rather than waiting for the server; the
		list's `FeeList.svelte` and `$lib/list-move-preview.ts` explain that in
		full. `onSettle` tells the list the move is done, whether it saved or was
		refused, so the temporary order stops overriding the real one.
	*/
	const inPlaceForm = createInPlaceForm({
		onSend: (_formData, action) => onMoveSend(pendingMoveFrom(feeId, action)),
		onSettle: () => onMoveSettle()
	});
</script>

<!--
	The arrows are a form of their own, so reordering works with JavaScript
	switched off. Which way the fee moves travels in the action's own query
	string rather than in a field, which is what lets one form carry both
	buttons; `+page.server.ts` explains that in full. `isLabelHidden` draws
	each one as its arrow alone and makes the words its `aria-label`, so the
	row still tells a screen-reader user which fee it is moving. The
	committee rows are built the same way, one arrow above the other.
-->
<form method="post" class="flex flex-col" use:enhance={inPlaceForm.submit}>
	<input type="hidden" name="feeId" value={feeId} />
	<Button
		label="Move {feeName} up"
		variant="ghost"
		size="dense-sm"
		icon={ArrowUp}
		isLabelHidden
		formaction="?/moveFee&direction=up"
		isDisabled={isFirst}
		isLoading={inPlaceForm.isSending('?/moveFee&direction=up')}
	/>
	<Button
		label="Move {feeName} down"
		variant="ghost"
		size="dense-sm"
		icon={ArrowDown}
		isLabelHidden
		formaction="?/moveFee&direction=down"
		isDisabled={isLast}
		isLoading={inPlaceForm.isSending('?/moveFee&direction=down')}
	/>
</form>
