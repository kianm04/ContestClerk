/**
 * The organiser's participants list, `/manage/[slug]/participants`: who is
 * sitting in a seat, the filters the page keeps in its address, the numbers
 * along its top, and the rows of the CSV it hands out.
 *
 * Everything here is pure, so it runs in tests without a database. Reading the
 * rows is `listParticipants` in `$lib/server/participants.ts`; the page file is
 * `specs/05-pages/organiser/participants.md`.
 */

import type { CommitteeChoice } from '$lib/applications';
import { committeeHeading } from '$lib/committees';
import { countryName } from '$lib/countries';
import { isPaperStatus, paperStatusLabel, type PaperStatus } from '$lib/documents';
import type { InvoiceStatus } from '$lib/invoices';
import type { Database } from '$lib/database.types';
import { statusLabel } from '$lib/status';

/** How many participants one page of the table shows. */
export const PARTICIPANTS_PAGE_SIZE = 50;

/**
 * What the invoice dropdown can ask for. `none` is a participant with no
 * invoice at all, which is how an organiser finds the people nobody billed.
 */
export type ParticipantInvoiceFilter = 'unpaid' | 'paid' | 'waived' | 'none';

/** The columns the table can be sorted by. */
export type ParticipantSort = 'committee' | 'name' | 'institution';

/** Every filter, the sort and the page, all of which travel in the address. */
export type ParticipantQuery = {
	/** What was typed into the search box: a name, an institution or a seat. */
	q: string;
	/** A committee id, or '' for every committee. */
	committee: string;
	/** A delegation id, `none` for individual delegates, or '' for everybody. */
	delegation: string;
	invoice: ParticipantInvoiceFilter | '';
	paper: PaperStatus | '';
	sort: ParticipantSort;
	/** 1-based, the way the address bar writes it. */
	page: number;
};

/** The table as it opens: nothing filtered, sorted by committee, first page. */
export const EMPTY_PARTICIPANT_QUERY: ParticipantQuery = {
	q: '',
	committee: '',
	delegation: '',
	invoice: '',
	paper: '',
	sort: 'committee',
	page: 1
};

/** The delegation filter's value for "delegates who applied on their own". */
export const INDIVIDUAL_DELEGATES = 'none';

/** The four choices of the invoice dropdown, in the order it lists them. */
export const PARTICIPANT_INVOICE_OPTIONS: { value: ParticipantInvoiceFilter; label: string }[] = [
	{ value: 'unpaid', label: 'Unpaid' },
	{ value: 'paid', label: 'Paid' },
	{ value: 'waived', label: 'Waived' },
	{ value: 'none', label: 'No invoice' }
];

/** The four choices of the paper dropdown, worded the way the badges are. */
export const PARTICIPANT_PAPER_OPTIONS: { value: PaperStatus; label: string }[] = [
	{ value: 'missing', label: paperStatusLabel('missing') },
	{ value: 'submitted', label: paperStatusLabel('submitted') },
	{ value: 'approved', label: paperStatusLabel('approved') },
	{ value: 'changes_requested', label: paperStatusLabel('changes_requested') }
];

/**
 * The three choices of the sort dropdown. The dropdown has no label drawn above
 * it, so each choice says it is an order. "School" is the column's heading for
 * the institution a delegate gave.
 */
export const PARTICIPANT_SORT_OPTIONS: { value: ParticipantSort; label: string }[] = [
	{ value: 'committee', label: 'By committee' },
	{ value: 'name', label: 'By name' },
	{ value: 'institution', label: 'By school' }
];

/** The invoice a row shows, whether it is the seat's own or the delegation's. */
export type ParticipantInvoice = {
	id: string;
	/** "thimun-2027-0012". */
	number: string;
	status: InvoiceStatus;
	/** An ISO timestamp, or `null` while it is not paid. */
	paidAt: string | null;
	/**
	 * True when this stands for the delegation's invoices rather than one raised
	 * for the seat, so the badge can say "Group invoice" when pointed at.
	 */
	isGroupInvoice: boolean;
};

/** One filled seat and the person sitting in it, as the table draws it. */
export type Participant = {
	seatId: string;
	/** "France". */
	seatName: string;
	seatKind: Database['public']['Enums']['seat_kind'];
	/** The seat's own country, for the flag beside "HRC · Brazil"; `null` for a seat like "Press". */
	seatCountryCode: string | null;
	committee: CommitteeChoice;
	userId: string;
	fullName: string;
	/** Only the CSV prints these, but they are public profile facts like the name. */
	pronouns: string | null;
	avatarPath: string | null;
	institutionName: string | null;
	countryCode: string | null;
	experienceLevel: Database['public']['Enums']['experience_level'];
	/** The delegation the seat belongs to, or `null` for an individual delegate. */
	delegation: { id: string; name: string } | null;
	/** The individual application that won the seat, or `null` for a delegation's member. */
	applicationId: string | null;
	/** `null` when nobody has been billed for this seat. */
	invoice: ParticipantInvoice | null;
	paperStatus: PaperStatus;
};

