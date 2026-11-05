<script lang="ts">
	import type { DropdownItem } from '$lib/components/Dropdown.svelte';
	import {
		seatColumnCounts,
		seatColumnHeading,
		seatState,
		type AllocationQuery,
		type GridSeat,
		type SeatAction,
		type SeatColumn
	} from '$lib/allocation';
	import type { DropTargetDrag } from '$lib/drop-target-drag.svelte';
	import type { SeatDragSource } from '$lib/seat-drop';
	import { manageAllocationUrl } from '$lib/urls';
	import SeatCell from './SeatCell.svelte';

	type Props = {
		/** One committee with the seats of it that matched the filters. */
		column: SeatColumn;
		/** The conference's slug, for the addresses the seat menus link to. */
		slug: string;
		/** The filters on screen, so a menu link keeps them and comes back here. */
		query: AllocationQuery;
		/** The grid's dragging helper, which each seat reads to know whether it is a target. */
		drag: DropTargetDrag<SeatDragSource>;
		/** While a drop is being saved, so no new drag can start. */
		isSaving: boolean;
		/** False for a reader who may not decide applications: no handles and no menus. */
		canChange: boolean;
	};

	let { column, slug, query, drag, isSaving, canChange }: Props = $props();

	// `$derived` writes these again whenever the column changes, which is after
	// `load` has run for a new address. "UNSC" and "9 of 15 filled".
	const heading = $derived(seatColumnHeading(column));
	const counts = $derived(seatColumnCounts(column));

	/**
	 * The same page with the panel for this seat open above the grid.
	 *
	 * `manageAllocationUrl` builds it with `resolve()` from `$app/paths`, which
	 * checks the route really exists and adds the base path the app is deployed
	 * under.
	 */
	function panelUrl(seat: GridSeat, action: SeatAction) {
		return manageAllocationUrl(slug, { ...query, seat: seat.id, action });
	}

	/** The lines of one seat's "⋯" menu. They are links; `SeatCell.svelte` says why. */
	function menuItemsFor(seat: GridSeat): DropdownItem[] {
		const items: DropdownItem[] = [];

		if (seat.userId !== null) {
			items.push({ label: 'Move delegate', href: panelUrl(seat, 'move') });
		}

		/* Only a seat somebody sits in, or one held for a delegation, has anything
		   to free. `seatState` is no use here because it answers `hidden` for both
		   of those and for an empty seat alike. */
		const isHeld = seat.userId !== null || seat.delegationId !== null;

		if (isHeld) {
			items.push({ label: 'Free the seat', href: panelUrl(seat, 'free'), tone: 'danger' });
			// A held seat cannot be hidden until it is freed, so the menu does not
			// offer a line the page would only refuse.
			return items;
		}

		const visibilityLabel = seat.isAvailable ? 'Hide the seat' : 'Make it available again';

		items.push({ label: visibilityLabel, href: panelUrl(seat, 'hide') });

		return items;
	}
</script>

<!--
	From `md` up: one column of the row that scrolls sideways. Every column
	starts at the same width (`w-80`), wide enough for a seat, a flag and most
	delegates' full names (T137), and two or three committees grow to share the
	row between them (`grow`, up to `max-w-xl`). When more committees than fit
	are shown, none of them shrinks (`shrink-0`) and the row scrolls instead.
-->
<div class="hidden w-80 max-w-xl shrink-0 grow md:block">
	<div class="flex items-baseline justify-between gap-3 border-b border-foreground pb-2">
		<h2 class="truncate text-h3 text-foreground">{heading}</h2>
		<p class="shrink-0 text-small text-muted-foreground">{counts}</p>
	</div>

	<ul class="flex flex-col">
		<!-- The `(seat.id)` key lets Svelte reuse cells instead of rebuilding
			them. `SeatCell` renders the `<li>` itself, so this list holds nothing else. -->
		{#each column.seats as seat (seat.id)}
			<SeatCell
				{seat}
				state={seatState(seat)}
				isHighlighted={seat.id === query.seat}
				menuItems={menuItemsFor(seat)}
				{drag}
				{isSaving}
				{canChange}
			/>
		{/each}
	</ul>

	{#if column.totalCount === 0}
		<p class="mt-3 text-small text-muted-foreground">No seats. Add some on the committee page.</p>
	{/if}
</div>

<!--
	The same committee below `md`, which is what a phone shows. A `<details>` is
	the browser's own disclosure: it opens and closes with no script at all,
	which is why the phone layout uses one rather than a panel of our own. The
	heading and the counts sit in its `<summary>`, so a shut committee still says
	how full it is.

	Only one of the two layouts is ever visible, because CSS hides the other.
-->
<details class="rounded-control border border-border bg-background md:hidden">
	<summary class="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3">
		<span class="text-h3 text-foreground">{heading}</span>
		<span class="shrink-0 text-small text-muted-foreground">{counts}</span>
	</summary>

	<ul class="flex flex-col border-t border-border px-2">
		{#each column.seats as seat (seat.id)}
			<SeatCell
				{seat}
				state={seatState(seat)}
				isHighlighted={seat.id === query.seat}
				menuItems={menuItemsFor(seat)}
				{drag}
				{isSaving}
				{canChange}
			/>
		{/each}
	</ul>

	{#if column.totalCount === 0}
		<p class="px-3 py-3 text-small text-muted-foreground">
			No seats. Add some on the committee page.
		</p>
	{/if}
</details>
