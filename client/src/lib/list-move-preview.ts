/**
 * What an ordered list will look like once a "move up" or "move down" press
 * that is still on its way to the server has been done.
 *
 * Several organiser pages let a row swap places with its neighbour: the
 * application form's questions, the fee list and the committee list. Each
 * keeps the press that is on its way in `$state` and draws this instead of
 * the stored order, so the row jumps to its new place at once instead of
 * waiting for the server to answer and the page to re-read its data. Once the
 * server answers, the component clears the pending press and the stored
 * order — which by then holds the real move, or does not if it was refused —
 * takes over again.
 */

/** A press that has been sent but not yet answered. */
export type PendingMove = {
	/** The id of the row being moved. */
	id: string;
	direction: 'up' | 'down';
};

/**
 * `rows` with the pending move already done, or `rows` unchanged when there
 * is nothing to show yet: `pending` is null, no row has its id, or the move
 * would push the row past the top or bottom of the list.
 */
export function movedOrder<T extends { id: string }>(rows: T[], pending: PendingMove | null): T[] {
	if (pending === null) return rows;

	const fromIndex = rows.findIndex((row) => row.id === pending.id);

	if (fromIndex === -1) return rows;

	const toIndex = pending.direction === 'up' ? fromIndex - 1 : fromIndex + 1;

	if (toIndex < 0 || toIndex >= rows.length) return rows;

	const reordered = [...rows];
	[reordered[fromIndex], reordered[toIndex]] = [reordered[toIndex], reordered[fromIndex]];

	return reordered;
}

/**
 * The move a pressed arrow asks for, read from the address it posts to, such
 * as `?/moveFee&direction=up`: the direction travels in the action's own query
 * string, because one form holds both arrows. Null for a button of the same
 * form that moves nothing, such as a seat row's "Delete".
 */
export function pendingMoveFrom(rowId: string, action: URL): PendingMove | null {
	const direction = action.searchParams.get('direction');

	if (direction !== 'up' && direction !== 'down') return null;

	return { id: rowId, direction };
}