/** The numbers along the top of the page, counted over every participant. */
export type ParticipantTotals = {
	participantCount: number;
	unpaidCount: number;
	missingPaperCount: number;
	/** How many participants each committee has, by committee id. */
	countByCommittee: Record<string, number>;
};

/**
 * A participant's private details. Each is `null` when it was never given, or
 * when the reader's permissions do not show it (`$lib/private-details.ts`).
 */
export type ParticipantPrivateDetails = {
	email: string | null;
	/** `YYYY-MM-DD`, or `null`. */
	dateOfBirth: string | null;
	phone: string | null;
	dietaryRequirements: string | null;
	emergencyContactName: string | null;
	emergencyContactPhone: string | null;
};

/** One row of the participants table: the participant and the private details the reader sees. */
export type ParticipantListRow = Participant & ParticipantPrivateDetails;

/** One filled seat with the private facts only the CSV carries. */
export type ParticipantExportRow = ParticipantListRow & {
	/** The full name of the delegation's head, or `null`. */
	delegationHeadName: string | null;
	/** The titles of the seat's confirmed awards. */
	awardTitles: string[];
};

/** Anyone can type anything into the URL, so a value is kept only when it is in the list. */
function readChoice<Choice extends string>(
	value: string | null,
	choices: { value: Choice }[]
): Choice | '' {
	const trimmed = value?.trim() ?? '';
	const known = choices.find((choice) => choice.value === trimmed);

	return known?.value ?? '';
}

/** A page number from the address, or 1 when it is missing or not a whole number above 0. */
function readPage(value: string | null): number {
	const page = Number(value);

	if (!Number.isInteger(page) || page < 1) {
		return 1;
	}

	return page;
}

/**
 * Read the table's filters, sort and page out of the address.
 *
 * Anything unknown falls back to its default rather than being an error,
 * because anybody can type an address. A page past the last one is left for
 * `pageOfParticipants` to answer with nothing, the way the other tables do.
 */
export function parseParticipantQuery(searchParams: URLSearchParams): ParticipantQuery {
	const sort = readChoice(searchParams.get('sort'), PARTICIPANT_SORT_OPTIONS);
	const paper = searchParams.get('paper')?.trim() ?? '';

	return {
		q: searchParams.get('q')?.trim() ?? '',
		committee: searchParams.get('committee')?.trim() ?? '',
		delegation: searchParams.get('delegation')?.trim() ?? '',
		invoice: readChoice(searchParams.get('invoice'), PARTICIPANT_INVOICE_OPTIONS),
		paper: isPaperStatus(paper) ? paper : '',
		sort: sort === '' ? 'committee' : sort,
		page: readPage(searchParams.get('page'))
	};
}

/**
 * The query string for these filters, with every default left off and the
 * parameters always in the same order, so the same table has one address.
 */
export function participantQuerySearch(query: ParticipantQuery): string {
	const parameters = new URLSearchParams();

	if (query.q) parameters.set('q', query.q);
	if (query.committee) parameters.set('committee', query.committee);
	if (query.delegation) parameters.set('delegation', query.delegation);
	if (query.invoice) parameters.set('invoice', query.invoice);
	if (query.paper) parameters.set('paper', query.paper);
	if (query.sort !== 'committee') parameters.set('sort', query.sort);
	if (query.page > 1) parameters.set('page', String(query.page));

	return parameters.toString();
}

/** Does the search text appear in the participant's name, institution or seat? */
function matchesSearch(participant: Participant, searchText: string): boolean {
	if (searchText === '') {
		return true;
	}

	const needle = searchText.toLowerCase();
	const haystacks = [participant.fullName, participant.institutionName ?? '', participant.seatName];

	return haystacks.some((haystack) => haystack.toLowerCase().includes(needle));
}

/** Does the participant's invoice answer the invoice dropdown? */
function matchesInvoice(participant: Participant, invoice: ParticipantQuery['invoice']): boolean {
	if (invoice === '') {
		return true;
	}

	if (invoice === 'none') {
		return participant.invoice === null;
	}

	return participant.invoice?.status === invoice;
}

/** Does the participant belong to the delegation the dropdown names? */
function matchesDelegation(participant: Participant, delegation: string): boolean {
	if (delegation === '') {
		return true;
	}

	if (delegation === INDIVIDUAL_DELEGATES) {
		return participant.delegation === null;
	}

	return participant.delegation?.id === delegation;
}

