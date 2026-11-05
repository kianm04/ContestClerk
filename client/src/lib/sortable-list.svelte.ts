/**
 * Dragging the rows of a list into a new order, with a mouse, a finger or the
 * keyboard. The speaking queue uses it first (T129); other ordered lists and
 * the allocation grid are meant to reuse it rather than write their own.
 *
 * A list makes one with `createSortableList()` and gives each row a
 * `DragHandle` (`$lib/components/DragHandle.svelte`), which passes the handle's
 * pointer and key events in here. The helper works out where the row would
 * land and how far every row slides (`$lib/drag-order.ts`), and when the row is
 * dropped in a new place it calls `onDrop`. Saving the new order is the list's
 * job, usually with a form sent through `$lib/in-place-form.svelte.ts`.
 *
 * It uses the browser's own pointer events, which cover the mouse, the pen and
 * the finger alike, so no library is needed. Nothing here runs without
 * JavaScript: a list keeps its buttons or menus for that.
 *
 * The file ends in `.svelte.ts` because it uses `$state`, which Svelte only
 * understands in `.svelte` files and in modules named like this one.
 */
import { tick } from 'svelte';
import {
	cancelledMessage,
	dropIndex,
	droppedMessage,
	keyboardTarget,
	makeRoomOffset,
	movedMessage,
	pickedUpMessage,
	placeOffset,
	rowStep,
	type RowBox
} from '$lib/drag-order';

/**
 * The attributes the helper looks for on the page. The list's element carries
 * `data-sortable-list`, and each row directly inside it `data-sortable-row`, so
 * the handle can measure every row when a drag starts.
 */
export const SORTABLE_LIST_ATTRIBUTE = 'data-sortable-list';
export const SORTABLE_ROW_ATTRIBUTE = 'data-sortable-row';

/** What the list is told when a row has been dropped in a new place. */
export type SortableDrop = {
	/** The id of the row that moved. */
	id: string;
	fromIndex: number;
	toIndex: number;
	/** The handle it was dragged by, for a list that sends the form the handle belongs to. */
	handle: HTMLButtonElement;
};

/** Which row a handle belongs to, as the handle passes it with every event. */
export type SortableRow = {
	id: string;
	index: number;
	/** What the row is called, such as "Brazil", for the screen reader's messages. */
	name: string;
};

export type SortableList = {
	/** The id of the row being dragged, or null when nothing is. */
	readonly draggedId: string | null;
	/** True while a row is being dragged, so the others can slide smoothly. */
	readonly isDragging: boolean;
	/** The sentence a screen reader should read out now, for an `aria-live` paragraph. */
	readonly announcement: string;
	/** How far down (or up, when negative) the row at `index` is drawn, in pixels. */
	offsetOf: (index: number) => number;
	/** The Tailwind classes the row with this id needs now: lifted while dragged, sliding otherwise. */
	rowClassesOf: (id: string) => string;
	handlePointerDown: (event: PointerEvent, row: SortableRow) => void;
	handlePointerMove: (event: PointerEvent) => void;
	handlePointerUp: (event: PointerEvent) => void;
	handlePointerCancel: () => void;
	handleKeydown: (event: KeyboardEvent, row: SortableRow) => void;
	/** Called when the handle loses the keyboard focus, which calls a keyboard drag off. */
	handleBlur: () => void;
};

type SortableOptions = {
	/** Called once a row lands somewhere other than where it started. */
	onDrop: (drop: SortableDrop) => void;
};

/** The pixels of pointer travel before a press on the handle counts as a drag. */
const DRAG_THRESHOLD_PX = 4;

/** Measure every row of the list the handle is in, as they sit before anything moves. */
function measureRows(handle: HTMLElement): RowBox[] {
	const list = handle.closest(`[${SORTABLE_LIST_ATTRIBUTE}]`);

	if (!list) return [];

	const rows = Array.from(list.querySelectorAll(`:scope > [${SORTABLE_ROW_ATTRIBUTE}]`));

	return rows.map((row) => {
		const box = row.getBoundingClientRect();

		return { top: box.top, height: box.height };
	});
}

