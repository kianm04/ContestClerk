/**
 * The rules and the wording of the organiser's delegation review page,
 * `/manage/[slug]/delegations/[delegationId]`, where one school's request is
 * read in full, given seats across committees, or turned down.
 *
 * It is a file of its own rather than more of `$lib/delegations.ts` because
 * that file already holds four topics — registering a group, joining one, the
 * head's own pages and the organiser's table — and
 * `specs/07-delivery/tasks.md` gives this page its own half of the split T27
 * was cut in two by. Nothing here touches Svelte or the database, so every
 * sentence below can be read and tested on its own.
 *
 * The shapes are here rather than beside the queries in
 * `$lib/server/delegations.ts` for the reason `MyDelegationSeat` in
 * `$lib/delegations.ts` gives: a component may not import anything from
 * `$lib/server`, not even a type.
 */

import type {
	DelegationInvoiceStatus,
	DelegationMember,
	DelegationSeatCounts,
	DelegationSeatGroup,
	DelegationStatus
} from '$lib/delegations';
import { MEMBER_DETAIL_MISSING, headNamesSentence } from '$lib/delegations';
import type { KeyValueItem } from '$lib/components/KeyValueList.svelte';
import { EXPERIENCE_LEVEL_CHOICES } from '$lib/profiles';
import { ageInYears } from '$lib/dates';
import { hasPermission, type MyPermissions } from '$lib/permissions';
import { privateDetailsAccessIn, type PrivateDetailsAccess } from '$lib/private-details';

/**
 * The delegation itself, as this page reads it.
 *
 * A narrower shape than `Delegation` in `$lib/delegations.ts`, and a wider one:
 * it leaves out the join code, which is the head's business, and it carries
 * `internalNote`, which is the organisers' own note and the one column no other
 * page reads. `DelegationConference` sits beside `Conference` for the same
 * reason.
 */
export type OrganiserDelegation = {
	id: string;
	conferenceId: string;
	name: string;
	institutionName: string;
	countryCode: string | null;
	status: DelegationStatus;
	requestedSeats: number;
	/** What the head wrote to the organisers when they registered. */
	note: string | null;
	submittedAt: string | null;
	decidedAt: string | null;
	/** What the organisers told the head. The head reads this one. */
	decisionNote: string | null;
	/** The organisers' own note. Nobody outside `/manage` ever reads it. */
	internalNote: string | null;
};

/** One invoice written against this delegation, as the Invoices card lists it. */
export type DelegationInvoiceLine = {
	id: string;
	/** Such as `riverside-mun-2027-0004`. */
	number: string;
	description: string;
	amountCents: number;
	currency: string;
	status: DelegationInvoiceStatus;
};

/**
 * The invoice `allocate_delegation_seats` has just written, or `null` when it
 * wrote none because this conference charges delegation members nothing.
 *
 * It is found by comparing the delegation's invoices before and after rather
 * than by asking the function, which answers nothing. `06-features/fees.md`
 * makes one allocation one invoice, so at most one id is new. The review page
 * and the allocation grid's tray (T131) both allocate, and both ask this.
 */
export function newInvoiceOf(
	before: DelegationInvoiceLine[],
	after: DelegationInvoiceLine[]
): DelegationInvoiceLine | null {
	const alreadySeen = new Set(before.map((invoice) => invoice.id));

	return after.find((invoice) => !alreadySeen.has(invoice.id)) ?? null;
}

/** Everything `getDelegationForOrganiser` reads about one delegation. */
export type OrganiserDelegationDetail = {
	delegation: OrganiserDelegation;
	members: DelegationMember[];
	/** The seats reserved for the delegation, under their committees. */
	seatGroups: DelegationSeatGroup[];
	invoices: DelegationInvoiceLine[];
};

/** The longest the organisers' own note may be, matching the text box. */
export const INTERNAL_NOTE_MAX_LENGTH = 2000;

/** The longest the note sent to the head may be. */
export const DECISION_NOTE_MAX_LENGTH = 1000;

/** What the seat picker says when the organiser pressed Allocate with nothing ticked. */
export const NO_SEATS_TICKED_REFUSAL = 'Tick at least one seat.';

/** What `removeSeat` says about a seat the head has already put somebody in. */
export const SEAT_HAS_MEMBER_REFUSAL = 'Unassign the member first, or ask the head to.';

