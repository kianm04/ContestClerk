/**
 * The words and the seat table layout of the organiser's committee editor,
 * `/manage/[slug]/committees/[committeeId]`, as the manage redesign draws it:
 * the line under the committee's name, and one row per seat with its kind and
 * who holds it.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */
import { countedWord } from '$lib/committee-list';
import type { Committee, ManagedSeat, ManagedSeatCounts, SeatKind } from '$lib/committees';

/**
 * The columns of the seat table from `sm` up, shared by the heading row and
 * every seat row so that they line up: the drag handle and arrows, then the
 * seat, its kind, who holds it and its buttons. Below `sm` each row stacks its
 * facts under the seat's name instead.
 *
 * Written out in full, because Tailwind reads class names out of this file.
 */
export const SEAT_COLUMNS_CLASS =
	'sm:grid-cols-[5.75rem_minmax(0,1.4fr)_6.5rem_minmax(0,1fr)_7.5rem]';

/**
 * The four `seat_kind` values, in the order the "Kind" dropdown offers them.
 * Typing the list as `SeatKind` is what stops the form offering a kind the
 * database has never heard of.
 */
export const SEAT_KIND_OPTIONS: { value: SeatKind; label: string }[] = [
	{ value: 'country', label: 'Country' },
	{ value: 'character', label: 'Character' },
	{ value: 'observer', label: 'Observer' },
	{ value: 'other', label: 'Other' }
];

/** The word for a kind of seat, "Country" for `country`, from the list above. */
export function seatKindLabel(kind: SeatKind): string {
	const option = SEAT_KIND_OPTIONS.find((candidate) => candidate.value === kind);

	return option?.label ?? kind;
}

/**
 * The line under the editor's title: "HRC · 4 seats · 1 chair". A committee
 * without a short name starts at the seats.
 */
export function committeeEditorSummary(
	committee: Pick<Committee, 'abbreviation'>,
	seatCount: number,
	chairCount: number
): string {
	const parts: string[] = [];

	if (committee.abbreviation) {
		parts.push(committee.abbreviation);
	}

	parts.push(countedWord(seatCount, 'seat'));
	parts.push(countedWord(chairCount, 'chair'));

	return parts.join(' · ');
}

/** The count over the seat table: "4 seats · 1 filled". */
export function seatCountsLine(counts: Pick<ManagedSeatCounts, 'total' | 'filled'>): string {
	return `${countedWord(counts.total, 'seat')} · ${counts.filled} filled`;
}

/**
 * Whether the seat is still the organiser's to hide or delete: nobody is in
 * it and no delegation holds it. Freeing a taken seat is the allocation
 * page's work.
 */
export function isSeatFree(seat: Pick<ManagedSeat, 'isFilled' | 'isReserved'>): boolean {
	return !seat.isFilled && !seat.isReserved;
}

/**
 * The "Held by" cell of a seat row: the delegate's name, the delegation it is
 * reserved for, "Hidden" for a seat no delegate can be put in, or "Free".
 *
 * It asks `isFilled` and `isReserved` rather than the two names, because a
 * seat can be held by somebody whose profile could not be read, and that is
 * still a seat nobody else can have. A hidden seat is always free, since the
 * page refuses to hide a taken one.
 */
export function seatHolder(
	seat: Pick<
		ManagedSeat,
		'isAvailable' | 'isFilled' | 'isReserved' | 'holderName' | 'delegationName'
	>
): string {
	if (seat.isFilled) {
		return seat.holderName ?? 'A delegate';
	}

	if (seat.isReserved) {
		return `Reserved for ${seat.delegationName ?? 'a delegation'}`;
	}

	if (!seat.isAvailable) {
		return 'Hidden';
	}

	return 'Free';
}
