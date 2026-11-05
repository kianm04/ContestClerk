<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { AttendanceStatus } from '$lib/committee-room';
	import type { PendingPlace } from '$lib/drag-order';
	import { isSeatAbsent, type GslEntry } from '$lib/gsl-floor';
	import { setDropFields } from '$lib/room-presses';
	import { createSortableList, type SortableDrop } from '$lib/sortable-list.svelte';
	import QueueDragForm from './QueueDragForm.svelte';
	import QueueRow from './QueueRow.svelte';

	type Props = {
		/** The waiting entries, in speaking order, with the presses on their way laid on top. */
		waiting: GslEntry[];
		/** The latest roll call, keyed by seat id; empty before the first. */
		attendance: Record<string, AttendanceStatus>;
		/** Whether "Speak now" can give a row's seat the floor: the list is on the floor. */
		canSpeakNow: boolean;
		/** Sends every press through the chair's instant form (`$lib/chair-form.ts`). */
		onSubmit: SubmitFunction;
	};

	let { waiting, attendance, canSpeakNow, onSubmit }: Props = $props();

	// The latest drop, which the drag form sends. A plain variable: nothing is drawn from it.
	let latestDrop: PendingPlace | null = null;

	/** Send the form the handle belongs to, which saves the drop. */
	function handleDrop(drop: SortableDrop) {
		latestDrop = { id: drop.id, toIndex: drop.toIndex };
		drop.handle.form?.requestSubmit();
	}

	/** A drop's form has no fields of its own, so they are filled in from `latestDrop`. */
	const submitDrop: SubmitFunction = (input) => {
		if (latestDrop !== null) setDropFields(input.formData, latestDrop);

		return onSubmit(input);
	};

	// Follows the drag handles and works out where every row is drawn (`$lib/sortable-list.svelte.ts`).
	const sortable = createSortableList({ onDrop: handleDrop });
</script>

<QueueDragForm {sortable} onSubmit={submitDrop} />

<!--
	The waiting rows. They scroll inside the column, whose foot stays at the
	bottom, and once the column sits under the floor (below 861px wide) they
	no longer scroll on their own. `data-sortable-list` tells the dragging
	helper which rows belong to this list.
-->
<ol
	data-sortable-list
	aria-label="Waiting to speak"
	class="-mx-2 min-h-0 flex-1 overflow-auto px-2 max-[860px]:flex-none max-[860px]:overflow-visible"
>
	<!-- The `(entry.id)` key lets Svelte move a row instead of rebuilding it. -->
	{#each waiting as entry, index (entry.id)}
		<QueueRow
			{entry}
			{index}
			isFirst={index === 0}
			isLast={index === waiting.length - 1}
			isAbsent={isSeatAbsent(entry.seat.id, attendance)}
			{canSpeakNow}
			{sortable}
			{onSubmit}
		/>
	{/each}
</ol>
