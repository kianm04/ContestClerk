<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Dropdown, { type DropdownItem } from '$lib/components/Dropdown.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import type { GridSeat, SeatState } from '$lib/allocation';
	import type { DropTargetDrag } from '$lib/drop-target-drag.svelte';
	import { seatDropKind, type SeatDragSource } from '$lib/seat-drop';
	import SeatDragHandle from './SeatDragHandle.svelte';

	type Props = {
		/** The seat itself, with whoever is holding it. */
		seat: GridSeat;
		/** Which of the four states it is in, worked out once by the column. */
		state: SeatState;
		/** True for the seat `?seat=` names, which is the one the panel above is about. */
		isHighlighted: boolean;
		/** The lines of the "⋯" menu, built by the column. */
		menuItems: DropdownItem[];
		/** The grid's dragging helper, from `AllocationBoard`. */
		drag: DropTargetDrag<SeatDragSource>;
		/** While a drop is being saved, so the delegate here cannot be picked up. */
		isSaving: boolean;
		/** False for a reader who may not decide applications, whose seat has no handle or menu. */
		canChange: boolean;
	};

	let { seat, state, isHighlighted, menuItems, drag, isSaving, canChange }: Props = $props();

	/* Only a hidden seat is tinted: it is out of play, and the grey says so
	   before the word "Hidden" is read. The other three are told apart by what
	   is written in them. */
	const tintClass = $derived(state === 'hidden' ? 'bg-muted' : '');

	/* A ring rather than a tint, so that the highlight reads on a hidden seat's
	   grey as well. `ring-inset` draws it inside the row, clear of its neighbours. */
	const ringClass = $derived(isHighlighted ? 'ring-2 ring-ring ring-inset' : '');

	/* While something is dragged, what dropping it here would do, or null
	   (`$lib/seat-drop.ts`). A seat with an answer is outlined as a target,
	   and the one under the pointer more strongly. */
	const dropKind = $derived(
		drag.dragged !== null && drag.hasMoved ? seatDropKind(drag.dragged, seat) : null
	);
	const isHovered = $derived(dropKind !== null && drag.hoveredTargetId === seat.id);
	const isDragged = $derived(drag.dragged?.kind === 'seat' && drag.dragged.seat.id === seat.id);
	const dropClass = $derived.by(() => {
		if (isHovered) return 'outline-2 -outline-offset-2 outline-ring shadow-card';
		if (dropKind !== null) return 'outline-2 -outline-offset-2 outline-dashed outline-ring';

		// The seat somebody is being dragged out of is left as a dashed gap (T137).
		return isDragged ? 'outline-1 -outline-offset-1 outline-dashed outline-ring opacity-50' : '';
	});

	// A filled seat always has a name. The fallback is there for the type and
	// not for anything on screen.
	const holderName = $derived(seat.holderName ?? 'Delegate');

	// The second line under the delegate's name: the delegation they came with,
	// or, for somebody who applied on their own, the school on their profile.
	// Either can be missing, and then the seat has one line.
	const holderSubline = $derived(
		seat.userId !== null ? (seat.delegationName ?? seat.holderInstitution) : null
	);
</script>

<!--
	The seat's own row. Every line of the menu is a link that opens a panel from
	the address rather than a button, which is what
	`05-pages/organiser/allocation.md` asks for: `Dropdown` wraps its own items
	in a `<form method="post">` and `ConfirmButton` renders another form of its
	own, and HTML forbids a form inside a form. So the one panel above the grid
	carries the real form — the same shape the spec already chose for the move
	modal, so that the page works with JavaScript switched off.
-->
<!-- `data-drop-target` is how the dragging helper finds this seat under the
	pointer, and `data-drop-kind` says what a drop here would do. -->
<!-- Inside a phone's folding section the box's own border closes the list,
	so the last seat drops its line there (`last:border-b-0`) and keeps it in a
	desktop column (`md:last:border-b`). -->
<li
	class="flex min-h-13 items-center gap-2.5 border-b border-border px-1 py-1 text-dense last:border-b-0 md:last:border-b {tintClass} {ringClass} {dropClass}"
	data-drop-target={seat.id}
	data-drop-kind={dropKind}
>
	<!-- Anybody sitting here can be dragged, as anybody can be moved from the
		menu. An empty seat has nothing to drag, so from `md` up, where the
		handles show, it keeps a blank of the same size and its name lines up. -->
	{#if canChange && seat.userId !== null}
		<SeatDragHandle
			{drag}
			source={{ kind: 'seat', seat }}
			title="Drag {holderName} to another seat"
			isDisabled={isSaving}
		/>
	{:else}
		<span class="hidden size-7 shrink-0 md:block" aria-hidden="true"></span>
	{/if}

	<!--
		The seat's own name sits in a box of fixed width, so the names down a
		column line up. It is cut short with "…" only when it does not fit:
		`min-w-0` is what lets a flex item shrink below its text's width at all,
		and `title` shows the whole name on hover.
	-->
	<span class="flex w-28 shrink-0 items-center gap-2 md:w-33">
		{#if seat.countryCode}
			<Flag countryCode={seat.countryCode} />
		{/if}
		<span class="min-w-0 truncate text-foreground" title={seat.name}>{seat.name}</span>
	</span>

	<!-- Whoever holds the seat, on lines cut short rather than wrapped, so
		that every seat in the column is the same height. -->
	<div class="min-w-0 flex-1">
		{#if state === 'filled'}
			<p class="truncate font-medium text-foreground" title={holderName}>{holderName}</p>
			{#if holderSubline}
				<p class="truncate text-small text-muted-foreground" title={holderSubline}>
					{holderSubline}
				</p>
			{/if}
		{:else if state === 'reserved'}
			<p class="truncate text-muted-foreground" title={seat.delegationName}>
				Held for {seat.delegationName}
			</p>
		{:else if state === 'free'}
			<p class="text-muted-foreground">Free</p>
		{:else}
			<p class="text-muted-foreground">Hidden</p>
		{/if}
	</div>

	<!-- The words are read by a screen reader only, because the button is the
		bare "⋯" icon the design draws (`isQuiet`). -->
	{#if canChange}
		<Dropdown label="Seat actions" icon={Ellipsis} items={menuItems} isQuiet />
	{/if}
</li>