/** Make the dragging helper for one list. Call it once in a component's `<script>`. */
export function createSortableList(options: SortableOptions): SortableList {
	// `$state` makes every row that reads these redraw when they change.
	let draggedRow: SortableRow | null = $state(null);
	let toIndex = $state(0);
	// How far the pointer has travelled since the press, in pixels.
	let pointerOffset = $state(0);
	let isKeyboardDrag = $state(false);
	let announcement = $state('');

	// Plain variables: nothing is drawn from these, they only help the maths.
	let boxes: RowBox[] = [];
	let startPageY = 0;
	let hasMoved = false;

	function reset() {
		draggedRow = null;
		pointerOffset = 0;
		isKeyboardDrag = false;
		hasMoved = false;
		boxes = [];
	}

	function start(row: SortableRow, handle: HTMLElement) {
		boxes = measureRows(handle);
		draggedRow = row;
		toIndex = row.index;
		pointerOffset = 0;
	}

	function drop(handle: HTMLButtonElement) {
		if (draggedRow === null) return;

		const { id, index: fromIndex, name } = draggedRow;
		const landedAt = toIndex;
		const count = boxes.length;
		const hadFocus = document.activeElement === handle;
		reset();
		announcement = droppedMessage(name, fromIndex, landedAt, count);

		if (landedAt === fromIndex) return;

		options.onDrop({ id, fromIndex, toIndex: landedAt, handle });

		// Redrawing the list in its new order moves the row's element, and a
		// browser drops the focus of an element it moves. `tick()` waits until
		// Svelte has redrawn, then the focus goes back to the handle it was on.
		if (hadFocus) tick().then(() => handle.focus());
	}

	function offsetOf(index: number): number {
		if (draggedRow === null) return 0;

		const fromIndex = draggedRow.index;

		if (index === fromIndex) {
			return isKeyboardDrag ? placeOffset(boxes, fromIndex, toIndex) : pointerOffset;
		}

		return makeRoomOffset(index, fromIndex, toIndex, rowStep(boxes, fromIndex));
	}

	function rowClassesOf(id: string): string {
		if (draggedRow === null) return '';

		// The rows making room slide rather than jump.
		const sliding = 'transition-transform duration-150';

		if (id !== draggedRow.id) return sliding;

		// The row being dragged sits above the others, lifted by a shadow and
		// outlined in the logo's light blue so it is plain which row is moving (T137).
		// It follows a pointer exactly, but slides from place to place when moved
		// with the keys.
		const lifted = 'relative z-10 bg-surface shadow-card ring-2 ring-brand-500';

		return isKeyboardDrag ? `${lifted} ${sliding}` : lifted;
	}

	function handlePointerDown(event: PointerEvent, row: SortableRow) {
		// Only the main mouse button, a finger or a pen starts a drag.
		if (event.button !== 0 || draggedRow !== null) return;

		const handle = event.currentTarget as HTMLElement;
		// Pointer capture sends every later move and release to the handle, even
		// once the pointer has left it, so the drag cannot be lost halfway.
		handle.setPointerCapture(event.pointerId);
		startPageY = event.pageY;
		hasMoved = false;
		start(row, handle);
	}

	function handlePointerMove(event: PointerEvent) {
		if (draggedRow === null || isKeyboardDrag) return;

		const travelled = event.pageY - startPageY;

		if (!hasMoved && Math.abs(travelled) < DRAG_THRESHOLD_PX) return;

		hasMoved = true;
		pointerOffset = travelled;
		const from = boxes[draggedRow.index];

		if (!from) return;

		toIndex = dropIndex(boxes, draggedRow.index, from.top + from.height / 2 + travelled);
	}

	function handlePointerUp(event: PointerEvent) {
		if (draggedRow === null || isKeyboardDrag) return;

		// A press that never moved is a click, which leaves the order alone.
		if (!hasMoved) {
			reset();
			return;
		}

		drop(event.currentTarget as HTMLButtonElement);
	}

	function handlePointerCancel() {
		if (isKeyboardDrag) return;

		reset();
	}

	function handleKeydown(event: KeyboardEvent, row: SortableRow) {
		const handle = event.currentTarget as HTMLButtonElement;
		const isPickedUp = draggedRow !== null && isKeyboardDrag;

		if (event.key === ' ' || event.key === 'Enter') {
			// Stops the page scrolling, which is what Space does otherwise.
			event.preventDefault();

			if (isPickedUp) {
				drop(handle);
				return;
			}

			start(row, handle);
			isKeyboardDrag = true;
			announcement = pickedUpMessage(row.name, row.index, boxes.length);
			return;
		}

		if (!isPickedUp || draggedRow === null) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			const { name, index } = draggedRow;
			reset();
			announcement = cancelledMessage(name, index);
			return;
		}

		const target = keyboardTarget(event.key, toIndex, boxes.length);

		if (target === null) return;

		event.preventDefault();
		toIndex = target;
		announcement = movedMessage(draggedRow.name, target, boxes.length);
	}

	function handleBlur() {
		if (draggedRow === null || !isKeyboardDrag) return;

		const { name, index } = draggedRow;
		reset();
		announcement = cancelledMessage(name, index);
	}

	return {
		get draggedId() {
			return draggedRow?.id ?? null;
		},
		get isDragging() {
			return draggedRow !== null;
		},
		get announcement() {
			return announcement;
		},
		offsetOf,
		rowClassesOf,
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
		handlePointerCancel,
		handleKeydown,
		handleBlur
	};
}
