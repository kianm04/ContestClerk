<script lang="ts">
	import { onMount } from 'svelte';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import type { SortableList, SortableRow } from '$lib/sortable-list.svelte';

	type Props = {
		/** The list's dragging helper, from `createSortableList()`. */
		sortable: SortableList;
		/** The row this handle moves. */
		row: SortableRow;
		/** The id of the paragraph that explains the keys, read after the handle's name. */
		hintId: string;
		/**
		 * The id of a `<form>` elsewhere on the page that saves a drop. The handle
		 * then belongs to that form, so the list can send it from the handle.
		 */
		form?: string;
		/** While an earlier drop is still being saved, so the row cannot be picked up. */
		isDisabled?: boolean;
	};

	let { sortable, row, hintId, form, isDisabled = false }: Props = $props();

	const isPickedUp = $derived(sortable.draggedId === row.id);

	/*
		Whether this component is running in the browser. Without JavaScript a
		row cannot be dragged, so the handle is kept invisible (its space stays,
		so nothing jumps sideways when the script starts). `onMount` only ever
		runs in the browser, once Svelte has taken over the page's HTML.
	*/
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	/*
		A handle waiting for an earlier drop is not given the `disabled`
		attribute: a browser moves the keyboard focus off a button that becomes
		disabled, and the reader who has just dropped a row should find the focus
		where they left it. It says so with `aria-disabled` and ignores presses.
	*/
	function handlePointerDown(event: PointerEvent) {
		if (isDisabled) return;

		sortable.handlePointerDown(event, row);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (isDisabled) return;

		sortable.handleKeydown(event, row);
	}

	// Tailwind classes, kept here because the list is too long to read inside the tag.
	const HANDLE_CLASSES = [
		'flex size-11 shrink-0 items-center justify-center rounded-control text-ink-600',
		'cursor-grab touch-none select-none active:cursor-grabbing',
		'hover:bg-neutral-100 hover:text-ink-900 aria-disabled:opacity-60',
		'aria-pressed:bg-brand-50 aria-pressed:text-brand-700'
	].join(' ');
</script>

<!--
	The six dots a row is dragged by. It is a real button so the keyboard can
	reach it: Space picks the row up, the arrow keys move it and Space drops it.
	`touch-none` stops a finger on the handle from scrolling the page, so the
	finger drags the row instead. The `on…` attributes pass each pointer and
	key event to the list's helper, `$lib/sortable-list.svelte.ts`.
-->
<button
	type="button"
	{form}
	aria-label="Reorder {row.name}"
	aria-describedby={hintId}
	aria-pressed={isPickedUp}
	aria-disabled={isDisabled ? 'true' : undefined}
	disabled={!isScriptRunning}
	onpointerdown={handlePointerDown}
	onpointermove={sortable.handlePointerMove}
	onpointerup={sortable.handlePointerUp}
	onpointercancel={sortable.handlePointerCancel}
	onkeydown={handleKeydown}
	onblur={sortable.handleBlur}
	class="{HANDLE_CLASSES} {isScriptRunning ? '' : 'invisible'}"
>
	<GripVertical size={20} strokeWidth={1.75} aria-hidden="true" />
</button>