/** Is this participant one the filters leave on the table? The sort and page do not matter here. */
export function matchesParticipantQuery(
	participant: Participant,
	query: ParticipantQuery
): boolean {
	if (query.committee !== '' && participant.committee.id !== query.committee) {
		return false;
	}

	if (query.paper !== '' && participant.paperStatus !== query.paper) {
		return false;
	}

	return (
		matchesSearch(participant, query.q) &&
		matchesDelegation(participant, query.delegation) &&
		matchesInvoice(participant, query.invoice)
	);
}

/**
 * The delegations with at least one member in a seat, in alphabetical order,
 * for the delegation dropdown.
 *
 * Worked out from the participants rather than read from `delegations`: an
 * accepted delegation nobody from has been seated yet would only be a choice
 * that always answers "No participants match."
 */
export function seatedDelegations(participants: Participant[]): { id: string; name: string }[] {
	const byId = new Map<string, { id: string; name: string }>();

	for (const participant of participants) {
		if (participant.delegation !== null) {
			byId.set(participant.delegation.id, participant.delegation);
		}
	}

	return [...byId.values()].sort((first, second) => compareText(first.name, second.name));
}

/** Compares two texts the way a person reads a list, ignoring case and accents. */
function compareText(first: string, second: string): number {
	return first.localeCompare(second, 'en', { sensitivity: 'base' });
}

/**
 * A sorted copy of the participants.
 *
 * `committee` keeps the order the rows arrive in, which is the organiser's own
 * committee order and then the seats' order: `listParticipants` reads them that
 * way and the allocation grid shows them the same way. The other two sort by
 * their column and then by name, so two people from one school come out the
 * same way round on every refresh. A participant with no institution goes last.
 */
export function sortParticipants(
	participants: Participant[],
	sort: ParticipantSort
): Participant[] {
	const sorted = [...participants];

	if (sort === 'name') {
		sorted.sort((first, second) => compareText(first.fullName, second.fullName));
	}

	if (sort === 'institution') {
		sorted.sort((first, second) => {
			const byInstitution = compareInstitutions(first.institutionName, second.institutionName);

			return byInstitution !== 0 ? byInstitution : compareText(first.fullName, second.fullName);
		});
	}

	return sorted;
}

/** Institutions in alphabetical order, with a missing one after all the rest. */
function compareInstitutions(first: string | null, second: string | null): number {
	if (first === second) {
		return 0;
	}

	if (first === null) {
		return 1;
	}

	if (second === null) {
		return -1;
	}

	return compareText(first, second);
}

/** How many pages `matchCount` rows fill. Never less than one, so "Page 1 of 1" still reads. */
export function participantPageCount(matchCount: number): number {
	return Math.max(1, Math.ceil(matchCount / PARTICIPANTS_PAGE_SIZE));
}

/** The rows of one page. `page` is 1-based; a page past the end is empty. */
export function pageOfParticipants(participants: Participant[], page: number): Participant[] {
	const firstIndex = (page - 1) * PARTICIPANTS_PAGE_SIZE;

	return participants.slice(firstIndex, firstIndex + PARTICIPANTS_PAGE_SIZE);
}

/** The numbers above the table, counted over every participant rather than one page. */
export function participantTotals(participants: Participant[]): ParticipantTotals {
	const countByCommittee: Record<string, number> = {};
	let unpaidCount = 0;
	let missingPaperCount = 0;

	for (const participant of participants) {
		const committeeId = participant.committee.id;
		countByCommittee[committeeId] = (countByCommittee[committeeId] ?? 0) + 1;

		if (participant.invoice?.status === 'unpaid') {
			unpaidCount += 1;
		}

		if (participant.paperStatus === 'missing') {
			missingPaperCount += 1;
		}
	}

	return {
		participantCount: participants.length,
		unpaidCount,
		missingPaperCount,
		countByCommittee
	};
}

/**
 * The order invoices are looked at when one badge has to stand for several:
 * anything still owed first, then what was settled. `void` is not in it,
 * because a cancelled invoice is one nobody has to pay.
 */
const INVOICE_PRIORITY: InvoiceStatus[] = ['unpaid', 'paid', 'waived', 'refunded'];

/**
 * The one invoice a row shows, out of every invoice raised for the seat or,
 * with `isGroupInvoice`, for the member's delegation.
 *
 * A seat is normally billed once, but a delegation is billed as a group and
 * can have several invoices, for example a second one after more seats were
 * allocated. The row has room for one badge, so it shows the one that matters
 * most: an unpaid invoice while anything is still owed, otherwise a paid one,
 * then a waived one, then a refunded one. Cancelled invoices are never picked.
 */