/** What `reject` says about an accepted delegation that still holds seats. */
export const SEATS_BEFORE_REJECTING_REFUSAL =
	'Remove the allocated seats before marking this delegation as not accepted.';

/** What `reject` says about a delegation that has already been decided. */
export const ALREADY_DECIDED_REFUSAL = 'This delegation has already been decided.';

/** What `removeSeat` says about a seat another organiser gave back first. */
export const SEAT_ALREADY_REMOVED_REFUSAL = 'That seat is no longer reserved for this delegation.';

/** The flash after `removeSeat`. */
export const SEAT_REMOVED_FLASH = 'Seat removed.';

/** The flash after `reject`. */
export const REJECTED_FLASH = 'Marked as not accepted. The head has been notified.';

/** The flash after `saveInternalNote`. */
export const INTERNAL_NOTE_SAVED_FLASH = 'Note saved.';

/** What `saveInternalNote` says about a note longer than the column allows. */
export const INTERNAL_NOTE_TOO_LONG_REFUSAL = `Keep the note under ${INTERNAL_NOTE_MAX_LENGTH} characters.`;

/** The notice over a members list holding nobody but the head. */
export const NO_MEMBERS_YET_NOTICE =
	'The head has not invited any members yet. Seats can still be allocated.';

/** The notice in place of the picker when the conference has no free seat left at all. */
export const NO_FREE_SEATS_NOTICE =
	'Every seat is taken or reserved. Free seats on the allocation page first.';

/** The heading over the seats the organisers have already reserved. */
export const NO_RESERVED_SEATS = 'No seats reserved yet.';

/**
 * What the picker says when the database refused the tick list and no seat of
 * it could be named.
 *
 * `seatTakenRefusal` below names the seat whenever the page can still find it.
 * This is the same sentence without the name, for the moment between the
 * page's own check and the database's when another organiser takes a seat.
 */
export const SEATS_JUST_CHANGED_REFUSAL =
	'One of those seats was just taken. Untick it and try again.';

/**
 * "UNSC · France was just taken. Untick it and try again."
 *
 * The page is a moment old, so a seat it drew as free can have been given to
 * somebody else since. The whole tick list is refused together rather than
 * half-allocated, which is also what `allocate_delegation_seats` does, so the
 * organiser only has to untick the one seat this names. `seatLabel` is already
 * "committee · seat", the way `readSeatLabel` in `$lib/server/seat-acceptance.ts` and
 * `reservedSeatLabel` below both write it.
 */
export function seatTakenRefusal(seatLabel: string): string {
	return `${seatLabel} was just taken. Untick it and try again.`;
}

/**
 * "10 seats allocated to Lycée Français. Invoice riverside-mun-2027-0004 created."
 *
 * `invoiceNumber` is `null` when no `delegation_member` fee applies to this
 * conference, and then the sentence says so rather than leaving the organiser
 * wondering where the bill went. `06-features/fees.md` allows a conference to
 * charge nothing. It is `undefined` for a reader who may not read invoices,
 * who is told nothing about them.
 */
export function seatsAllocatedFlash(
	seatCount: number,
	delegationName: string,
	invoiceNumber: string | null | undefined
): string {
	const seats = seatCount === 1 ? '1 seat' : `${seatCount} seats`;

	if (invoiceNumber === undefined) {
		return `${seats} allocated to ${delegationName}.`;
	}

	const invoice =
		invoiceNumber === null
			? 'No fee applies, so no invoice was created.'
			: `Invoice ${invoiceNumber} created.`;

	return `${seats} allocated to ${delegationName}. ${invoice}`;
}

/**
 * The words on the picker's own button, which are also the words that accept
 * the delegation.
 *
 * There is one button rather than the two the wireframe in
 * `05-pages/organiser/delegation-review.md` draws, because accepting and
 * allocating are one press: `allocate_delegation_seats` is what moves a
 * `submitted` delegation to `accepted`, and the picker refuses an empty tick
 * list, so there is no accepting without seats to accept into. The label says
 * which of the two this press is.
 */
export function allocateButtonLabel(selectedCount: number, status: DelegationStatus): string {
	const isFirstDecision = status === 'submitted';

	if (selectedCount === 0) {
		return isFirstDecision ? 'Accept and allocate seats' : 'Allocate more seats';
	}

	const seats = selectedCount === 1 ? '1 seat' : `${selectedCount} seats`;

	return isFirstDecision ? `Accept and allocate ${seats}` : `Allocate ${seats} more`;
}

