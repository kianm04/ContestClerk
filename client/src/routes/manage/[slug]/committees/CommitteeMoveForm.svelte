<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { pendingMoveFrom, type PendingMove } from '$lib/list-move-preview';

	type Props = {
		committeeId: string;
		/** The committee's short name, which the two buttons' labels say. */
		shortName: string;
		/** True for the topmost row, which cannot move up, and the last, which cannot move down. */
		isFirst: boolean;
		isLast: boolean;
		/** Tells the list which row is moving which way, the moment the press is sent. */
		onMoveSend: (move: PendingMove | null) => void;
		/** Tells the list the server has answered, so it can drop the guess. */
		onMoveSettle: () => void;
	};

	let { committeeId, shortName, isFirst, isLast, onMoveSend, onMoveSettle }: Props = $props();

	// Moves in the background without reloading the page (`$lib/in-place-form.svelte.ts`),
	// telling the list which way this row is moving so it can redraw the order at once.
	const inPlaceForm = createInPlaceForm({
		onSend: (_formData, action) => onMoveSend(pendingMoveFrom(committeeId, action)),
		onSettle: () => onMoveSettle()
	});
</script>

<!--
	The arrows are a form of their own, so reordering works with JavaScript
	switched off. Which way the committee moves travels in the action's own
	query string rather than in a field, which is what lets one form carry
	both buttons; `+page.server.ts` explains that in full.

	`isLabelHidden` draws each one as its arrow alone and makes the words its
	`aria-label`, so the row still tells a screen-reader user which committee
	it is moving — "Move up" eight times over would tell them nothing — while
	a reader who can see the row already knows. Written out, the two labels
	were a column of text wider than the committee's own name. The seat rows
	in the editor are built the same way.
-->
<form method="post" class="flex flex-col" use:enhance={inPlaceForm.submit}>
	<input type="hidden" name="committeeId" value={committeeId} />
	<Button
		label="Move {shortName} up"
		variant="ghost"
		size="dense-sm"
		icon={ArrowUp}
		isLabelHidden
		formaction="?/move&direction=up"
		isDisabled={isFirst}
		isLoading={inPlaceForm.isSending('?/move&direction=up')}
	/>
	<Button
		label="Move {shortName} down"
		variant="ghost"
		size="dense-sm"
		icon={ArrowDown}
		isLabelHidden
		formaction="?/move&direction=down"
		isDisabled={isLast}
		isLoading={inPlaceForm.isSending('?/move&direction=down')}
	/>
</form>
