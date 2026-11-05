/**
 * The arithmetic behind dragging a row of a list into a new place: where the
 * row would land, how far the other rows slide to make room, which place an
 * arrow key moves it to, and the order once it has landed.
 *
 * `$lib/sortable-list.svelte.ts` follows the pointer and the keyboard and asks
 * these functions what to draw. Nothing here knows about the page, so every
 * rule can be tested on plain numbers.
 */

/** Where one row sits on the screen when the drag starts, in pixels from the top. */
export type RowBox = {
	top: number;
	height: number;
};

/** A drop that has been sent to the server but not yet answered. */
export type PendingPlace = {
	/** The id of the row that was dropped. */
	id: string;
	/** Where it was dropped, counting from 0. */
	toIndex: number;
};

/**
 * `items` with the item at `fromIndex` taken out and put back at `toIndex`.
 * The array given is left alone. An index outside the list changes nothing.
 */
export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
	const isOutside = (index: number) => index < 0 || index >= items.length;

	if (isOutside(fromIndex) || isOutside(toIndex)) return items;

	const reordered = [...items];
	const [moved] = reordered.splice(fromIndex, 1);
	reordered.splice(toIndex, 0, moved);

	return reordered;
}

/**
 * `rows` as they will look once a drop still on its way to the server has been
 * saved, or `rows` unchanged when nothing is pending or the row is gone.
 */
export function placedOrder<T extends { id: string }>(
	rows: T[],
	pending: PendingPlace | null
): T[] {
	if (pending === null) return rows;

	const fromIndex = rows.findIndex((row) => row.id === pending.id);

	if (fromIndex === -1) return rows;

	const toIndex = Math.min(pending.toIndex, rows.length - 1);

	return moveItem(rows, fromIndex, toIndex);
}

/** One row's place as the database keeps it. Lower positions come first. */
export type RowPosition = {
	id: string;
	position: number;
};

/**
 * The positions to write so that the row `id` stands at `toIndex` (from 0)
 * among `rows`, which close up behind it. `rows` must be in their saved order.
 * Only rows whose position changes are returned, and an empty list when no row
 * has that id. A place past the end means last.
 *
 * The rows are numbered afresh from the lowest position among them, so two
 * rows that shared a position get one each.
 */
export function positionsAfterDrop(
	rows: RowPosition[],
	id: string,
	toIndex: number
): RowPosition[] {
	const fromIndex = rows.findIndex((row) => row.id === id);

	if (fromIndex === -1) return [];

	const lastIndex = rows.length - 1;
	const reordered = moveItem(rows, fromIndex, Math.min(Math.max(toIndex, 0), lastIndex));
	const firstPosition = rows[0].position;
	const renumbered = reordered.map((row, index) => ({
		id: row.id,
		position: firstPosition + index,
		previousPosition: row.position
	}));
	const changed = renumbered.filter((row) => row.position !== row.previousPosition);

	return changed.map(({ id: changedId, position }) => ({ id: changedId, position }));
}

/**
 * The place a drop sends, counting from 1, read into an index counting from 0.
 * Null when it is not a whole number of at least 1.
 */
export function readDroppedPlace(value: FormDataEntryValue | null): number | null {
	if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;

	const place = Number(value.trim());

	return place >= 1 ? place - 1 : null;
}

/**
 * The place a dragged row would land at: one after every other row whose
 * middle it has passed. `draggedMiddle` is where the middle of the dragged
 * row is now, in the same pixels as `boxes`.
 */
export function dropIndex(boxes: RowBox[], fromIndex: number, draggedMiddle: number): number {
	let index = 0;

	boxes.forEach((box, boxIndex) => {
		if (boxIndex === fromIndex) return;

		const middle = box.top + box.height / 2;

		if (draggedMiddle > middle) index += 1;
	});

	return index;
}

/**
 * How far a row that is not being dragged slides, in pixels, to make room.
 * Rows between the dragged row's old place and its new one move one step
 * towards the old place, by the dragged row's height and the gap under it.
 */
export function makeRoomOffset(
	index: number,
	fromIndex: number,
	toIndex: number,
	draggedStep: number
): number {
	const isMovingDown = toIndex > fromIndex;

	if (isMovingDown && index > fromIndex && index <= toIndex) return -draggedStep;

	const isMovingUp = toIndex < fromIndex;

	if (isMovingUp && index >= toIndex && index < fromIndex) return draggedStep;

	return 0;
}

/**
 * How far the dragged row must slide to sit exactly in the place `toIndex`,
 * once the others have made room: to the target's top when moving up, and so
 * that its bottom meets the target's bottom when moving down.
 */
export function placeOffset(boxes: RowBox[], fromIndex: number, toIndex: number): number {
	const from = boxes[fromIndex];
	const target = boxes[toIndex];

	if (!from || !target || fromIndex === toIndex) return 0;

	if (toIndex < fromIndex) return target.top - from.top;

	return target.top + target.height - (from.top + from.height);
}

/**
 * The distance from one row's top to the next row's top: the height of the
 * row plus the gap under it. The last row has no row under it, so it counts
 * the gap above it instead.
 */
export function rowStep(boxes: RowBox[], index: number): number {
	const box = boxes[index];

	if (!box) return 0;

	const next = boxes[index + 1];

	if (next) return next.top - box.top;

	const previous = boxes[index - 1];

	if (previous) return box.top - previous.top;

	return box.height;
}

/**
 * The place an arrow key moves a picked-up row to: one up or down, or to the
 * top or bottom with Home and End, never past either end. Null for any other key.
 */
export function keyboardTarget(key: string, index: number, count: number): number | null {
	const last = count - 1;

	if (key === 'ArrowUp') return Math.max(0, index - 1);
	if (key === 'ArrowDown') return Math.min(last, index + 1);
	if (key === 'Home') return 0;
	if (key === 'End') return last;

	return null;
}

/** What a screen reader hears when a row is picked up with the keyboard. */
export function pickedUpMessage(name: string, index: number, count: number): string {
	return `${name} picked up, place ${index + 1} of ${count}. Use the arrow keys to move it, Space to drop it and Escape to cancel.`;
}

/** What a screen reader hears each time a picked-up row moves. */
export function movedMessage(name: string, index: number, count: number): string {
	return `${name}, place ${index + 1} of ${count}.`;
}

/** What a screen reader hears when a row is dropped, however it was moved. */
export function droppedMessage(
	name: string,
	fromIndex: number,
	toIndex: number,
	count: number
): string {
	if (fromIndex === toIndex) return `${name} dropped, still place ${toIndex + 1} of ${count}.`;

	return `${name} dropped at place ${toIndex + 1} of ${count}.`;
}

/** What a screen reader hears when a drag is called off. */
export function cancelledMessage(name: string, index: number): string {
	return `${name} put back at place ${index + 1}.`;
}

/**
 * The line a screen reader reads after a drag handle's name, explaining the
 * keys. `thing` is what the list holds, such as "fee" or "question".
 */
export function reorderHint(thing: string): string {
	return `Drag to reorder, or press Space to pick the ${thing} up, the arrow keys to move it and Space to drop it.`;
}
