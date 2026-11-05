/**
 * What "Free the seat", "Make it available again" / "Hide the seat" and
 * "Move the delegate" on the organisers' allocation grid change, worked out
 * in the browser so a cell empties, hides or gets a new holder the moment the
 * button is pressed (T142).
 *
 * The page keeps one instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) for the three of them and draws its columns
 * with `allocationColumnsAfterPresses(data.columns, form.presses)`. Dragging a
 * delegate or a delegation onto a seat is a fourth way to reach `freeSeat`,
 * `moveDelegate`, `swapDelegates` and `assignDelegation`, but it already shows
 * its result the moment the organiser lets go, through the older `pendingDrop`
 * state in `AllocationBoard.svelte` and the helpers in `$lib/seat-drop.ts`, so
 * it is left as it is.
 *
 * Each change is described as a `RowChange<GridSeat>` from `$lib/row-changes.ts`:
 * the fields a seat will have once the server has saved it. `freeSeat` and
 * `moveDelegate` can touch two different columns, so a press's note is an
 * array of changes rather than one.
 */
import { canMoveInto, type GridSeat, type SeatColumn } from '$lib/allocation';
import {
	pressedAction,
	pressedField,
	rowsAfterPresses,
	type PressedForm,
	type RowChange,
	type RowPress
} from '$lib/row-changes';

/** One press of "Free the seat", the visibility line or "Move the delegate". */
export type AllocationPress = RowPress<GridSeat>;

/** The fields that empty when whoever was sitting in a seat leaves it. */
const NOBODY_IN_SEAT: Pick<
	GridSeat,
	| 'userId'
	| 'applicationId'
	| 'holderName'
	| 'holderAvatarPath'
	| 'holderCountryCode'
	| 'holderInstitution'
> = {
	userId: null,
	applicationId: null,
	holderName: null,
	holderAvatarPath: null,
	holderCountryCode: null,
	holderInstitution: null
};

/** One seat of `columns`, found by id, or `null` when the grid's filters are hiding it. */
function findGridSeat(columns: SeatColumn[], seatId: string): GridSeat | null {
	for (const column of columns) {
		const seat = column.seats.find((candidate) => candidate.id === seatId);

		if (seat) {
			return seat;
		}
	}

	return null;
}

/**
 * Which seat a press is about, the way `readSeatId` in `+page.server.ts` reads
 * it back on the server: a hidden `seatId` field first, which is what
 * `MoveSeatModal` sends, and otherwise the `?seat=` the free and hide panels
 * carry in their own address instead.
 */
function readPressedSeatId(input: PressedForm): string {
	const fromTheForm = pressedField(input.formData, 'seatId');

	if (fromTheForm !== '') {
		return fromTheForm;
	}

	return input.action.searchParams.get('seat') ?? '';
}

/**
 * What "Free the seat" will change, given the seats as the grid shows them at
 * the moment of the press. Null for a press of another action, one whose seat
 * the filters are hiding, or a seat that is already free — the server's own
 * refusal, or the next reload, settles that last one instead.
 *
 * A seat held both for a delegation and by one of its members only loses the
 * member: `freeSeat` in `$lib/server/allocation-grid.ts` calls `revoke_seat`
 * for that seat, which leaves `delegation_id` exactly where it was, and
 * `seatFreedFlash` in `$lib/allocation.ts` says the seat "stays reserved" for
 * exactly that reason.
 */
function expectFreeSeatChange(
	input: PressedForm,
	columns: SeatColumn[]
): RowChange<GridSeat>[] | null {
	if (pressedAction(input.action) !== '?/freeSeat') return null;

	const seatId = readPressedSeatId(input);
	const seat = findGridSeat(columns, seatId);

	if (seat === null) return null;

	const isAlreadyFree = seat.userId === null && seat.delegationId === null;
	if (isAlreadyFree) return null;

	const keepsTheDelegation = seat.userId !== null && seat.delegationId !== null;

	return [
		{
			id: seatId,
			changes: keepsTheDelegation
				? { ...NOBODY_IN_SEAT }
				: { ...NOBODY_IN_SEAT, delegationId: null, delegationName: null }
		}
	];
}

/**
 * What the visibility line ("Hide the seat" / "Make it available again")
 * will change, given the seats as the grid shows them right now. Null for a
 * press of another action, a seat the filters are hiding, or hiding a seat
 * somebody is still sitting in or that is still reserved — the same
 * `FREE_BEFORE_HIDING_REFUSAL` the server itself asks for, which the menu
 * never offers a button for in the first place.
 */