/**
 * The line under the page's title: "Lycée Français Paris · 12 seats requested ·
 * head M. Dupont".
 *
 * The heads are picked out of the members rather than asked for separately,
 * because the page already has every member and their role. A delegation whose
 * head deleted their account has none left, and `headNamesSentence` answers a
 * dash for that, which is what `05-pages/organiser/delegation-review.md` means
 * by "Deleted account": the buttons all still work.
 */
export function delegationSubtitle(
	delegation: OrganiserDelegation,
	members: DelegationMember[]
): string {
	const seats =
		delegation.requestedSeats === 1
			? '1 seat requested'
			: `${delegation.requestedSeats} seats requested`;
	const headNames = members.filter((member) => member.role === 'head').map((head) => head.fullName);

	return `${delegation.institutionName} · ${seats} · head ${headNamesSentence(headNames)}`;
}

/** "4 selected", the counter under the checkbox list. */
export function selectedSeatsSentence(selectedCount: number): string {
	return `${selectedCount} selected`;
}

/**
 * Whether this delegation can still be given seats, which is what decides
 * whether the picker is drawn at all.
 *
 * `05-pages/organiser/delegation-review.md` asks for a `rejected` or
 * `withdrawn` delegation to show its decision read-only and no picker.
 * `allocate_delegation_seats` refuses those two as well, so the page and the
 * database agree.
 */
export function canAllocateToDelegation(status: DelegationStatus): boolean {
	return status === 'submitted' || status === 'accepted';
}

/**
 * Why this delegation may not be marked "not accepted", or `null` when it may.
 *
 * The second rule is this page's to keep. `guard_delegation_update` in T16's
 * migration lets an organiser set any status on a delegation that still holds
 * seats, so nothing underneath stops a rejected school keeping its reservations
 * and its invoice. `06-features/delegations.md` says the seats come back first.
 */
export function rejectRefusal(status: DelegationStatus, allocatedSeats: number): string | null {
	if (status !== 'submitted' && status !== 'accepted') {
		return ALREADY_DECIDED_REFUSAL;
	}

	if (allocatedSeats > 0) {
		return SEATS_BEFORE_REJECTING_REFUSAL;
	}

	return null;
}

/** The label of one member's experience level, such as "Several". */
function experienceLabel(member: DelegationMember): string {
	const choice = EXPERIENCE_LEVEL_CHOICES.find((option) => option.value === member.experienceLevel);

	return choice ? choice.label : MEMBER_DETAIL_MISSING;
}

/** A detail the member never filled in reads "Not given" rather than being left blank. */
function detailOrMissing(value: string | null): string {
	if (value === null || value.trim() === '') {
		return MEMBER_DETAIL_MISSING;
	}

	return value;
}

/**
 * The facts under one member's name on the review page, ready for
 * `KeyValueList`.
 *
 * The private three follow the reader's permissions
 * (`docs/roles-and-permissions.md`, section 5): the phone with
 * `read_contact_details`, the age and the dietary requirements with
 * `read_welfare_details`. A row the reader may not see is left out, and
 * `details` is `null` for a member neither view answered for, so the list is
 * then the two public facts alone rather than rows saying "Not given", which
 * would read as "they gave nothing" instead of "you may not see this".
 *
 * `now` is passed in rather than read from the clock here so that the age a
 * test asserts does not change with the day the test is run.
 */
export function memberMetaItems(
	member: DelegationMember,
	now: Date,
	access: PrivateDetailsAccess
): KeyValueItem[] {
	const items: KeyValueItem[] = [
		{ label: 'Institution', value: detailOrMissing(member.institutionName) },
		{ label: 'Experience', value: experienceLabel(member) }
	];

	if (member.details === null) {
		return items;
	}

	const age = ageInYears(member.details.dateOfBirth, now);

	if (access.welfare) {
		items.push({ label: 'Age', value: age === null ? MEMBER_DETAIL_MISSING : String(age) });
	}

	if (access.contact) {
		items.push({ label: 'Phone', value: detailOrMissing(member.details.phone) });
	}

	if (access.welfare) {
		items.push({
			label: 'Dietary requirements',
			value: detailOrMissing(member.details.dietaryRequirements)
		});
	}

	return items;
}

