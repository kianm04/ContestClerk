/**
 * What the delegation review page's three predictable actions change, worked
 * out in the browser so the seats and the decision move the moment a button
 * is pressed rather than waiting for the server (T142): "Accept and allocate"
 * (or "Allocate more") on the seat picker, "Remove" on one reserved seat, and
 * "Not accepted" on the decision.
 *
 * The page keeps one instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) for these three forms and draws itself with
 * `delegationReviewAfterPresses(rows, form.presses)`.
 *
 * Accepting also writes a new invoice, whose amount and number only the
 * server knows, so this file leaves invoices out of what it predicts; the
 * Invoices card only catches up once the page reads its data again, the same
 * choice `application-review-presses.ts` makes for the applicant's own
 * Accept. Saving the organisers' internal note keeps its own in-place
 * spinner: it is not one of the three actions above.
 */
import { committeeHeading } from '$lib/committees';
import type { AllocatableSeat, SeatGroup } from '$lib/allocation';
import { canAllocateToDelegation, rejectRefusal, reservedSeatCount } from '$lib/delegation-review';
import type { DelegationSeat, DelegationSeatGroup, DelegationStatus } from '$lib/delegations';
import type { InstantPress } from '$lib/instant-form.svelte';
import { pressedAction, type PressedForm } from '$lib/row-changes';

/** The seats and the decision, as the review page draws them. */
export type DelegationReviewRows = {
	status: DelegationStatus;
	seatGroups: DelegationSeatGroup[];
	freeSeatsByCommittee: SeatGroup[];
};

/** What a press of one of the three forms will leave the page showing. */
export type DelegationReviewChange = DelegationReviewRows;

/** One press of the page's three predictable forms, and the change it is expected to make. */
export type DelegationReviewPress = InstantPress<DelegationReviewChange>;

/**
 * A committee good enough to head a brand new group of reserved seats.
 *
 * The free seats a press picks from (`SeatGroup`) carry a committee's id and
 * its already-written heading, but not its abbreviation or level apart, so
 * there is not enough here to build a real `DelegationSeatCommittee`.
 * `abbreviation` is left null, which makes `committeeHeading` show `name`
 * instead — the same heading the free list already showed. `level` is never
 * read by this page, only by the delegate's own seats page, so the
 * placeholder changes nothing on screen; the real committee arrives once the
 * page reads its data again.
 */
function committeeFromFreeGroup(group: SeatGroup): DelegationSeatGroup['committee'] {
	return { id: group.committeeId, name: group.committeeLabel, abbreviation: null, level: 'none' };
}

/** The seat a delegation now holds, once `allocate_delegation_seats` has saved it. */
function toDelegationSeat(seat: AllocatableSeat): DelegationSeat {
	return { id: seat.id, name: seat.name, countryCode: seat.countryCode, holder: null };
}

/** The free seat a reserved one becomes again, once `remove_delegation_seat` has saved it. */
function toFreeSeat(seat: DelegationSeat, committeeId: string): AllocatableSeat {
	return {
		id: seat.id,
		committeeId,
		name: seat.name,
		countryCode: seat.countryCode,
		isAvailable: true,
		delegationId: null,
		userId: null
	};
}

/** `seatGroups` with one more seat reserved under `freeGroup`'s committee. */
function withReservedSeat(
	seatGroups: DelegationSeatGroup[],
	freeGroup: SeatGroup,
	seat: AllocatableSeat
): DelegationSeatGroup[] {
	// Already reserved: realtime brought in the saved change before this press
	// was answered, so laying it on again would only duplicate the seat.
	const isAlreadyReserved = seatGroups.some((group) =>
		group.seats.some((existing) => existing.id === seat.id)
	);
	if (isAlreadyReserved) return seatGroups;

	const groupIndex = seatGroups.findIndex((group) => group.committee.id === freeGroup.committeeId);

	if (groupIndex === -1) {
		const newGroup: DelegationSeatGroup = {
			committee: committeeFromFreeGroup(freeGroup),
			seats: [toDelegationSeat(seat)]
		};
		return [...seatGroups, newGroup];
	}

	return seatGroups.map((group, index) =>
		index === groupIndex ? { ...group, seats: [...group.seats, toDelegationSeat(seat)] } : group
	);
}

/** `freeSeatsByCommittee` with one more seat free again under `committee`. */
function withFreeSeat(
	freeSeatsByCommittee: SeatGroup[],
	committee: DelegationSeatGroup['committee'],
	seat: AllocatableSeat
): SeatGroup[] {
	const isAlreadyFree = freeSeatsByCommittee.some((group) =>
		group.seats.some((existing) => existing.id === seat.id)
	);
	if (isAlreadyFree) return freeSeatsByCommittee;

	const groupIndex = freeSeatsByCommittee.findIndex((group) => group.committeeId === committee.id);

	if (groupIndex === -1) {
		const newGroup: SeatGroup = {
			committeeId: committee.id,
			committeeLabel: committeeHeading(committee),
			seats: [seat]
		};
		return [...freeSeatsByCommittee, newGroup];
	}

	return freeSeatsByCommittee.map((group, index) =>
		index === groupIndex ? { ...group, seats: [...group.seats, seat] } : group
	);
}

