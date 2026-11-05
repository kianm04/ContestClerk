/**
 * What state a seat is in, and which free seats to offer an organiser who is
 * accepting an application.
 *
 * The rules come from `specs/06-features/allocation.md`. They live here rather
 * than beside the queries so that they can be read and tested without a
 * database, and so that "free" is written down once: `listFreeSeats` in
 * `$lib/server/seat-acceptance.ts` asks `seatState` the same question the seat-choosing
 * panel does.
 *
 * Both the server and the browser import this file, so it must not contain
 * anything server-only. Nothing here talks to Supabase or to Svelte.
 *
 * The allocation grid at `/manage/[slug]/allocation` is what reads the
 * counting and query helpers in the second half of this file: it counts the
 * seats of a whole conference, keeps its filters in the address and words the
 * answers its three actions give.
 */

import type { CommitteeChoice } from '$lib/applications';
import { committeeHeading } from '$lib/committees';

/** Where a seat stands. */
export type SeatState = 'hidden' | 'filled' | 'reserved' | 'free';

/** One seat as allocation asks about it. */
export type AllocatableSeat = {
	id: string;
	committeeId: string;
	name: string;
	/** Two letters for a flag, or null. */
	countryCode: string | null;
	/** false when the organisers are not offering this seat this year. */
	isAvailable: boolean;
	/** The delegation holding the seat, or null. */
	delegationId: string | null;
	/** The delegate sitting in it, or null. */
	userId: string | null;
};

/**
 * Which of the four states this seat is in.
 *
 * The order of the questions matters. `hidden` is asked first because a seat
 * nobody may take is not one to offer, whoever is in it: an organiser can hide
 * a seat that already has a delegate in it, and the answer for that seat is
 * `hidden` rather than `filled`. After that a seat with somebody in it is
 * `filled` even though it also has a delegation, because a delegation's seat
 * stops being merely reserved the moment the delegation names somebody.
 */
export function seatState(seat: AllocatableSeat): SeatState {
	if (!seat.isAvailable) {
		return 'hidden';
	}

	if (seat.userId !== null) {
		return 'filled';
	}

	if (seat.delegationId !== null) {
		return 'reserved';
	}

	return 'free';
}

/** The free seats of one committee, as one group of a dropdown. */
export type SeatGroup = {
	committeeId: string;
	/** What the group is called, from `committeeHeading` in `$lib/committees`. */
	committeeLabel: string;
	seats: AllocatableSeat[];
};

/**
 * The committees with the applicant's preferred ones first, in the order the
 * applicant asked for them, and every other committee after them in the order
 * they were given in.
 *
 * A preference naming a committee that is not in the list is skipped rather
 * than being an error: an organiser can delete a committee after somebody has
 * applied to it, and the application keeps the id it was written with. The
 * same committee asked for twice is kept only the first time, so it cannot
 * appear in two places at once.
 */
function orderCommitteesByPreference(
	committeePreferences: string[],
	committees: CommitteeChoice[]
): CommitteeChoice[] {
	const preferredCommittees: CommitteeChoice[] = [];
	const preferredIds = new Set<string>();

	for (const committeeId of committeePreferences) {
		const committee = committees.find((candidate) => candidate.id === committeeId);

		if (committee !== undefined && !preferredIds.has(committee.id)) {
			preferredCommittees.push(committee);
			preferredIds.add(committee.id);
		}
	}

	const otherCommittees = committees.filter((committee) => !preferredIds.has(committee.id));

	return [...preferredCommittees, ...otherCommittees];
}

/**
 * Free seats grouped by committee, the applicant's preferred committees first
 * in their own order and every other committee after them in the order given.
 *
 * Only seats `seatState` calls `free` are offered, so a hidden, filled or
 * reserved seat is never in the answer. A committee with no free seat left is
 * left out altogether rather than appearing as an empty group, because an
 * empty group in a dropdown is a heading the organiser cannot choose anything
 * under.
 *
 * `committeePreferences` is the applicant's `committee_preferences` column:
 * committee ids in the order they asked for them, and possibly empty for
 * somebody who asked for no committee in particular. Then every committee is
 * offered in the order it was given in.
 */
