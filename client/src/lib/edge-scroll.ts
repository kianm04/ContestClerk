/**
 * How fast to scroll while something is dragged near the edge of a scrolling
 * area, so the organiser can reach a seat that is off screen without letting
 * go (T131). `$lib/drop-target-drag.svelte.ts` asks this once per frame.
 */

/** How close to an edge, in pixels, the pointer has to be before scrolling starts. */
export const EDGE_SCROLL_ZONE_PX = 48;

/** The most pixels one frame scrolls, reached with the pointer right on the edge. */
export const EDGE_SCROLL_MAX_STEP_PX = 16;

/**
 * How many pixels to scroll this frame along one direction: negative towards
 * `start`, positive towards `end`, 0 away from both edges. `position`,
 * `start` and `end` are measured along the same direction, such as the
 * pointer's `clientX` and a box's left and right. The closer the pointer is to
 * an edge, the faster it goes.
 */
export function edgeScrollStep(position: number, start: number, end: number): number {
	const isOutside = position < start || position > end;

	if (isOutside) return 0;

	const fromStart = position - start;
	const fromEnd = end - position;

	if (fromStart < EDGE_SCROLL_ZONE_PX && fromStart <= fromEnd) {
		const depth = (EDGE_SCROLL_ZONE_PX - fromStart) / EDGE_SCROLL_ZONE_PX;

		return -Math.ceil(depth * EDGE_SCROLL_MAX_STEP_PX);
	}

	if (fromEnd < EDGE_SCROLL_ZONE_PX) {
		const depth = (EDGE_SCROLL_ZONE_PX - fromEnd) / EDGE_SCROLL_ZONE_PX;

		return Math.ceil(depth * EDGE_SCROLL_MAX_STEP_PX);
	}

	return 0;
}