export function representativeInvoice(
	invoices: Omit<ParticipantInvoice, 'isGroupInvoice'>[],
	isGroupInvoice: boolean
): ParticipantInvoice | null {
	for (const status of INVOICE_PRIORITY) {
		const invoice = invoices.find((candidate) => candidate.status === status);

		if (invoice) {
			return { ...invoice, isGroupInvoice };
		}
	}

	return null;
}

/** The words on an invoice badge: the status, or "No invoice". */
export function participantInvoiceLabel(invoice: ParticipantInvoice | null): string {
	if (invoice === null) {
		return 'No invoice';
	}

	return statusLabel('invoice_status', invoice.status);
}

/**
 * How old somebody is on a day, in whole years, from two `YYYY-MM-DD` texts.
 *
 * Worked out from the digits rather than from `Date`, so no timezone can move a
 * birthday onto the day before. Somebody born on 29 February is a year older on
 * 1 March in a year without one.
 */
export function ageOnDay(dateOfBirth: string, day: string): number {
	const [birthYear, birthMonth, birthDay] = dateOfBirth.split('-').map(Number);
	const [year, month, dayOfMonth] = day.split('-').map(Number);
	const hasHadBirthday = month > birthMonth || (month === birthMonth && dayOfMonth >= birthDay);
	const fullYears = year - birthYear;

	return hasHadBirthday ? fullYears : fullYears - 1;
}

/** The headings of the CSV, in the order `05-pages/organiser/participants.md` lists them. */
const PARTICIPANT_CSV_HEADINGS = [
	'Full name',
	'Email',
	'Pronouns',
	'Institution',
	'Country',
	'Experience',
	'Date of birth',
	'Age at conference',
	'Phone',
	'Dietary requirements',
	'Emergency contact name',
	'Emergency contact phone',
	'Committee',
	'Seat',
	'Seat kind',
	'Delegation',
	'Delegation head',
	'Invoice number',
	'Invoice status',
	'Paid at',
	'Paper status',
	'Awards'
];

/** One participant as one line of the CSV. `startDate` is the conference's first day. */
function participantCsvRow(participant: ParticipantExportRow, startDate: string): string[] {
	const age =
		participant.dateOfBirth === null ? '' : String(ageOnDay(participant.dateOfBirth, startDate));
	const country = participant.countryCode === null ? '' : countryName(participant.countryCode);

	return [
		participant.fullName,
		participant.email ?? '',
		participant.pronouns ?? '',
		participant.institutionName ?? '',
		country,
		statusLabel('experience_level', participant.experienceLevel),
		participant.dateOfBirth ?? '',
		age,
		participant.phone ?? '',
		participant.dietaryRequirements ?? '',
		participant.emergencyContactName ?? '',
		participant.emergencyContactPhone ?? '',
		committeeHeading(participant.committee),
		participant.seatName,
		statusLabel('seat_kind', participant.seatKind),
		participant.delegation?.name ?? '',
		participant.delegationHeadName ?? '',
		participant.invoice?.number ?? '',
		participant.invoice === null ? '' : participantInvoiceLabel(participant.invoice),
		participant.invoice?.paidAt ?? '',
		paperStatusLabel(participant.paperStatus),
		participant.awardTitles.join(', ')
	];
}

/**
 * The whole export as a table of cells, the first row the headings.
 *
 * It stops at the cells; `toCsvText` in `$lib/csv.ts` turns them into the
 * file, so the quoting rules are written down once for every download.
 */
export function participantCsvRows(
	participants: ParticipantExportRow[],
	startDate: string
): string[][] {
	const rows = participants.map((participant) => participantCsvRow(participant, startDate));

	return [PARTICIPANT_CSV_HEADINGS, ...rows];
}

/**
 * What the download is called: `participants-thimun-2027-2026-09-23.csv`.
 * `day` is `YYYY-MM-DD` in the conference's own timezone.
 */
export function participantsCsvFileName(conferenceSlug: string, day: string): string {
	return `participants-${conferenceSlug}-${day}.csv`;
}

/**
 * The flash after "Remove from seat": "Anna Kowalski removed from France in
 * UNSC." When the seat's own invoice had been paid, freeing it leaves that
 * invoice alone, so the flash says it needs refunding by hand.
 */
export function participantRemovedFlash(
	fullName: string,
	seatName: string,
	committee: CommitteeChoice,
	paidInvoiceNumber: string | null
): string {
	const removed = `${fullName} removed from ${seatName} in ${committeeHeading(committee)}.`;

	if (paidInvoiceNumber === null) {
		return removed;
	}

	return `${removed} Invoice ${paidInvoiceNumber} was paid and needs a manual refund.`;
}
