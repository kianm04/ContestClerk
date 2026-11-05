<script lang="ts">
	import Receipt from '@lucide/svelte/icons/receipt';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import SortableDropForm from '$lib/components/SortableDropForm.svelte';
	import SortableItem from '$lib/components/SortableItem.svelte';
	import { placedOrder, reorderHint, type PendingPlace } from '$lib/drag-order';
	import { feeStatus } from '$lib/fee-list';
	import { FEE_DROP_FORM_ID, FEE_DROP_HINT_ID, type ManagedFee } from '$lib/fees';
	import { movedOrder, type PendingMove } from '$lib/list-move-preview';
	import { createSortableList, type SortableDrop } from '$lib/sortable-list.svelte';
	import FeeHeadings from './FeeHeadings.svelte';
	import FeeRow from './FeeRow.svelte';

	type Props = {
		/** Every fee of this conference, in the order the organiser put them. */
		fees: ManagedFee[];
		/** A three-letter ISO 4217 code, such as `EUR`. */
		currency: string;
		/** The conference's timezone, which the rows read their windows in. */
		timezone: string;
		/** The moment the page was drawn, handed down by `load` so the server and the browser agree. */
		now: Date;
		conferenceSlug: string;
		/** May the reader reorder, change and delete the fees? */
		canEdit: boolean;
	};

	let { fees, currency, timezone, now, conferenceSlug, canEdit }: Props = $props();

	/*
		Which fee a press of an arrow is moving, and which way, while the server
		has not answered yet. `$state` here, rather than in a row, because the
		whole list has to redraw in the new order; `movedOrder` (`$lib/list-move-
		preview.ts`) works out what that order is. `FeeRow` reports a press
		through `onMoveSend` and reports the answer through `onMoveSettle`, which
		clears this back to `null` so the real order from the server takes over.
		`pendingPlace` is the same for a dragged fee that has been dropped
		(`$lib/drag-order.ts`).
	*/
	let pendingMove = $state<PendingMove | null>(null);
	let pendingPlace = $state<PendingPlace | null>(null);
	const shownFees = $derived(placedOrder(movedOrder(fees, pendingMove), pendingPlace));

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

<!-- No button on the empty state: the form that adds a fee is directly underneath. -->
{#if fees.length === 0}
	<EmptyState
		icon={Receipt}
		title="No fees yet."
		description={canEdit
			? 'Add a fee so accepted delegates receive an invoice, or choose manual collection.'
			: 'Delegates are not charged for this conference yet.'}
	/>
{:else}
	<!-- The form a dropped row sends; a reader who may not reorder has no handles to drop. -->
	{#if canEdit}
		<SortableDropForm
			formId={FEE_DROP_FORM_ID}
			action="?/moveFeeTo"
			idName="feeId"
			{pendingPlace}
			{sortable}
			hintId={FEE_DROP_HINT_ID}
			hint={reorderHint('fee')}
			onSettle={handlePlaceSettle}
		/>
	{/if}

	<FeeHeadings />

	<!-- `data-sortable-list` tells the dragging helper which rows belong to this list. -->
	<ul data-sortable-list>
		<!-- The `(fee.id)` key lets Svelte reuse list items instead of rebuilding
			them, which matters here because a move reorders the list. -->
		{#each shownFees as fee, index (fee.id)}
			<SortableItem {sortable} id={fee.id} {index}>
				<FeeRow
					{fee}
					{currency}
					{timezone}
					{conferenceSlug}
					status={feeStatus(fee, fees, now)}
					{index}
					isLast={index === shownFees.length - 1}
					{sortable}
					isSaving={pendingPlace !== null}
					onMoveSend={handleMoveSend}
					onMoveSettle={handleMoveSettle}
					{canEdit}
				/>
			</SortableItem>
		{/each}
	</ul>
{/if}
