/**
 * What dragging on the allocation grid does, worked out without any Svelte
 * (T131). The grid's components ask this module what a drop would do and draw
 * the result; the page's actions do the real work on the server.
 *
 * Three drops mean something:
 *
 * - a seat's delegate onto a seat `canMoveInto` allows: **move**, the grid's
 *   `moveDelegate` action;
 * - a seat's delegate onto another filled seat `canSwapWith` allows: **swap**,
 *   the `swapDelegates` action, after the organiser confirms;
 * - a delegation from the tray onto a free seat: **assign**, the
 *   `assignDelegation` action, which reserves that one seat for it.
 *
 * Every other drop is nothing at all, and the seat is not lit up as a target.
 */
import {
	canMoveInto,
	canSwapWith,
	seatState,
	type GridSeat,
	type SeatColumn
} from '$lib/allocation';
import { committeeHeading } from '$lib/committees';

/** An accepted delegation in the tray: one that has fewer seats than it asked for. */
export type TrayDelegation = {
	id: string;
	name: string;
	/** The delegation's flag, or null when it has none. */
	countryCode: string | null;
	requestedSeats: number;
	/** How many seats of this conference are held for it already. */
	allocatedSeats: number;
};

/** What the organiser has picked up: the delegate in a seat, or a delegation from the tray. */
export type SeatDragSource =
	{ kind: 'seat'; seat: GridSeat } | { kind: 'delegation'; delegation: TrayDelegation };

/** What a drop does, which is also the name of the part of the action it posts to. */
export type SeatDropKind = 'move' | 'swap' | 'assign';

/** A drop the organiser has made, while it is being confirmed or saved. */
export type PendingSeatDrop = {
	kind: SeatDropKind;
	source: SeatDragSource;
	target: GridSeat;
};

/** The id of the hidden form a drop is saved through, which the swap dialog's button also sends. */
export const SEAT_DROP_FORM_ID = 'seat-drop-form';

/** The form action each kind of drop posts to, in `+page.server.ts`. */
export const SEAT_DROP_ACTIONS: Record<SeatDropKind, string> = {
	move: 'moveDelegate',
	swap: 'swapDelegates',
	assign: 'assignDelegation'
};

/** What dropping `source` on `target` would do, or `null` when it would do nothing. */
export function seatDropKind(source: SeatDragSource, target: GridSeat): SeatDropKind | null {
	if (source.kind === 'delegation') {
		return seatState(target) === 'free' ? 'assign' : null;
	}

	if (canMoveInto(source.seat, target)) {
		return 'move';
	}

	if (canSwapWith(source.seat, target)) {
		return 'swap';
	}

	return null;
}

/** The name the dragged chip shows: the delegate's, or the delegation's. */
export function dragSourceName(source: SeatDragSource): string {
	if (source.kind === 'delegation') {
		return source.delegation.name;
	}

	return source.seat.holderName ?? 'Delegate';
}

/** "SC · France": where a seat is, in the words the flashes use. */
function seatLabel(seat: GridSeat): string {
	return `${committeeHeading(seat.committee)} · ${seat.name}`;
}

/**
 * The sentence the swap dialog asks, such as "Ana Silva moves to HRC · Japan,
 * and Beatriz Costa moves to SC · France."
 */
export function swapSentence(first: GridSeat, second: GridSeat): string {
	const firstName = first.holderName ?? 'The delegate';
	const secondName = second.holderName ?? 'the delegate';

	return `${firstName} moves to ${seatLabel(second)}, and ${secondName} moves to ${seatLabel(first)}.`;
}

/** The fields of a seat that belong to the person in it, and so travel with them. */
type Holder = Pick<
	GridSeat,
	| 'userId'
	| 'applicationId'
	| 'holderName'
	| 'holderAvatarPath'
	| 'holderCountryCode'
	| 'holderInstitution'
>;

const NOBODY: Holder = {
	userId: null,
	applicationId: null,
	holderName: null,
	holderAvatarPath: null,
	holderCountryCode: null,
	holderInstitution: null
};

function holderOf(seat: GridSeat): Holder {
	return {
		userId: seat.userId,
		applicationId: seat.applicationId,
		holderName: seat.holderName,
		holderAvatarPath: seat.holderAvatarPath,
		holderCountryCode: seat.holderCountryCode,
		holderInstitution: seat.holderInstitution
	};
}

/**
 * The seat as it will be once the drop is saved. The seat's own
 * `delegationId` stays put in a move and a swap, as it does in the database.
 */
function seatAfterDrop(seat: GridSeat, drop: PendingSeatDrop): GridSeat {
	const source = drop.source;

	if (source.kind === 'delegation') {
		if (seat.id !== drop.target.id) return seat;

		return { ...seat, delegationId: source.delegation.id, delegationName: source.delegation.name };
	}

	if (seat.id === drop.target.id) {
		return { ...seat, ...holderOf(source.seat) };
	}

	if (seat.id !== source.seat.id) return seat;

	// The seat the delegate left: empty after a move, the other person's after a swap.
	const holderLeftBehind = drop.kind === 'swap' ? holderOf(drop.target) : NOBODY;

	return { ...seat, ...holderLeftBehind };
}

/**
 * The grid as it will look once `drop` is saved, drawn the moment the
 * organiser lets go so they do not wait for the server. `null` is no drop,
 * and the columns come back as they are.
 *
 * A move between two committees also moves one "filled" from one heading's
 * count to the other's.
 */
export function showPendingDrop(columns: SeatColumn[], drop: PendingSeatDrop | null): SeatColumn[] {
	if (drop === null) return columns;

	return columns.map((column) => {
		const seats = column.seats.map((seat) => seatAfterDrop(seat, drop));

		if (drop.kind !== 'move' || drop.source.kind !== 'seat') {
			return { ...column, seats };
		}

		const leavesThisCommittee = drop.source.seat.committee.id === column.committee.id;
		const joinsThisCommittee = drop.target.committee.id === column.committee.id;
		const change = Number(joinsThisCommittee) - Number(leavesThisCommittee);

		return { ...column, seats, filledCount: column.filledCount + change };
	});
}

/** The tray as it will look once `drop` is saved: one more seat for the delegation assigned one. */
export function showPendingTray(
	delegations: TrayDelegation[],
	drop: PendingSeatDrop | null
): TrayDelegation[] {
	if (drop === null || drop.source.kind !== 'delegation') return delegations;

	const assignedId = drop.source.delegation.id;

	return delegations.map((delegation) => {
		if (delegation.id !== assignedId) return delegation;

		return { ...delegation, allocatedSeats: delegation.allocatedSeats + 1 };
	});
}