export function suggestSeats(
	committeePreferences: string[],
	committees: CommitteeChoice[],
	seats: AllocatableSeat[]
): SeatGroup[] {
	const freeSeats = seats.filter((seat) => seatState(seat) === 'free');
	const orderedCommittees = orderCommitteesByPreference(committeePreferences, committees);

	return groupSeatsByCommittee(orderedCommittees, freeSeats);
}

/**
 * Seats grouped by committee, in the order the committees were given in.
 *
 * A committee none of these seats belongs to is left out altogether rather than
 * appearing as an empty group, because an empty group in a dropdown is a
 * heading the organiser cannot choose anything under. `suggestSeats` above
 * offers the free seats of an application this way and `seatsAvailableFor`
 * below offers the seats a delegate may be moved into, so the shape and that
 * rule are written here once.
 */
function groupSeatsByCommittee(
	committees: CommitteeChoice[],
	seats: AllocatableSeat[]
): SeatGroup[] {
	const groups: SeatGroup[] = [];

	for (const committee of committees) {
		const committeeSeats = seats.filter((seat) => seat.committeeId === committee.id);

		if (committeeSeats.length > 0) {
			groups.push({
				committeeId: committee.id,
				committeeLabel: committeeHeading(committee),
				seats: committeeSeats
			});
		}
	}

	return groups;
}

/*
 * Everything below belongs to the allocation grid, `/manage/[slug]/allocation`:
 * the seats as that page draws them, the filters it keeps in the address, the
 * counts along its top, the columns it is made of and the sentences its three
 * actions answer with.
 */

/** One seat as the allocation grid draws it. */
export type GridSeat = AllocatableSeat & {
	/**
	 * The committee the seat is in, so a column can name itself without a
	 * lookup. `committee.id` is the same value as the `committeeId` above it,
	 * which `AllocatableSeat` already carries; whoever fills a `GridSeat` in
	 * must take both from the same row.
	 */
	committee: CommitteeChoice;
	/** The delegate's `profiles.full_name`, or null when nobody is in the seat. */
	holderName: string | null;
	holderAvatarPath: string | null;
	holderCountryCode: string | null;
	/** The school or university on the delegate's profile, or null. */
	holderInstitution: string | null;
	/** The delegation the seat is reserved for, or null. */
	delegationName: string | null;
	/** The individual application that won the seat, or null. */
	applicationId: string | null;
};

/** Which panel the address opens over the grid. */
export type SeatAction = 'move' | 'free' | 'hide';

/** The filters and the open panel, all of which travel in the address. */
export type AllocationQuery = {
	/** A committee id, or '' for every committee. */
	committee: string;
	/** One of the four seat states, or '' for every state. */
	state: SeatState | '';
	/** What was typed into the search box: a delegate, delegation, seat or committee name. */
	q: string;
	/** The seat id a panel is open for, or '' when none is open. */
	seat: string;
	/** Which panel is open, or '' when none is. */
	action: SeatAction | '';
};

/** The grid as it opens: every committee, every state, nothing searched for, no panel. */
export const EMPTY_ALLOCATION_QUERY: AllocationQuery = {
	committee: '',
	state: '',
	q: '',
	seat: '',
	action: ''
};

/** The four states the grid can be filtered by, so that a typed-in one can be checked. */
const FILTERABLE_SEAT_STATES: SeatState[] = ['free', 'reserved', 'filled', 'hidden'];

/** The three panels the grid can open over itself, checked the same way. */
const OPENABLE_SEAT_ACTIONS: SeatAction[] = ['move', 'free', 'hide'];

/** Anyone can type anything into the URL, so ignore anything that is not one of the four states. */
function readSeatState(value: string | null): SeatState | '' {
	const state = value?.trim() ?? '';
	const knownState = FILTERABLE_SEAT_STATES.find((candidate) => candidate === state);

	return knownState ?? '';
}

