<script lang="ts">
	import { tick } from 'svelte';
	import type { AllocationQuery, SeatColumn } from '$lib/allocation';
	import { createDropTargetDrag } from '$lib/drop-target-drag.svelte';
	import {
		SEAT_DROP_ACTIONS,
		SEAT_DROP_FORM_ID,
		seatDropKind,
		showPendingDrop,
		showPendingTray,
		type PendingSeatDrop,
		type SeatDragSource,
		type TrayDelegation
	} from '$lib/seat-drop';
	import { manageAllocationActionUrl } from '$lib/urls';
	import CommitteeSeatColumn from './CommitteeSeatColumn.svelte';
	import DelegationTray from './DelegationTray.svelte';
	import DragGhost from './DragGhost.svelte';
	import SeatDropForm from './SeatDropForm.svelte';
	import SwapSeatsModal from './SwapSeatsModal.svelte';

	type Props = {
		/** The committees and their seats, as `load` built them. */
		columns: SeatColumn[];
		/** The accepted delegations still waiting for seats, for the tray. */
		delegations: TrayDelegation[];
		slug: string;
		/** The filters on screen, which every drop keeps. */
		query: AllocationQuery;
		/**
		 * Whether the reader holds `decide_applications`. Without it the grid is
		 * only read: no handles, no menus, and no forms to send a drop.
		 */
		canDecide: boolean;
	};

	let { columns, delegations, slug, query, canDecide }: Props = $props();

	// A drop on its way to the server, drawn at once; null again once it has answered.
	let pendingDrop: PendingSeatDrop | null = $state(null);
	// A swap waiting for the organiser to confirm it in the dialog.
	let proposedSwap: PendingSeatDrop | null = $state(null);

	// `$derived` redraws these whenever `pendingDrop` or the data from `load` changes.
	const shownColumns = $derived(showPendingDrop(columns, pendingDrop));
	const shownDelegations = $derived(showPendingTray(delegations, pendingDrop));
	const dropAction = $derived.by(() => {
		const actionName = pendingDrop === null ? 'moveDelegate' : SEAT_DROP_ACTIONS[pendingDrop.kind];

		return manageAllocationActionUrl(slug, { ...query, seat: '', action: '' }, actionName);
	});

	/** Draw the drop at once and send the hidden form that saves it. */
	async function sendDrop(drop: PendingSeatDrop) {
		pendingDrop = drop;
		// `tick()` waits until Svelte has written the drop's action into the form.
		await tick();
		const form = document.getElementById(SEAT_DROP_FORM_ID);

		if (form instanceof HTMLFormElement) form.requestSubmit();
	}

	/** Work out what landing on this seat means: a move or an assignment is sent, a swap asked about. */
	function handleDrop(source: SeatDragSource, targetId: string) {
		const target = columns.flatMap((column) => column.seats).find((seat) => seat.id === targetId);

		if (!target) return;

		const kind = seatDropKind(source, target);

		if (kind === null) return;

		if (kind === 'swap') {
			proposedSwap = { kind, source, target };
			return;
		}

		sendDrop({ kind, source, target });
	}

	function handleSwapConfirm() {
		if (proposedSwap === null) return;

		const swap = proposedSwap;
		proposedSwap = null;
		sendDrop(swap);
	}

	function handleSwapCancel() {
		proposedSwap = null;
	}

	function handleDropSettle() {
		pendingDrop = null;
	}

	// Follows the drag handles and finds the seat under the pointer (`$lib/drop-target-drag.svelte.ts`).
	const drag = createDropTargetDrag<SeatDragSource>({ onDrop: handleDrop });
</script>

{#if canDecide}
	<SeatDropForm {pendingDrop} action={dropAction} onSettle={handleDropSettle} />
	<SwapSeatsModal {proposedSwap} onConfirm={handleSwapConfirm} onCancel={handleSwapCancel} />
{/if}
<DragGhost {drag} />

<!--
	The banner of delegations waiting for seats sits above the grid rather than
	beside it, so the grid has the full width for its committees.
-->
<div class="flex flex-col gap-4">
	{#if shownDelegations.length > 0}
		<DelegationTray
			delegations={shownDelegations}
			{slug}
			{drag}
			isSaving={pendingDrop !== null}
			canAssign={canDecide}
		/>
	{/if}

	<!--
		One container for both layouts. Below `md` it is a stack of `<details>`
		sections; from `md` up it is a row of fixed-width columns that scrolls
		sideways when there are more committees than fit, and `data-drag-scroll`
		scrolls it while a delegate is dragged near its edge.
		`CommitteeSeatColumn` draws whichever of the two the width calls for.
	-->
	<div
		class="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:gap-6 md:overflow-x-auto md:pb-2"
		data-drag-scroll
	>
		<!-- The `(column.committee.id)` key lets Svelte reuse columns instead of rebuilding them. -->
		{#each shownColumns as column (column.committee.id)}
			<CommitteeSeatColumn
				{column}
				{slug}
				{query}
				{drag}
				isSaving={pendingDrop !== null}
				canChange={canDecide}
			/>
		{/each}
	</div>
</div>