/**
 * The committee of the seat this member holds in the delegation, or `null`
 * while they hold none. A member's own `seat` names the committee but not its
 * id, so the id is found among the delegation's seats.
 */
function memberCommitteeId(
	member: DelegationMember,
	seatGroups: DelegationSeatGroup[]
): string | null {
	for (const group of seatGroups) {
		if (group.seats.some((seat) => seat.holder?.userId === member.userId)) {
			return group.committee.id;
		}
	}

	return null;
}

/**
 * Which of one member's private details this reader may see on this
 * conference, which is what the two private-details views grant here: for a
 * member in a seat, a permission held on the whole conference or on the seat's
 * committee; for a member without one, a permission held on the whole
 * conference only.
 */
export function memberDetailsAccess(
	mine: MyPermissions,
	committeeId: string | null
): PrivateDetailsAccess {
	if (committeeId !== null) {
		return privateDetailsAccessIn(mine, committeeId);
	}

	return {
		contact: hasPermission(mine, 'read_contact_details'),
		welfare: hasPermission(mine, 'read_welfare_details')
	};
}

/**
 * The members with every private detail this reader may not see on this
 * conference set to `null`, and `details` itself `null` when nothing is left.
 *
 * The views answer for anybody taking part in any conference where the reader
 * holds the permission, so a member of this delegation who also takes part in
 * another conference the reader helps run comes back with their details. This
 * page is about this conference alone, so what came back is cut down to what
 * the reader holds here before it reaches the browser (security review I27).
 */
export function withheldMemberDetails(
	members: DelegationMember[],
	seatGroups: DelegationSeatGroup[],
	mine: MyPermissions
): DelegationMember[] {
	return members.map((member) => {
		const access = memberDetailsAccess(mine, memberCommitteeId(member, seatGroups));

		if (member.details === null || (!access.contact && !access.welfare)) {
			return { ...member, details: null };
		}

		return {
			...member,
			details: {
				dateOfBirth: access.welfare ? member.details.dateOfBirth : null,
				phone: access.contact ? member.details.phone : null,
				dietaryRequirements: access.welfare ? member.details.dietaryRequirements : null
			}
		};
	});
}

/** "UNSC · France", the seat a member holds, or `null` while they hold none. */
export function memberSeatSentence(member: DelegationMember): string | null {
	if (member.seat === null) {
		return null;
	}

	const committee = member.seat.committeeAbbreviation ?? member.seat.committeeName;

	return `${committee} · ${member.seat.seatName}`;
}

/**
 * How many seats these groups hold, and how many of them the head has put
 * somebody into.
 *
 * `delegationProgress` in `$lib/delegations.ts` wants exactly this shape, and
 * counting the groups the page already has saves the extra query
 * `countDelegationSeats` would be. A seat counts as assigned once somebody is
 * holding it, which is the same rule that query uses.
 */
export function delegationSeatCounts(seatGroups: DelegationSeatGroup[]): DelegationSeatCounts {
	let allocated = 0;
	let assigned = 0;

	for (const group of seatGroups) {
		for (const seat of group.seats) {
			allocated += 1;

			if (seat.holder !== null) {
				assigned += 1;
			}
		}
	}

	return { allocated, assigned };
}

/** How many seats these groups hold altogether, which is what `reject` asks about. */
export function reservedSeatCount(seatGroups: DelegationSeatGroup[]): number {
	return delegationSeatCounts(seatGroups).allocated;
}

/**
 * Where the "Remove" button on one reserved seat posts to: `?/removeSeat` with
 * the seat in the address.
 *
 * `ConfirmButton` renders a `<form>` of its own and takes no hidden fields of
 * ours, so the seat id has to travel in the address. That is what the
 * allocation grid does for the same reason. SvelteKit picks the action out of
 * the parameter whose name starts with `/`, so the two parameters can sit side
 * by side without either getting in the other's way.
 */
export function removeSeatActionUrl(seatId: string): string {
	return `?seatId=${encodeURIComponent(seatId)}&/removeSeat`;
}

/** A seat named with its committee in front of it: "UNSC · France". */
export function reservedSeatLabel(committeeLabel: string, seatName: string): string {
	return `${committeeLabel} · ${seatName}`;
}

/** What a reserved seat with nobody in it says where a member's name would be. */
export const UNASSIGNED_SEAT_LABEL = 'Unassigned';