/** Anyone can type anything into the URL, so ignore anything that is not one of the three panels. */
function readSeatAction(value: string | null): SeatAction | '' {
	const action = value?.trim() ?? '';
	const knownAction = OPENABLE_SEAT_ACTIONS.find((candidate) => candidate === action);

	return knownAction ?? '';
}

/**
 * Read the grid's filters out of the address. An unknown `state` or `action`
 * falls back to '' rather than being an error, because anybody can type one.
 *
 * It takes the parameters rather than the whole URL, so that the filter form
 * can read its own values back through this same function, the way
 * `parseApplicationListQuery` in `$lib/applications.ts` does. The committee and
 * the seat are the two that are not checked against anything, because this file
 * knows neither: an id from somewhere else simply matches no seat.
 */
export function parseAllocationQuery(params: URLSearchParams): AllocationQuery {
	return {
		committee: params.get('committee')?.trim() ?? '',
		state: readSeatState(params.get('state')),
		q: params.get('q')?.trim() ?? '',
		seat: params.get('seat')?.trim() ?? '',
		action: readSeatAction(params.get('action'))
	};
}

/** How many seats are in each state, and how many there are altogether. */
export type AllocationSummary = {
	total: number;
	free: number;
	reserved: number;
	filled: number;
	hidden: number;
};

/**
 * Counts the seats by state, for the line along the top of the grid.
 *
 * `total` is always free + reserved + filled + hidden, because `seatState`
 * gives every seat exactly one of the four answers. The counts are of every
 * seat of the conference rather than of the filtered ones, so that the line
 * does not move while the organiser is typing in the search box.
 */
export function allocationSummary(seats: AllocatableSeat[]): AllocationSummary {
	const states = seats.map((seat) => seatState(seat));

	return {
		total: seats.length,
		free: states.filter((state) => state === 'free').length,
		reserved: states.filter((state) => state === 'reserved').length,
		filled: states.filter((state) => state === 'filled').length,
		hidden: states.filter((state) => state === 'hidden').length
	};
}

/**
 * Whether the words typed into the search box appear anywhere on this seat.
 *
 * Five things are searched, because all five are on the cell the organiser is
 * looking at: the seat's own name, whoever is in it, the delegation holding it,
 * and the committee's full and short names. A missing one — a seat nobody is in
 * has no holder — is simply not a match.
 */
function seatMatchesSearch(seat: GridSeat, searchText: string): boolean {
	const wanted = searchText.toLowerCase();
	const searchableNames = [
		seat.name,
		seat.holderName,
		seat.delegationName,
		seat.committee.name,
		seat.committee.abbreviation
	];

	return searchableNames.some((name) => name !== null && name.toLowerCase().includes(wanted));
}

/**
 * Whether this seat survives the committee, state and search filters.
 *
 * A part of the query that was left empty matches everything, so the grid with
 * nothing filtered keeps every seat.
 */
export function matchesAllocationQuery(seat: GridSeat, query: AllocationQuery): boolean {
	if (query.committee !== '' && seat.committee.id !== query.committee) {
		return false;
	}

	if (query.state !== '' && seatState(seat) !== query.state) {
		return false;
	}

	if (query.q === '') {
		return true;
	}

	return seatMatchesSearch(seat, query.q);
}

/** One column of the grid: one committee and the seats the filters left in it. */
export type SeatColumn = {
	committee: CommitteeChoice;
	/** Only the seats that matched the filters. */
	seats: GridSeat[];
	/** Every seat of this committee, filters or no filters. */
	totalCount: number;
	/** How many of those are filled. */
	filledCount: number;
};

/**
 * One column per committee, in the order the committees were given in.
 *
 * A committee with no seats at all still gets a column, unlike the groups
 * `groupSeatsByCommittee` above builds: the grid prints "No seats." inside it,
 * which is how an organiser finds out that a committee still needs some. Only
 * the committee filter takes a column away, because that is the filter that
 * says which committees to look at.
 *
 * `totalCount` and `filledCount` count every seat of the committee rather than
 * the filtered ones, so that the heading stays still while the organiser types
 * in the search box.
 */
