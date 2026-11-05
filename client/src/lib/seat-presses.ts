/**
 * What "Hide", "Show" and "Delete" do to a committee's seat list, worked out
 * in the browser at the moment of the press (T142), so the row changes at
 * once instead of waiting for the server. Mirrors the two actions in
 * `[committeeId]/+page.server.ts`. Moving a seat up, down or by dragging
 * already shows at once through the older `$lib/list-move-preview.ts`
 * pattern, so it is not part of this file.
 */
import type { ManagedSeat } from '$lib/committees';
import {
	pressedAction,
	pressedField,
	type PressedForm,
	type RowChange,
	type RowPress
} from '$lib/row-changes';

/** A press of the seats table's instant form. */
export type SeatPress = RowPress<ManagedSeat>;

/**
 * What a press will change: the seat it names is hidden, shown again, or
 * taken off the list. Null for a press this form does not predict (moving a
 * seat, which has its own preview).
 */
export function expectSeatRowChange(input: PressedForm): RowChange<ManagedSeat>[] | null {
	const action = pressedAction(input.action);
	const seatId = pressedField(input.formData, 'seatId');

	if (action === '?/hideSeat') return [{ id: seatId, changes: { isAvailable: false } }];
	if (action === '?/showSeat') return [{ id: seatId, changes: { isAvailable: true } }];
	if (action === '?/deleteSeat') return [{ id: seatId, isDeleted: true }];

	return null;
}

/** What did not happen when a seat press failed, for its toast. */
export function describeSeatFailure(press: SeatPress): string {
	const action = pressedAction(press.action);

	if (action === '?/hideSeat') return 'The seat was not hidden.';
	if (action === '?/showSeat') return 'The seat was not shown again.';
	if (action === '?/deleteSeat') return 'The seat was not deleted.';

	return 'The seat was not saved.';
}
