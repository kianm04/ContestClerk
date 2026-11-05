<script lang="ts">
	import SortableDropForm from '$lib/components/SortableDropForm.svelte';
	import SortableItem from '$lib/components/SortableItem.svelte';
	import {
		COMMITTEE_DROP_FORM_ID,
		COMMITTEE_DROP_HINT_ID,
		type ManagedCommittee
	} from '$lib/committees';
	import { placedOrder, reorderHint, type PendingPlace } from '$lib/drag-order';
	import { movedOrder, type PendingMove } from '$lib/list-move-preview';
	import { createSortableList, type SortableDrop } from '$lib/sortable-list.svelte';
	import CommitteeHeadings from './CommitteeHeadings.svelte';
	import CommitteeRow from './CommitteeRow.svelte';

	type Props = {
		/** Every committee of the conference, in the order the server has them. */
		committees: ManagedCommittee[];
		/** The conference's slug, for the links out of each row. */
		conferenceSlug: string;
		/** Whether the reader may reorder the committees: a conference-wide editor. */
		isReorderable: boolean;
		/** The committees whose chair room the reader may open. */
		roomCommitteeIds: string[];
	};

	let { committees, conferenceSlug, isReorderable, roomCommitteeIds }: Props = $props();

	/*
		A move is answered in place, without reloading the page, so nothing would
		move on screen until the server's answer came back unless this guesses
		ahead of it. An arrow's press is held in `pendingMove` and a drop of a
		dragged row in `pendingPlace`, each from the moment it is sent until the
		server has answered. `shownCommittees` draws the list as if both had
		already landed (`$lib/list-move-preview.ts` and `$lib/drag-order.ts`),
		and once the server answers, whether it agreed or not, the guess is
		dropped and `committees` from the fresh `load` takes over again.
	*/
	let pendingMove = $state<PendingMove | null>(null);
	let pendingPlace = $state<PendingPlace | null>(null);
	const shownCommittees = $derived(placedOrder(movedOrder(committees, pendingMove), pendingPlace));

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

<SortableDropForm
	formId={COMMITTEE_DROP_FORM_ID}
	action="?/moveTo"
	idName="committeeId"
	{pendingPlace}
	{sortable}
	hintId={COMMITTEE_DROP_HINT_ID}
	hint={reorderHint('committee')}
	onSettle={handlePlaceSettle}
/>

<CommitteeHeadings />

<!-- `data-sortable-list` tells the dragging helper which rows belong to this list. -->
<ul data-sortable-list>
	<!-- The `(committee.id)` key lets Svelte reuse list items instead of
		rebuilding them, which matters here because a move reorders the list. -->
	{#each shownCommittees as committee, index (committee.id)}
		<SortableItem {sortable} id={committee.id} {index}>
			<CommitteeRow
				{committee}
				{conferenceSlug}
				{index}
				{isReorderable}
				mayOpenRoom={roomCommitteeIds.includes(committee.id)}
				isLast={index === shownCommittees.length - 1}
				{sortable}
				isSaving={pendingPlace !== null}
				onMoveSend={handleMoveSend}
				onMoveSettle={handleMoveSettle}
			/>
		</SortableItem>
	{/each}
</ul>

{#if isReorderable}
	<p class="mx-1 mt-3 text-small text-muted-foreground">
		Drag a row, or use its arrows, to change the order delegates see. A committee needs at least one
		seat before you can publish.
	</p>
{/if}