export function buildSeatColumns(
	committees: CommitteeChoice[],
	seats: GridSeat[],
	query: AllocationQuery
): SeatColumn[] {
	const shownCommittees =
		query.committee === ''
			? committees
			: committees.filter((committee) => committee.id === query.committee);
	const columns: SeatColumn[] = [];

	for (const committee of shownCommittees) {
		const committeeSeats = seats.filter((seat) => seat.committee.id === committee.id);
		const matchingSeats = committeeSeats.filter((seat) => matchesAllocationQuery(seat, query));
		const filledSeats = committeeSeats.filter((seat) => seatState(seat) === 'filled');

		columns.push({
			committee,
			seats: matchingSeats,
			totalCount: committeeSeats.length,
			filledCount: filledSeats.length
		});
	}

	return columns;
}

/** "UNSC" — a column's heading. The line beside it does the counting. */
export function seatColumnHeading(column: SeatColumn): string {
	return committeeHeading(column.committee);
}

/**
 * "9 of 15 filled" — the quiet line beside the heading, counting every seat
 * and not only the shown ones.
 */
export function seatColumnCounts(column: SeatColumn): string {
	return `${column.filledCount} of ${column.totalCount} filled`;
}

/**
 * May the delegate sitting in `seat` be moved into `candidate`?
 *
 * The two answers are different, and the reason is in the database.
 * `move_delegate` moves `user_id` and `application_id` to the new seat and
 * leaves `delegation_id` exactly where it is. So moving a delegation's member
 * into a free seat that no delegation holds would quietly take a seat away from
 * the delegation: they would end up with one seat fewer than they were
 * allocated, and nothing would say so.
 *
 * A member of a delegation may therefore only move into another seat of that
 * same delegation — one with nobody in it, that the organisers are still
 * offering, and not the seat they are sitting in already. Somebody who got
 * their seat through an application of their own holds nothing for anybody, and
 * may move into any free seat.
 */
export function canMoveInto(seat: GridSeat, candidate: GridSeat): boolean {
	if (seat.delegationId === null) {
		return seatState(candidate) === 'free';
	}

	const isSameDelegation = candidate.delegationId === seat.delegationId;
	const isEmpty = candidate.userId === null;
	const isThisSeat = candidate.id === seat.id;

	return isSameDelegation && isEmpty && candidate.isAvailable && !isThisSeat;
}

/**
 * May the delegates sitting in `seat` and in `candidate` trade places?
 *
 * Both seats need somebody in them, and they have to be held the same way:
 * both through an application of their own, or both for the same delegation.
 * `swap_delegates` leaves each seat's `delegation_id` where it is, exactly as
 * `move_delegate` does, so trading a delegation's member with anybody else
 * would quietly move a seat out of the delegation. That is `canMoveInto`'s
 * rule again, asked of both people at once. A hidden seat never has anybody
 * in it (`06-features/allocation.md`), so it needs no question of its own.
 */
export function canSwapWith(seat: GridSeat, candidate: GridSeat): boolean {
	const areBothFilled = seat.userId !== null && candidate.userId !== null;
	const isSameHolding = seat.delegationId === candidate.delegationId;
	const isThisSeat = candidate.id === seat.id;

	return areBothFilled && isSameHolding && !isThisSeat;
}

/**
 * Every seat the delegate in this one may be moved to, grouped by committee.
 *
 * This is the picker's half of `canMoveInto`: it only ever offers seats that
 * function allows. The action behind the picker asks `canMoveInto` again about
 * the one that was chosen, because a form can be posted with any seat id in it.
 */
export function seatsAvailableFor(
	seat: GridSeat,
	committees: CommitteeChoice[],
	seats: GridSeat[]
): SeatGroup[] {
	const allowedSeats = seats.filter((candidate) => canMoveInto(seat, candidate));

	return groupSeatsByCommittee(committees, allowedSeats);
}

