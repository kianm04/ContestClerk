<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import DragHandle from '$lib/components/DragHandle.svelte';
	import type { GslEntry } from '$lib/gsl-floor';
	import type { SortableList } from '$lib/sortable-list.svelte';
	import { QUEUE_DRAG_FORM_ID, QUEUE_DRAG_HINT_ID } from '$lib/speakers-lists';
	import SeatFlag from '../floor/SeatFlag.svelte';
	import RowMenu from './RowMenu.svelte';

	type Props = {
		/** One waiting entry of the list. */
		entry: GslEntry;
		/** Where it stands in the queue, counting from 0. */
		index: number;
		isFirst?: boolean;
		isLast?: boolean;
		/** Marked absent at the latest roll call since it was added: it keeps its place, and "Next" skips it. */
		isAbsent: boolean;
		/** Whether "Speak now" can give the seat the floor: the list is on the floor. */
		canSpeakNow?: boolean;
		/**
		 * The queue's dragging helper, which says where this row is drawn while one
		 * is dragged. Left out, with `onSubmit`, where the list is only read (the
		 * delegate live view, S13): the row then has no handle and no menu.
		 */
		sortable?: SortableList;
		/** Sends the row menu's presses through the chair's instant form. */
		onSubmit?: SubmitFunction;
		/** The reader's own seat on the delegate live view: semi-bold, with "You" at its right. */
		isReader?: boolean;
	};

	let {
		entry,
		index,
		isFirst = false,
		isLast = false,
		isAbsent,
		canSpeakNow = false,
		sortable,
		onSubmit,
		isReader = false
	}: Props = $props();

	// Where the dragging helper draws this row now: how far it has slid, and
	// whether it is the one lifted out of the list. Both change as a drag goes on.
	const offset = $derived(sortable ? sortable.offsetOf(index) : 0);
	const dragClasses = $derived(sortable ? sortable.rowClassesOf(entry.id) : '');
	// A row that cannot be dragged or opened does not light up under the pointer.
	const hoverClasses = $derived(sortable ? 'hover:bg-ground' : '');
	const readerClasses = $derived(isReader ? 'font-semibold' : '');
</script>

<!--
	One waiting speaker, 44px tall with a hairline under it: the drag handle,
	the place, the flag, the country and the delegate, or "absent" where the
	delegate was. On the delegate live view there is no handle and no menu,
	and the reader's own row says "You". The delegate is hidden when the column is narrower than
	360px (`@max-[360px]:` reads the column's own width, which its `@container`
	class measures). `data-sortable-row` lets the dragging helper measure the
	row, and `style:transform` slides it by `offset` pixels while a row is
	dragged, without changing the order the rows are in.
-->
<li
	data-sortable-row
	style:transform={offset === 0 ? undefined : `translateY(${offset}px)`}
	class="group relative flex h-11 items-center gap-2.5 border-b border-line bg-surface pr-1 {hoverClasses} {dragClasses} {readerClasses}"
>
	{#if sortable}
		<DragHandle
			{sortable}
			row={{ id: entry.id, index, name: entry.seat.name }}
			hintId={QUEUE_DRAG_HINT_ID}
			form={QUEUE_DRAG_FORM_ID}
		/>
	{/if}
	<span class="w-5 flex-none text-right text-small text-ink-600 tabular-nums">{index + 1}</span>
	<SeatFlag seat={entry.seat} size="row" />
	<span
		class="max-w-[60%] flex-none truncate @max-[360px]:max-w-none @max-[360px]:flex-1 {isAbsent
			? 'text-ink-600'
			: ''}"
	>
		{entry.seat.name}
	</span>
	{#if isAbsent}
		<span class="text-small text-ink-600">absent</span>
	{:else if entry.seat.delegateName}
		<span class="min-w-0 flex-1 truncate text-small text-ink-600 @max-[360px]:hidden">
			{entry.seat.delegateName}
		</span>
	{/if}
	{#if isReader}
		<span class="ml-auto flex-none text-small font-semibold text-brand-700">You</span>
	{/if}
	{#if onSubmit}
		<RowMenu
			entryId={entry.id}
			seatName={entry.seat.name}
			canSpeakNow={canSpeakNow && !isAbsent}
			{isFirst}
			{isLast}
			{onSubmit}
		/>
	{/if}
</li>
