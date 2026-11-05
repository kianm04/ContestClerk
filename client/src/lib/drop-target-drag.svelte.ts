/**
 * Dragging something onto one of several targets with a mouse or a pen, the
 * way the allocation grid drags a delegate onto a seat (T131).
 *
 * `$lib/sortable-list.svelte.ts` (T129) drags rows up and down one list. A seat
 * can be dropped anywhere in a grid of columns that scrolls both ways, so this
 * helper asks a different question: which target is under the pointer now?
 * Each target carries `data-drop-target="<its id>"`, and the helper looks for
 * the nearest one under the pointer with `document.elementFromPoint`. Deciding
 * whether that target accepts the drop is the page's job.
 *
 * While dragging near the edge of the window, or of an area marked
 * `data-drag-scroll` such as the grid's sideways-scrolling row, it scrolls
 * that way so an off-screen seat can be reached (`$lib/edge-scroll.ts`).
 *
 * It uses the browser's own pointer events, like T129's helper, and needs
 * JavaScript, so every page that uses it keeps forms for the same work. The
 * file ends in `.svelte.ts` because it uses `$state`, which Svelte only
 * understands in `.svelte` files and in modules named like this one.
 */
import { edgeScrollStep } from '$lib/edge-scroll';

/** The attribute every target carries, with the target's id as its value. */
export const DROP_TARGET_ATTRIBUTE = 'data-drop-target';

/** The attribute on an area that scrolls while something is dragged near its edge. */
export const DRAG_SCROLL_ATTRIBUTE = 'data-drag-scroll';

/** The pixels of pointer travel before a press on a handle counts as a drag. */
const DRAG_THRESHOLD_PX = 4;

export type DropTargetDrag<Source> = {
	/** What is being dragged, or null when nothing is. */
	readonly dragged: Source | null;
	/** True once the pointer has moved far enough for the press to be a drag, not a click. */
	readonly hasMoved: boolean;
	/** The id of the target under the pointer, or null. */
	readonly hoveredTargetId: string | null;
	/** Where the pointer is on the screen, for the chip that follows it. */
	readonly pointerX: number;
	readonly pointerY: number;
	handlePointerDown: (event: PointerEvent, source: Source) => void;
	handlePointerMove: (event: PointerEvent) => void;
	handlePointerUp: () => void;
	handlePointerCancel: () => void;
};

type DropTargetOptions<Source> = {
	/** Called when `source` is let go over the target with this id. */
	onDrop: (source: Source, targetId: string) => void;
};

/** The id of the target under this point of the screen, or null. */
function targetIdAt(x: number, y: number): string | null {
	const element = document.elementFromPoint(x, y);
	const target = element?.closest(`[${DROP_TARGET_ATTRIBUTE}]`);

	return target?.getAttribute(DROP_TARGET_ATTRIBUTE) ?? null;
}

/** Scroll the window, and the scrolling area under the pointer, if the pointer is near an edge. */
function scrollNearEdges(x: number, y: number): boolean {
	const windowStep = edgeScrollStep(y, 0, window.innerHeight);
	const area = document.elementFromPoint(x, y)?.closest(`[${DRAG_SCROLL_ATTRIBUTE}]`);
	const box = area?.getBoundingClientRect();
	const areaStep = box ? edgeScrollStep(x, box.left, box.right) : 0;

	if (windowStep !== 0) window.scrollBy(0, windowStep);
	if (area && areaStep !== 0) area.scrollLeft += areaStep;

	return windowStep !== 0 || areaStep !== 0;
}

/** Make the dragging helper for one page. Call it once in a component's `<script>`. */
export function createDropTargetDrag<Source>(
	options: DropTargetOptions<Source>
): DropTargetDrag<Source> {
	// `$state` makes everything that reads these redraw when they change.
	let dragged: Source | null = $state(null);
	let hasMoved = $state(false);
	let hoveredTargetId: string | null = $state(null);
	let pointerX = $state(0);
	let pointerY = $state(0);

	// Plain variables: nothing is drawn from these.
	let startX = 0;
	let startY = 0;
	let scrollFrame = 0;

	function reset() {
		cancelAnimationFrame(scrollFrame);
		dragged = null;
		hasMoved = false;
		hoveredTargetId = null;
	}

	/*
		Runs once per frame the screen draws for as long as a drag lasts.
		Scrolling moves the page under a pointer that may be standing still,
		which sends no pointer event at all, so the target under it is asked
		again here after every scroll.
	*/
	function scrollWhileDragging() {
		if (dragged === null) return;

		if (hasMoved && scrollNearEdges(pointerX, pointerY)) {
			hoveredTargetId = targetIdAt(pointerX, pointerY);
		}

		scrollFrame = requestAnimationFrame(scrollWhileDragging);
	}

	function handlePointerDown(event: PointerEvent, source: Source) {
		// Only the main mouse button or a pen starts a drag.
		if (event.button !== 0 || dragged !== null) return;

		const handle = event.currentTarget as HTMLElement;
		// Pointer capture sends every later move and release to the handle, even
		// once the pointer has left it, so the drag cannot be lost halfway.
		handle.setPointerCapture(event.pointerId);
		// Stops the browser selecting the text the pointer passes over.
		event.preventDefault();
		dragged = source;
		startX = event.clientX;
		startY = event.clientY;
		pointerX = event.clientX;
		pointerY = event.clientY;
		scrollFrame = requestAnimationFrame(scrollWhileDragging);
	}

	function handlePointerMove(event: PointerEvent) {
		if (dragged === null) return;

		pointerX = event.clientX;
		pointerY = event.clientY;
		const travelled = Math.hypot(pointerX - startX, pointerY - startY);

		if (!hasMoved && travelled < DRAG_THRESHOLD_PX) return;

		hasMoved = true;
		hoveredTargetId = targetIdAt(pointerX, pointerY);
	}

	function handlePointerUp() {
		if (dragged === null) return;

		const source = dragged;
		const targetId = hasMoved ? hoveredTargetId : null;
		reset();

		// A press that never moved, or a drop on no target, changes nothing.
		if (targetId !== null) options.onDrop(source, targetId);
	}

	return {
		get dragged() {
			return dragged;
		},
		get hasMoved() {
			return hasMoved;
		},
		get hoveredTargetId() {
			return hoveredTargetId;
		},
		get pointerX() {
			return pointerX;
		},
		get pointerY() {
			return pointerY;
		},
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
		handlePointerCancel: reset
	};
}