function expectToggleHiddenChange(
	input: PressedForm,
	columns: SeatColumn[]
): RowChange<GridSeat>[] | null {
	if (pressedAction(input.action) !== '?/toggleHidden') return null;

	const seatId = readPressedSeatId(input);
	const seat = findGridSeat(columns, seatId);

	if (seat === null) return null;

	const isHeld = seat.userId !== null || seat.delegationId !== null;
	if (seat.isAvailable && isHeld) return null;

	return [{ id: seatId, changes: { isAvailable: !seat.isAvailable } }];
}

/**
 * What "Move the delegate" will change: the seat they leave empties, and the
 * one they land in gets everything about them that travels with a move.
 * `delegation_id` stays put at both ends, exactly as `move_delegate` itself
 * leaves it, which is what lets a delegation's member move only within their
 * own delegation's seats.
 *
 * Null for a press of another action, one with nobody chosen to move into,
 * one the filters are hiding, or a target `canMoveInto` would already turn
 * down — the server asks the same question again and refuses in its own
 * words. A target the filters are hiding is not refused here: the move can
 * still be right, so only the seat being left is drawn until the reload
 * catches the rest up.
 */
function expectMoveDelegateChange(
	input: PressedForm,
	columns: SeatColumn[]
): RowChange<GridSeat>[] | null {
	if (pressedAction(input.action) !== '?/moveDelegate') return null;

	const seatId = readPressedSeatId(input);
	const toSeatId = pressedField(input.formData, 'toSeatId');
	if (toSeatId === '') return null;

	const seat = findGridSeat(columns, seatId);
	if (seat === null || seat.userId === null) return null;

	const toSeat = findGridSeat(columns, toSeatId);
	if (toSeat !== null && !canMoveInto(seat, toSeat)) return null;

	const holder = {
		userId: seat.userId,
		applicationId: seat.applicationId,
		holderName: seat.holderName,
		holderAvatarPath: seat.holderAvatarPath,
		holderCountryCode: seat.holderCountryCode,
		holderInstitution: seat.holderInstitution
	};

	const changes: RowChange<GridSeat>[] = [{ id: seatId, changes: { ...NOBODY_IN_SEAT } }];

	if (toSeat !== null) {
		changes.push({ id: toSeatId, changes: holder });
	}

	return changes;
}

/**
 * What a press of "Free the seat", the visibility line or "Move the
 * delegate" will change, given the seats as the grid shows them at the
 * moment of the press. Null for a press this file does not recognise or
 * cannot predict, which the instant form then leaves unpredicted.
 */
export function expectAllocationChange(
	input: PressedForm,
	columns: SeatColumn[]
): RowChange<GridSeat>[] | null {
	return (
		expectFreeSeatChange(input, columns) ??
		expectToggleHiddenChange(input, columns) ??
		expectMoveDelegateChange(input, columns)
	);
}

/**
 * `columns` with every press still on its way laid on top, oldest first. Only
 * the seats themselves change; the counts in each heading and the four
 * numbers along the top of the page are left for the next reload, because
 * working those out again would need every seat of the conference and not
 * only the ones the filters are showing. `rowsAfterPresses` (`$lib/row-changes.ts`)
 * is asked once per column: a change naming a seat that is not in that column
 * is simply left out, which is what lets one move touch two columns at once.
 */
export function allocationColumnsAfterPresses(
	columns: SeatColumn[],
	presses: AllocationPress[]
): SeatColumn[] {
	return columns.map((column) => ({ ...column, seats: rowsAfterPresses(column.seats, presses) }));
}

/** What did not happen when a press failed, for its toast. */
export function describeAllocationFailure(press: AllocationPress): string {
	const action = pressedAction(press.action);

	if (action === '?/freeSeat') return 'The seat was not freed.';
	if (action === '?/moveDelegate') return 'The delegate was not moved.';

	if (action === '?/toggleHidden') {
		// The change itself says which way the press was going; a press this
		// file could not predict falls back to the plainer of the two sentences.
		const change = press.expected?.[0];
		const isHiding = change?.changes?.isAvailable === false;

		return isHiding ? 'The seat was not hidden.' : 'The seat was not made available again.';
	}

	return 'The seat was not changed.';
}
