/**
 * What "Assign" and "Unassign" on a delegation's Seats page change, worked out
 * in the browser so the seat fills or empties the moment it is pressed (T142).
 *
 * The page keeps one instant form (`createInstantForm` in
 * `$lib/instant-form.svelte.ts`) for every seat. Each press keeps who the seat
 * will hold as a `SeatAssignment`, and the page draws its seats and its
 * members without a seat with those laid on top (`seatsAfterPresses`).
 */
import type { InstantPress } from '$lib/instant-form.svelte';
import {
	memberFieldName,
	type DelegationSeatGroup,
	type DelegationSeatHolder,
	type UnseatedMember
} from '$lib/delegations';
import { pressedAction, pressedField, type PressedForm } from '$lib/row-changes';

/** Who one seat will hold once a press is saved: `null` for nobody. */
export type SeatAssignment = {
	seatId: string;
	holder: DelegationSeatHolder | null;
};

/** One press on the Seats page and what it will change. */
export type DelegationSeatPress = InstantPress<SeatAssignment>;

/** The seats and the members without one, as the page draws them. */
export type SeatsPageRows = {
	groups: DelegationSeatGroup[];
	unseatedMembers: UnseatedMember[];
};

/**
 * What a press will change, given the members without a seat on screen when
 * it was made, or null when it cannot tell (nobody was chosen). "Unassign"
 * posts to an address carrying the seat (`unassignDelegationSeatUrl`).
 */
export function expectSeatPress(
	input: PressedForm,
	unseatedMembers: UnseatedMember[]
): SeatAssignment | null {
	const action = pressedAction(input.action);

	if (action === '?/unassign') {
		const seatId = input.action.searchParams.get('seat') ?? '';
		return { seatId, holder: null };
	}

	if (action !== '?/assign') return null;

	const seatId = pressedField(input.formData, 'seatId');
	const userId = pressedField(input.formData, memberFieldName(seatId));
	const member = unseatedMembers.find((candidate) => candidate.userId === userId);

	if (!member) return null;

	return { seatId, holder: { ...member } };
}

/** The member a holder becomes again once the seat is emptied, or null for a gone account. */
function asUnseatedMember(holder: DelegationSeatHolder): UnseatedMember | null {
	if (holder.experienceLevel === null) return null;

	return {
		userId: holder.userId,
		fullName: holder.fullName,
		avatarPath: holder.avatarPath,
		experienceLevel: holder.experienceLevel
	};
}

/** `rows` with one assignment laid on top. A seat that is not there is left alone. */
function withAssignment(rows: SeatsPageRows, assignment: SeatAssignment): SeatsPageRows {
	const seat = rows.groups
		.flatMap((group) => group.seats)
		.find((candidate) => candidate.id === assignment.seatId);

	if (!seat) return rows;

	let unseatedMembers = rows.unseatedMembers;
	const newHolder = assignment.holder;
	const oldHolder = seat.holder;

	if (newHolder !== null) {
		unseatedMembers = unseatedMembers.filter((member) => member.userId !== newHolder.userId);
	}

	// The one who leaves the seat is back among those without one, unless the
	// saved list already has them there.
	const returning = oldHolder === null ? null : asUnseatedMember(oldHolder);
	const isListed = unseatedMembers.some((member) => member.userId === returning?.userId);

	if (returning !== null && returning.userId !== newHolder?.userId && !isListed) {
		unseatedMembers = [...unseatedMembers, returning];
	}

	const groups = rows.groups.map((group) => ({
		...group,
		seats: group.seats.map((candidate) =>
			candidate.id === assignment.seatId ? { ...candidate, holder: newHolder } : candidate
		)
	}));

	return { groups, unseatedMembers };
}

/**
 * The seats and the members without one with every press still on its way
 * laid on top, oldest first. Laid over rows that already hold a press, it
 * changes nothing.
 */
export function seatsAfterPresses(
	rows: SeatsPageRows,
	presses: DelegationSeatPress[]
): SeatsPageRows {
	let shown = rows;

	for (const press of presses) {
		if (press.expected !== null) shown = withAssignment(shown, press.expected);
	}

	return shown;
}

/** What did not happen when a press failed, for its toast. */
export function describeSeatFailure(press: DelegationSeatPress): string {
	const holder = press.expected?.holder;

	if (pressedAction(press.action) === '?/unassign') return 'The seat was not emptied.';

	return holder ? `${holder.fullName} was not given the seat.` : 'The seat was not assigned.';
}
