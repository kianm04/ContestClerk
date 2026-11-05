<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import DragHandle from '$lib/components/DragHandle.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import { SEAT_COLUMNS_CLASS, isSeatFree, seatHolder, seatKindLabel } from '$lib/committee-editor';
	import { SEAT_DROP_FORM_ID, SEAT_DROP_HINT_ID, type ManagedSeat } from '$lib/committees';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { pendingMoveFrom, type PendingMove } from '$lib/list-move-preview';
	import { pressedAction } from '$lib/row-changes';
	import type { SortableList } from '$lib/sortable-list.svelte';
	import SeatChangeButtons from './SeatChangeButtons.svelte';

	type Props = {
		/** The seat this row is about. */
		seat: ManagedSeat;
		/** Where the seat stands in the list, counting from 0. The top row cannot move up. */
		index: number;
		/** True for the bottom row, whose "move down" button has nowhere to go. */
		isLast: boolean;
		/** The list's dragging helper, which the row's drag handle reports to. */
		sortable: SortableList;
		/** While a drop is being saved, so no row can be picked up yet. */
		isSaving: boolean;
		/** Tells the list which row is moving which way, the moment the press is sent. */
		onMoveSend: (move: PendingMove | null) => void;
		/** Tells the list the server has answered, so it can drop the guess. */
		onMoveSettle: () => void;
		/** Sends "Hide", "Show" and "Delete" through the table's instant form (`SeatsTable`). */
		onSubmit: SubmitFunction;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { seat, index, isLast, sortable, isSaving, onMoveSend, onMoveSettle, onSubmit }: Props =
		$props();

	/*
		Sends a move button's press in the background and redraws the row without
		reloading the page (`$lib/in-place-form.svelte.ts`). `onSend` reads which
		way a move button moves the seat from the address's own query string
		(`?/moveSeat&direction=up` or `…=down`), because that is the only place the
		direction travels — the four buttons share one form and none of them has a
		field of its own for it.
	*/
	const inPlaceForm = createInPlaceForm({
		onSend: (_formData, action) => onMoveSend(pendingMoveFrom(seat.id, action)),
		onSettle: () => onMoveSettle()
	});

	/** Routes a move press through `inPlaceForm`, and "Hide", "Show" and "Delete" through `onSubmit`. */
	const submitForm: SubmitFunction = (input) => {
		if (pressedAction(input.action) === '?/moveSeat') return inPlaceForm.submit(input);

		return onSubmit(input);
	};

	/* `$derived` works these out again whenever the seat changes, which is after
	   every action on this page. A free or hidden seat's "Held by" is quiet. */
	const holder = $derived(seatHolder(seat));
	const isHolderQuiet = $derived(isSeatFree(seat));
</script>

<!--
	One form for the whole row, so every button in it sends this seat's id. It
	is a grid of two columns on a phone, the handle and arrows beside the rest,
	and of the table's five columns from `sm` up, shared with the headings
	above the list (`SEAT_COLUMNS_CLASS` in `$lib/committee-editor.ts`).

	The arrows and the cross are icons, with `isLabelHidden` keeping their
	words for a screen reader alone. Each one still names its own seat, because
	"Delete" read out 193 times tells a screen-reader user nothing about which
	seat it means.
-->
<form
	method="post"
	class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 py-2 text-dense text-foreground sm:gap-x-0 sm:py-1 {SEAT_COLUMNS_CLASS}"
	use:enhance={submitForm}
>
	<input type="hidden" name="seatId" value={seat.id} />

	<!-- The handle a seat is dragged into order by. Its `form` attribute makes
		it part of the list's hidden drop form rather than of this one. On a
		phone it runs down beside the row's three lines. -->
	<div class="row-span-3 flex items-center sm:row-span-1">
		<DragHandle
			{sortable}
			row={{ id: seat.id, index, name: seat.name }}
			hintId={SEAT_DROP_HINT_ID}
			form={SEAT_DROP_FORM_ID}
			isDisabled={isSaving}
		/>
		<div class="flex flex-col">
			<Button
				label="Move {seat.name} up"
				variant="ghost"
				size="dense-sm"
				icon={ArrowUp}
				isLabelHidden
				formaction="?/moveSeat&direction=up"
				isDisabled={index === 0}
				isLoading={inPlaceForm.isSending('?/moveSeat&direction=up')}
			/>
			<Button
				label="Move {seat.name} down"
				variant="ghost"
				size="dense-sm"
				icon={ArrowDown}
				isLabelHidden
				formaction="?/moveSeat&direction=down"
				isDisabled={isLast}
				isLoading={inPlaceForm.isSending('?/moveSeat&direction=down')}
			/>
		</div>
	</div>

	<p class="flex min-w-0 items-center gap-2 font-medium sm:px-3">
		{#if seat.countryCode}
			<Flag countryCode={seat.countryCode} />
		{/if}
		<span class="min-w-0 break-words">{seat.name}</span>
	</p>

	<!-- One quiet line under the name on a phone. `sm:contents` takes the box
		itself away from `sm` up, so the two become columns of the table. -->
	<p class="flex flex-wrap gap-x-3 text-small text-muted-foreground sm:contents sm:text-dense">
		<span class="sm:px-3 sm:text-foreground">{seatKindLabel(seat.kind)}</span>
		<span class="min-w-0 sm:px-3 {isHolderQuiet ? '' : 'sm:text-foreground'}">{holder}</span>
	</p>

	<!-- Hide or show, and delete: inside this form, so they send the seat's id too. -->
	<div class="flex items-center gap-1 sm:justify-end">
		<SeatChangeButtons {seat} />
	</div>
</form>
