<script lang="ts">
	import { onMount } from 'svelte';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import type { DropTargetDrag } from '$lib/drop-target-drag.svelte';
	import type { SeatDragSource } from '$lib/seat-drop';

	type Props = {
		/** The grid's dragging helper, from `createDropTargetDrag()` in `AllocationBoard`. */
		drag: DropTargetDrag<SeatDragSource>;
		/** What this handle picks up: a seat's delegate, or a delegation from the tray. */
		source: SeatDragSource;
		/** Shown on hover, such as "Drag Anna Kowalski to another seat". */
		title: string;
		/** While an earlier drop is still being saved, so nothing new can be picked up. */
		isDisabled: boolean;
	};

	let { drag, source, title, isDisabled }: Props = $props();

	/*
		Whether this component is running in the browser. Dragging needs
		JavaScript, so without it the handle is not drawn at all. `onMount` only
		ever runs in the browser, once Svelte has taken over the page's HTML.
	*/
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	function handlePointerDown(event: PointerEvent) {
		if (isDisabled) return;

		drag.handlePointerDown(event, source);
	}
</script>

<!--
	The six dots a delegate or a delegation is dragged by, with a mouse or a
	pen. It is hidden from the keyboard and from screen readers (`tabindex="-1"`
	and `aria-hidden`), because the seat's "⋯" menu and the delegation's review
	page already do the same work in a way both can use (T131). It is hidden
	below `md` too: on a phone the menu is the way to move somebody. The `on…`
	attributes pass each pointer event to `$lib/drop-target-drag.svelte.ts`.
-->
{#if isScriptRunning}
	<button
		type="button"
		tabindex="-1"
		aria-hidden="true"
		{title}
		onpointerdown={handlePointerDown}
		onpointermove={drag.handlePointerMove}
		onpointerup={drag.handlePointerUp}
		onpointercancel={drag.handlePointerCancel}
		class="hidden size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-ink-600 select-none hover:bg-neutral-100 hover:text-ink-900 active:cursor-grabbing md:flex {isDisabled
			? 'opacity-60'
			: ''}"
	>
		<GripVertical size={16} strokeWidth={1.75} aria-hidden="true" />
	</button>
{/if}