/**
 * What the organiser is told after a seat is freed.
 *
 * The order of the questions follows what freeing actually did, which is
 * different in each case: unassigning a delegation's member leaves the seat
 * reserved for the delegation, freeing an individual's seat turns their
 * application down and either voids their invoice or leaves a paid one alone,
 * and freeing an empty reserved seat gives it back to the conference. A seat
 * that was already free is refused with `ALREADY_FREE_REFUSAL` before anything
 * is freed, so there is no fifth sentence for one.
 *
 * `hasPaidInvoice` is `null` for a reader who may not read invoices: they are
 * told the seat is free and nothing about the money.
 */
export function seatFreedFlash(seat: GridSeat, hasPaidInvoice: boolean | null): string {
	const hasHolder = seat.userId !== null;
	const isDelegationSeat = seat.delegationId !== null;

	if (isDelegationSeat && hasHolder) {
		if (seat.delegationName === null) {
			return 'The member was unassigned; the seat stays reserved.';
		}

		return `Member unassigned; the seat stays reserved for ${seat.delegationName}.`;
	}

	if (hasHolder) {
		if (hasPaidInvoice === null) {
			return 'Seat freed.';
		}

		if (hasPaidInvoice) {
			return 'Seat freed. The paid invoice is untouched, so refund it on the fees page if you mean to.';
		}

		return 'Seat freed and the unpaid invoice voided.';
	}

	if (seat.delegationName === null) {
		return 'The seat is no longer reserved.';
	}

	return `The seat is no longer reserved for ${seat.delegationName}.`;
}

/** "Anna Kowalski moved to Brazil in ECOFIN." */
export function delegateMovedFlash(holderName: string, toSeat: GridSeat): string {
	return `${holderName} moved to ${toSeat.name} in ${committeeHeading(toSeat.committee)}.`;
}

/** "Anna Kowalski and Ben Lee swapped seats." */
export function delegatesSwappedFlash(firstName: string, secondName: string): string {
	return `${firstName} and ${secondName} swapped seats.`;
}

/** "Seat hidden." / "Seat available again." */
export function seatVisibilityFlash(isNowAvailable: boolean): string {
	if (isNowAvailable) {
		return 'Seat available again.';
	}

	return 'Seat hidden.';
}

/*
 * The sentences the grid's actions refuse with. They are written here
 * rather than in the page so that the action and the test of that action spell
 * them the same way; `05-pages/organiser/allocation.md` is where the wording
 * comes from.
 */

/** `freeSeat` on a seat that has nobody in it and is held for nobody. */
export const ALREADY_FREE_REFUSAL = 'This seat is already free.';

/** `moveDelegate` from a seat with no `user_id`. */
export const NOBODY_TO_MOVE_REFUSAL = 'There is nobody in this seat to move.';

/** `moveDelegate` into a seat somebody took while the page was open. */
export const SEAT_TAKEN_REFUSAL = 'That seat was just taken.';

/** `toggleHidden` on a seat that is reserved or filled. */
export const FREE_BEFORE_HIDING_REFUSAL = 'Free the seat before hiding it.';

/**
 * `freeSeat` when a delegation head has put somebody into the seat since the
 * grid was drawn. Freeing it would then take a seat off a person rather than
 * off a delegation, which is a different decision, so the organiser is sent
 * back to look at it.
 */
export const SEAT_JUST_FILLED_REFUSAL =
	'Somebody has just been put in this seat. Look at the grid again.';

/** `moveDelegate` into a seat the picker never offered. `canMoveInto` says which those are. */
export const SEAT_NOT_OFFERED_REFUSAL =
	'A member of a delegation can only move into another seat held for that delegation.';

/**
 * `swapDelegates` between a delegation's member and somebody holding their
 * seat another way. `canSwapWith` says which pairs those are.
 */
export const SWAP_NOT_OFFERED_REFUSAL =
	'Only two individual delegates, or two members of the same delegation, can swap seats.';

/** `swapDelegates` when one of the two seats has been emptied since the grid was drawn. */
export const NOBODY_TO_SWAP_REFUSAL = 'One of those seats is empty now. Look at the grid again.';

/**
 * `assignDelegation` for a delegation that is no longer accepted or waiting,
 * or no longer part of this conference's list at all.
 */
export const DELEGATION_NOT_TAKING_SEATS_REFUSAL = 'That delegation is no longer taking seats.';