/**
 * What "Accept and allocate" (or "Allocate more") will change, given the free
 * seats ticked and the rows as the page shows them at the moment of the
 * press. Null when the delegation may not be given seats, nothing was ticked,
 * or a ticked seat is not one of the free seats shown — the server's own
 * answer, or the next reload, settles those instead.
 */
function expectAllocateChange(
	input: PressedForm,
	rows: DelegationReviewRows
): DelegationReviewChange | null {
	if (!canAllocateToDelegation(rows.status)) return null;

	const seatIds = input.formData.getAll('seatIds').map((value) => String(value));
	if (seatIds.length === 0) return null;

	const freeSeats = rows.freeSeatsByCommittee.flatMap((group) =>
		group.seats.map((seat) => ({ seat, group }))
	);
	const chosen = seatIds.map((seatId) =>
		freeSeats.find((candidate) => candidate.seat.id === seatId)
	);

	if (chosen.some((candidate) => candidate === undefined)) return null;

	const freeSeatsByCommittee = rows.freeSeatsByCommittee
		.map((group) => ({ ...group, seats: group.seats.filter((seat) => !seatIds.includes(seat.id)) }))
		.filter((group) => group.seats.length > 0);

	let seatGroups = rows.seatGroups;
	for (const candidate of chosen) {
		if (candidate) seatGroups = withReservedSeat(seatGroups, candidate.group, candidate.seat);
	}

	return {
		status: rows.status === 'submitted' ? 'accepted' : rows.status,
		seatGroups,
		freeSeatsByCommittee
	};
}

/**
 * What "Remove" on one reserved seat will change, given the seat named in the
 * address it posted to. Null for a seat somebody is already sitting in — the
 * server refuses that, in words this page shows once it answers — and for one
 * this page no longer lists, which another organiser has already removed.
 */
function expectRemoveSeatChange(
	input: PressedForm,
	rows: DelegationReviewRows
): DelegationReviewChange | null {
	const seatId = input.action.searchParams.get('seatId') ?? '';
	const found = rows.seatGroups
		.flatMap((group) => group.seats.map((seat) => ({ seat, group })))
		.find((candidate) => candidate.seat.id === seatId);

	if (!found || found.seat.holder !== null) return null;

	const seatGroups = rows.seatGroups
		.map((group) => ({ ...group, seats: group.seats.filter((seat) => seat.id !== seatId) }))
		.filter((group) => group.seats.length > 0);

	const freeSeatsByCommittee = withFreeSeat(
		rows.freeSeatsByCommittee,
		found.group.committee,
		toFreeSeat(found.seat, found.group.committee.id)
	);

	return { status: rows.status, seatGroups, freeSeatsByCommittee };
}

/**
 * What "Not accepted" will change: only the status, and only when the
 * delegation may still be turned down, the same rule `rejectRefusal` in
 * `$lib/delegation-review.ts` asks the server's own action for.
 */
function expectRejectChange(rows: DelegationReviewRows): DelegationReviewChange | null {
	if (rejectRefusal(rows.status, reservedSeatCount(rows.seatGroups)) !== null) return null;

	return { ...rows, status: 'rejected' };
}

/**
 * What a press of "Accept and allocate", "Remove" or "Not accepted" will
 * change, given the rows as the page shows them at the moment of the press.
 * Null for a press this file does not recognise, or one it cannot predict,
 * which the instant form then leaves unpredicted.
 */
export function expectDelegationReviewChange(
	input: PressedForm,
	rows: DelegationReviewRows
): DelegationReviewChange | null {
	const action = pressedAction(input.action);

	if (action === '?/allocate') return expectAllocateChange(input, rows);
	if (action === '?/removeSeat') return expectRemoveSeatChange(input, rows);
	if (action === '?/reject') return expectRejectChange(rows);

	return null;
}

/** `rows` with every press still on its way laid on top, oldest first. */
export function delegationReviewAfterPresses(
	rows: DelegationReviewRows,
	presses: DelegationReviewPress[]
): DelegationReviewRows {
	let shown = rows;

	for (const press of presses) {
		if (press.expected !== null) shown = press.expected;
	}

	return shown;
}

/** What did not happen when a press failed, for its toast. */
export function describeDelegationReviewFailure(press: DelegationReviewPress): string {
	const action = pressedAction(press.action);

	if (action === '?/allocate') return 'The seats were not allocated.';
	if (action === '?/removeSeat') return 'The seat was not removed.';
	if (action === '?/reject') return 'The delegation was not marked as not accepted.';

	return 'The delegation was not changed.';
}
