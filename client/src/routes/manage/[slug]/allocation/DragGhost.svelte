<script lang="ts">
	import type { DropTargetDrag } from '$lib/drop-target-drag.svelte';
	import { dragSourceName, type SeatDragSource } from '$lib/seat-drop';

	type Props = {
		/** The grid's dragging helper, which says what is dragged and where the pointer is. */
		drag: DropTargetDrag<SeatDragSource>;
	};

	let { drag }: Props = $props();

	// `$derived` recalculates when the helper's `dragged` changes, at the start and end of a drag.
	const name = $derived(drag.dragged === null ? '' : dragSourceName(drag.dragged));
</script>

<!--
	The chip that follows the pointer while somebody is dragged. `fixed` places
	it against the window, so the grid's sideways scrolling cannot cut it off,
	and `pointer-events-none` lets the pointer see the seat underneath it.
-->
{#if drag.dragged !== null && drag.hasMoved}
	<div
		aria-hidden="true"
		class="pointer-events-none fixed z-50 rounded-control bg-brand-700 px-3 py-1 text-small text-surface shadow-card"
		style="left: {drag.pointerX + 12}px; top: {drag.pointerY + 12}px;"
	>
		{name}
	</div>
{/if}
