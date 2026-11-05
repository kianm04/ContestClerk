<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { pendingMoveFrom, type PendingMove } from '$lib/list-move-preview';

	type Props = {
		questionId: string;
		/** Named in the two buttons' labels, so a screen reader says which question is moving. */
		questionLabel: string;
		/** True for the topmost row, which cannot move up, and the last, which cannot move down. */
		isFirst: boolean;
		isLast: boolean;
		/** Tells the list which row is moving which way, the moment the press is sent. */
		onMoveSend: (move: PendingMove | null) => void;
		/** Tells the list the server has answered, so it can drop the guess. */
		onMoveSettle: () => void;
	};

	let { questionId, questionLabel, isFirst, isLast, onMoveSend, onMoveSettle }: Props = $props();

	/*
		Sends the move in the background and redraws the list without reloading
		the page (`$lib/in-place-form.svelte.ts`). `onSend` reads which way the
		pressed button moves the question from the address's own query string
		(`?/moveQuestion&direction=up` or `…=down`), because that is the only
		place the direction travels — the two buttons share one form and neither
		has a field of its own for it.
	*/
	const inPlaceForm = createInPlaceForm({
		onSend: (_formData, action) => onMoveSend(pendingMoveFrom(questionId, action)),
		onSettle: () => onMoveSettle()
	});
</script>

<!--
	The arrows are a form of their own, so reordering works with JavaScript
	switched off. Which way the question moves travels in the action's own
	query string rather than in a field, which is what lets one form carry
	both buttons; `+page.server.ts` explains that in full. `isLabelHidden`
	draws each one as its arrow alone and makes the words its `aria-label`,
	so the row still tells a screen-reader user which question it is moving.
	The fee rows are built the same way.
-->
<form method="post" class="flex gap-1" use:enhance={inPlaceForm.submit}>
	<input type="hidden" name="questionId" value={questionId} />
	<Button
		label="Move {questionLabel} up"
		variant="ghost"
		size="dense-sm"
		icon={ArrowUp}
		isLabelHidden
		formaction="?/moveQuestion&direction=up"
		isDisabled={isFirst}
		isLoading={inPlaceForm.isSending('?/moveQuestion&direction=up')}
	/>
	<Button
		label="Move {questionLabel} down"
		variant="ghost"
		size="dense-sm"
		icon={ArrowDown}
		isLabelHidden
		formaction="?/moveQuestion&direction=down"
		isDisabled={isLast}
		isLoading={inPlaceForm.isSending('?/moveQuestion&direction=down')}
	/>
</form>
