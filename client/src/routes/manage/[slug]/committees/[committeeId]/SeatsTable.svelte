<script lang="ts">
	import SortableDropForm from '$lib/components/SortableDropForm.svelte';
	import SortableItem from '$lib/components/SortableItem.svelte';
	import { SEAT_DROP_FORM_ID, SEAT_DROP_HINT_ID, type ManagedSeat } from '$lib/committees';
	import { placedOrder, reorderHint, type PendingPlace } from '$lib/drag-order';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import { movedOrder, type PendingMove } from '$lib/list-move-preview';
	import { rowsAfterPresses, type RowChange } from '$lib/row-changes';
	import { describeSeatFailure, expectSeatRowChange } from '$lib/seat-presses';
	import { createSortableList, type SortableDrop } from '$lib/sortable-list.svelte';
	import SeatHeadings from './SeatHeadings.svelte';
	import SeatRow from './SeatRow.svelte';

	type Props = {
		/** The committee's seats, in the organiser's own order. */
		seats: ManagedSeat[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { seats }: Props = $props();

	/*
		A move button's press is answered in place, without reloading the page, so
		nothing would move on screen until the server's answer came back unless
		this guesses ahead of it. `pendingMove` holds that guess the moment a row
		sends its press; `shownSeats` draws the list as if it had already landed.
		`$lib/list-move-preview.ts` works out what that looks like without
		touching `seats` itself, and `handleMoveSettle` drops the guess once the
		server has actually answered, whether it agreed or not. `pendingPlace` is
		the same for a dragged seat that has been dropped (`$lib/drag-order.ts`).
	*/
	let pendingMove = $state<PendingMove | null>(null);
	let pendingPlace = $state<PendingPlace | null>(null);

	/*
		Hiding, showing or deleting a seat is fully worked out in the browser
		(`$lib/seat-presses.ts`), so the row changes at once instead of waiting
		for the server (T142). One form for the whole table, because deleting a
		seat changes what every other row's index is.
	*/
	const seatChangesForm = createInstantForm<RowChange<ManagedSeat>[]>({
		describeFailure: describeSeatFailure
	});
	const submitSeatChangePress = seatChangesForm.submitExpecting(expectSeatRowChange);

	const shownSeats = $derived(
		placedOrder(
			movedOrder(rowsAfterPresses(seats, seatChangesForm.presses), pendingMove),
			pendingPlace
		)
	);

	function handleMoveSend(move: PendingMove | null) {
		pendingMove = move;
	}

	function handleMoveSettle() {
		pendingMove = null;
	}

	/** Draw the new order and send the form the handle belongs to, which saves it. */
	function handleDrop(drop: SortableDrop) {
		pendingPlace = { id: drop.id, toIndex: drop.toIndex };
		drop.handle.form?.requestSubmit();
	}

	function handlePlaceSettle() {
		pendingPlace = null;
	}

	// Follows the drag handles and works out where every row is drawn (`$lib/sortable-list.svelte.ts`).
	const sortable = createSortableList({ onDrop: handleDrop });
</script>

<!--
	Three deliberate departures from `05-pages/organiser/committee-edit.md`,
	which draws this as a `DataTable` that becomes stacked cards with the
	actions in a `Dropdown` on a phone.

	It is a list whose rows line up as a table from `sm` up, because every row
	carries five form buttons: cards would mean writing every row twice, and
	`Dropdown` renders its items inside a form of its own, which cannot sit
	inside the row's own form. With no seats it is one quiet line rather than
	the large `EmptyState`, because the buttons that add seats sit right above
	it. And the list has a height of its own with a scrollbar, because "Add UN
	member states" makes 193 rows, which is over nine thousand pixels of page,
	while this page's browser test holds the whole thing to a few screens.
-->
<SortableDropForm
	formId={SEAT_DROP_FORM_ID}
	action="?/moveSeatTo"
	idName="seatId"
	{pendingPlace}
	{sortable}
	hintId={SEAT_DROP_HINT_ID}
	hint={reorderHint('seat')}
	onSettle={handlePlaceSettle}
/>

{#if shownSeats.length === 0}
	<div class="rounded-control border border-dashed border-border px-4 py-5">
		<h3 class="text-dense font-medium text-foreground">No seats yet.</h3>
		<p class="text-small text-muted-foreground">
			Add the countries or characters delegates will represent.
		</p>
	</div>
{:else}
	<div>
		<SeatHeadings />

		<!-- `data-sortable-list` tells the dragging helper which rows belong to this list. -->
		<ul class="max-h-96 divide-y divide-border overflow-y-auto" data-sortable-list>
			<!-- The `(seat.id)` key lets Svelte reuse rows instead of rebuilding them. -->
			{#each shownSeats as seat, index (seat.id)}
				<SortableItem {sortable} id={seat.id} {index}>
					<SeatRow
						{seat}
						{index}
						isLast={index === shownSeats.length - 1}
						{sortable}
						isSaving={pendingPlace !== null}
						onMoveSend={handleMoveSend}
						onMoveSettle={handleMoveSettle}
						onSubmit={submitSeatChangePress}
					/>
				</SortableItem>
			{/each}
		</ul>
	</div>
{/if}
