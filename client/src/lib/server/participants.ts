import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import { paperStatus, type ReviewStatus } from '$lib/documents';
import type { InvoiceStatus } from '$lib/invoices';
import {
	representativeInvoice,
	type Participant,
	type ParticipantExportRow,
	type ParticipantListRow,
	type ParticipantInvoice
} from '$lib/participants';
import type { MyPermissions } from '$lib/permissions';
import { privateDetailsAccessIn, withheldPrivateDetails } from '$lib/private-details';
import { readPrivateDetails } from '$lib/server/private-details';

// The reads behind the organiser's participants list,
// `/manage/[slug]/participants`, and its CSV. Files under `$lib/server` only
// ever run on the server, so nothing here reaches the browser.
//
// Every read asks as the signed-in organiser, so Row Level Security decides
// what comes back: the seats, invoices, papers and awards of the conference,
// and the private details through the two views of `./private-details.ts`,
// which answer only for what the reader's permissions open
// (`docs/roles-and-permissions.md`, section 5).

/** How many seats one window of `readFilledSeatRows` asks for. */
const SEAT_READ_BATCH_SIZE = 500;

/**
 * How many ids one `.in(...)` lookup asks about at a time. A hundred uuids is
 * about four kilobytes of address, which nothing objects to; a whole
 * conference's worth in one request would not be.
 */
const ID_LOOKUP_BATCH_SIZE = 100;

/** The error code Supabase sends when a window starts past the last row. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

/**
 * The columns of a filled seat.
 *
 * `committees!inner(...)` is here because `seats` has no `conference_id` of
 * its own: the `!inner` is what lets the filter on `committees.conference_id`
 * narrow which seats come back, the way `listSeatsWithHolders` in `./allocation-grid.ts`
 * reads them. The delegation and the person are both looked up afterwards:
 * `seats.user_id` points at `auth.users` rather than at `profiles`, and the
 * delegation's name comes from the `participant_delegations` view, which
 * answers a reader of participants where the `delegations` table itself would
 * answer them nothing (`readDelegationNames` below).
 */
const FILLED_SEAT_COLUMNS =
	'id, name, kind, country_code, user_id, application_id, delegation_id, committees!inner(conference_id, id, name, abbreviation, position)';

/** One filled `seats` row, under the database's own column names. */
type FilledSeatRow = {
	id: string;
	name: string;
	kind: Database['public']['Enums']['seat_kind'];
	country_code: string | null;
	/** Never `null`: the query asks only for filled seats. */
	user_id: string;
	application_id: string | null;
	committees: {
		conference_id: string;
		id: string;
		name: string;
		abbreviation: string | null;
		position: number;
	};
	/** The delegation the seat was allocated to, or `null` for an individual delegate's seat. */
	delegation_id: string | null;
};

/** One `profiles` row, with what the table and the CSV show of a person. */
type ParticipantProfileRow = {
	id: string;
	full_name: string;
	pronouns: string | null;
	avatar_path: string | null;
	institution_name: string | null;
	country_code: string | null;
	experience_level: Database['public']['Enums']['experience_level'];
};

/** One invoice, as the row's badge and the CSV need it. */
type ParticipantInvoiceRow = {
	id: string;
	number: string;
	status: InvoiceStatus;
	paid_at: string | null;
	seat_id: string | null;
	delegation_id: string | null;
};

/** These ids cut into lists of at most `ID_LOOKUP_BATCH_SIZE`. An empty list gives no batches. */
function idBatches(ids: string[]): string[][] {
	const batches: string[][] = [];

	for (let firstIndex = 0; firstIndex < ids.length; firstIndex += ID_LOOKUP_BATCH_SIZE) {
		batches.push(ids.slice(firstIndex, firstIndex + ID_LOOKUP_BATCH_SIZE));
	}

	return batches;
}

/**
 * Every filled seat of the conference, in the organiser's committee order and
 * then the seats' own order, however many there are.
 *
 * PostgREST answers with at most `max_rows` rows whatever is asked of it, so
 * this asks for a window at a time and moves it along until one comes back
 * empty, the way `readConferenceInvoiceRows` in `./invoices.ts` does. The seat
 * id comes last in the order so that two seats sharing a position cannot swap
 * places between two windows.
 */
async function readFilledSeatRows(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<FilledSeatRow[]> {
	const seats: FilledSeatRow[] = [];
	let firstIndex = 0;

	while (true) {
		const { data, error } = await supabase
			.from('seats')
			.select(FILLED_SEAT_COLUMNS)
			.eq('committees.conference_id', conferenceId)
			.not('user_id', 'is', null)
			.order('committees(position)', { ascending: true })
			.order('position', { ascending: true })
			.order('name', { ascending: true })
			.order('id', { ascending: true })
			.range(firstIndex, firstIndex + SEAT_READ_BATCH_SIZE - 1)
			// Replaces Supabase's guess at the row's shape with ours. It has to come last.
			.overrideTypes<FilledSeatRow[], { merge: false }>();

		// The window starts past the last row, which is the end of the list.
		if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
			return seats;
		}

		if (error) {
			throw new Error(`Could not read the participants: ${error.message}`);
		}

		const batch = data ?? [];

		if (batch.length === 0) {
			return seats;
		}

		seats.push(...batch);
		firstIndex = firstIndex + batch.length;
	}
}

/** The profiles of these people, by user id. */
async function readProfiles(
	supabase: SupabaseClient,
	userIds: string[]
): Promise<Map<string, ParticipantProfileRow>> {
	const profiles = new Map<string, ParticipantProfileRow>();

	for (const batch of idBatches(userIds)) {
		const { data, error } = await supabase
			.from('profiles')
			.select(
				'id, full_name, pronouns, avatar_path, institution_name, country_code, experience_level'
			)
			.in('id', batch)
			.overrideTypes<ParticipantProfileRow[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read the participants' profiles: ${error.message}`);
		}

		for (const row of data ?? []) {
			profiles.set(row.id, row);
		}
	}

	return profiles;
}

/**
 * The names of these delegations, by delegation id.
 *
 * Read from the `participant_delegations` view rather than the `delegations`
 * table. The table answers only a delegation's own members and the organisers
 * who read applications; a chair holding `read_participants` for one
 * committee reads nothing from it, on purpose, because a whole row carries the
 * join code (security review 2026-10-10, M18). The view answers everybody who
 * may list the participant with the delegation's name and its other public
 * columns, and has no join code to give.
 */
async function readDelegationNames(
	supabase: SupabaseClient,
	delegationIds: string[]
): Promise<Map<string, string>> {
	const names = new Map<string, string>();

	for (const batch of idBatches(delegationIds)) {
		const { data, error } = await supabase
			.from('participant_delegations')
			.select('id, name')
			.in('id', batch)
			.overrideTypes<{ id: string; name: string }[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read the participants' delegations: ${error.message}`);
		}

		for (const row of data ?? []) {
			names.set(row.id, row.name);
		}
	}

	return names;
}

/**
 * Every invoice that is not cancelled and names one of these ids in `column`,
 * grouped by that id: `seat_id` for the invoices raised for one seat,
 * `delegation_id` for a delegation's group invoices.
 */
async function readInvoicesBy(
	supabase: SupabaseClient,
	column: 'seat_id' | 'delegation_id',
	ids: string[]
): Promise<Map<string, ParticipantInvoiceRow[]>> {
	const invoicesById = new Map<string, ParticipantInvoiceRow[]>();

	for (const batch of idBatches(ids)) {
		const { data, error } = await supabase
			.from('invoices')
			.select('id, number, status, paid_at, seat_id, delegation_id')
			.in(column, batch)
			.neq('status', 'void')
			// Oldest first, so of two unpaid invoices the row shows the first one raised.
			.order('created_at', { ascending: true })
			.overrideTypes<ParticipantInvoiceRow[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read the participants' invoices: ${error.message}`);
		}

		for (const row of data ?? []) {
			const ownerId = row[column];

			if (ownerId === null) {
				continue;
			}

			const invoices = invoicesById.get(ownerId) ?? [];
			invoices.push(row);
			invoicesById.set(ownerId, invoices);
		}
	}

	return invoicesById;
}

/** The review status of each of these seats' position papers, by seat id. */
async function readPaperReviews(
	supabase: SupabaseClient,
	seatIds: string[]
): Promise<Map<string, ReviewStatus | null>> {
	const reviews = new Map<string, ReviewStatus | null>();

	for (const batch of idBatches(seatIds)) {
		const { data, error } = await supabase
			.from('documents')
			.select('seat_id, review_status')
			.eq('kind', 'position_paper')
			.in('seat_id', batch)
			.overrideTypes<{ seat_id: string; review_status: ReviewStatus | null }[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read the position papers: ${error.message}`);
		}

		for (const row of data ?? []) {
			reviews.set(row.seat_id, row.review_status);
		}
	}

	return reviews;
}

/** An invoice row in the shape a participant carries, before it is told whose it is. */
function toInvoiceFacts(row: ParticipantInvoiceRow): Omit<ParticipantInvoice, 'isGroupInvoice'> {
	return { id: row.id, number: row.number, status: row.status, paidAt: row.paid_at };
}

/**
 * The invoice one seat's row shows. The seat's own invoice comes first; a
 * delegation member with none of their own shows the delegation's, which is
 * how `05-pages/organiser/participants.md` asks for "Group invoice".
 */
function invoiceForSeat(
	seat: FilledSeatRow,
	seatInvoices: Map<string, ParticipantInvoiceRow[]>,
	delegationInvoices: Map<string, ParticipantInvoiceRow[]>
): ParticipantInvoice | null {
	const ownInvoices = (seatInvoices.get(seat.id) ?? []).map(toInvoiceFacts);
	const ownInvoice = representativeInvoice(ownInvoices, false);

	if (ownInvoice !== null || seat.delegation_id === null) {
		return ownInvoice;
	}

	const groupInvoices = (delegationInvoices.get(seat.delegation_id) ?? []).map(toInvoiceFacts);

	return representativeInvoice(groupInvoices, true);
}

/**
 * The delegation this seat was allocated to, named, or `null` for an
 * individual delegate's seat.
 *
 * A delegation the view did not name is treated as none. The view answers for
 * every delegation whose participant the reader may list, so this only happens
 * for a reader the page should not have let in, and the row then says nothing
 * about a group it may not name rather than printing an id.
 */
function delegationOfSeat(
	seat: FilledSeatRow,
	delegationNames: Map<string, string>
): Participant['delegation'] {
	if (seat.delegation_id === null) {
		return null;
	}

	const name = delegationNames.get(seat.delegation_id);

	return name === undefined ? null : { id: seat.delegation_id, name };
}

/**
 * Every filled seat of one conference and the person in it, for the
 * participants table.
 *
 * The whole conference is read and the page filters, sorts and pages it with
 * the pure functions in `$lib/participants.ts`. Two of the filters are about
 * facts that live in other tables — which invoice stands for the seat and
 * whether its paper arrived — and the totals along the top count every
 * participant anyway, so asking the database to filter would mean reading
 * everything twice. The allocation grid reads a conference's seats the same
 * way.
 *
 * A reserved seat or a free one never appears, because the query asks only for
 * seats with a `user_id`. A deleted account sets its seat's `user_id` to null,
 * so it drops off the list the same way. A seat whose profile does not come
 * back is left out too: it has nobody the table could name.
 */
export async function listParticipants(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<Participant[]> {
	const seats = await readFilledSeatRows(supabase, conferenceId);

	const seatIds = seats.map((seat) => seat.id);
	const userIds = seats.map((seat) => seat.user_id);
	const delegationIds = new Set<string>();

	for (const seat of seats) {
		if (seat.delegation_id !== null) {
			delegationIds.add(seat.delegation_id);
		}
	}

	// None of these five needs another's answer, so they run side by side.
	const [profiles, delegationNames, seatInvoices, delegationInvoices, paperReviews] =
		await Promise.all([
			readProfiles(supabase, userIds),
			readDelegationNames(supabase, [...delegationIds]),
			readInvoicesBy(supabase, 'seat_id', seatIds),
			readInvoicesBy(supabase, 'delegation_id', [...delegationIds]),
			readPaperReviews(supabase, seatIds)
		]);

	const participants: Participant[] = [];

	for (const seat of seats) {
		const profile = profiles.get(seat.user_id);

		if (!profile) {
			continue;
		}

		participants.push({
			seatId: seat.id,
			seatName: seat.name,
			seatKind: seat.kind,
			seatCountryCode: seat.country_code,
			committee: {
				id: seat.committees.id,
				name: seat.committees.name,
				abbreviation: seat.committees.abbreviation
			},
			userId: seat.user_id,
			fullName: profile.full_name,
			pronouns: profile.pronouns,
			avatarPath: profile.avatar_path,
			institutionName: profile.institution_name,
			countryCode: profile.country_code,
			experienceLevel: profile.experience_level,
			delegation: delegationOfSeat(seat, delegationNames),
			applicationId: seat.application_id,
			invoice: invoiceForSeat(seat, seatInvoices, delegationInvoices),
			paperStatus: paperStatus(paperReviews.get(seat.id) ?? null)
		});
	}

	return participants;
}

/**
 * The name of each of these delegations' head, by delegation id.
 *
 * Two queries, because `delegation_members.user_id` points at `auth.users`
 * rather than at `profiles`. A delegation with two heads is named after the
 * first one that comes back.
 */
async function readHeadNames(
	supabase: SupabaseClient,
	delegationIds: string[]
): Promise<Map<string, string>> {
	const headIdByDelegation = new Map<string, string>();

	for (const batch of idBatches(delegationIds)) {
		const { data, error } = await supabase
			.from('delegation_members')
			.select('delegation_id, user_id')
			.eq('role', 'head')
			.in('delegation_id', batch)
			.order('joined_at', { ascending: true })
			.overrideTypes<{ delegation_id: string; user_id: string }[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read the delegation heads: ${error.message}`);
		}

		for (const row of data ?? []) {
			if (!headIdByDelegation.has(row.delegation_id)) {
				headIdByDelegation.set(row.delegation_id, row.user_id);
			}
		}
	}

	const profiles = await readProfiles(supabase, [...new Set(headIdByDelegation.values())]);
	const headNames = new Map<string, string>();

	for (const [delegationId, headId] of headIdByDelegation) {
		const profile = profiles.get(headId);

		if (profile) {
			headNames.set(delegationId, profile.full_name);
		}
	}

	return headNames;
}

/** One confirmed award, as the CSV needs it. */
type ConfirmedAwardRow = {
	seat_id: string;
	user_id: string | null;
	title: string;
};

/**
 * The titles of each seat's confirmed awards, by seat id.
 *
 * An award names a seat, and once the conference publishes its awards the
 * delegate's id is copied onto it, so a later change of seat does not move it.
 * An award whose copied delegate is somebody other than whoever sits in the
 * seat now is therefore theirs and not the current holder's, and is left out.
 */
async function readAwardTitles(
	supabase: SupabaseClient,
	participants: Participant[]
): Promise<Map<string, string[]>> {
	const holderBySeat = new Map(
		participants.map((participant) => [participant.seatId, participant.userId])
	);
	const titles = new Map<string, string[]>();

	for (const batch of idBatches([...holderBySeat.keys()])) {
		const { data, error } = await supabase
			.from('awards')
			.select('seat_id, user_id, title')
			.eq('status', 'confirmed')
			.in('seat_id', batch)
			.order('created_at', { ascending: true })
			.overrideTypes<ConfirmedAwardRow[], { merge: false }>();

		if (error) {
			throw new Error(`Could not read the awards: ${error.message}`);
		}

		for (const row of data ?? []) {
			const isAnotherDelegates =
				row.user_id !== null && row.user_id !== holderBySeat.get(row.seat_id);

			if (isAnotherDelegates) {
				continue;
			}

			const seatTitles = titles.get(row.seat_id) ?? [];
			seatTitles.push(row.title);
			titles.set(row.seat_id, seatTitles);
		}
	}

	return titles;
}

/**
 * These participants with the private details the reader may see on this
 * conference. The rest are `null`, and the table and the CSV leave their
 * columns out. The order is kept.
 *
 * The views answer for anybody taking part where the reader holds the
 * permission, which may be another conference altogether, so each row keeps
 * only what `mine`, the reader's permissions on this conference, grants in
 * that participant's committee.
 */
export async function withPrivateDetails(
	supabase: SupabaseClient,
	participants: Participant[],
	mine: MyPermissions
): Promise<ParticipantListRow[]> {
	const details = await readPrivateDetails(
		supabase,
		participants.map((participant) => participant.userId)
	);

	return participants.map((participant) => {
		const privateDetails = details.get(participant.userId);
		const row: ParticipantListRow = {
			...participant,
			email: privateDetails?.email ?? null,
			dateOfBirth: privateDetails?.date_of_birth ?? null,
			phone: privateDetails?.phone ?? null,
			dietaryRequirements: privateDetails?.dietary_requirements ?? null,
			emergencyContactName: privateDetails?.emergency_contact_name ?? null,
			emergencyContactPhone: privateDetails?.emergency_contact_phone ?? null
		};

		return withheldPrivateDetails(row, privateDetailsAccessIn(mine, participant.committee.id));
	});
}

/**
 * These participants with the private facts the CSV carries on top of the
 * table: the private details the reader may see on this conference, the
 * delegation's head, and the confirmed awards. The order is kept, so the file
 * comes out sorted the way the table was.
 */
export async function withExportDetails(
	supabase: SupabaseClient,
	participants: Participant[],
	mine: MyPermissions
): Promise<ParticipantExportRow[]> {
	const delegationIds = new Set<string>();

	for (const participant of participants) {
		if (participant.delegation !== null) {
			delegationIds.add(participant.delegation.id);
		}
	}

	const [rows, headNames, awardTitles] = await Promise.all([
		withPrivateDetails(supabase, participants, mine),
		readHeadNames(supabase, [...delegationIds]),
		readAwardTitles(supabase, participants)
	]);

	return rows.map((participant) => {
		const delegationId = participant.delegation?.id;

		return {
			...participant,
			delegationHeadName: delegationId === undefined ? null : (headNames.get(delegationId) ?? null),
			awardTitles: awardTitles.get(participant.seatId) ?? []
		};
	});
}

/**
 * The number of the paid invoice raised for this seat, or `null` when there is
 * none.
 *
 * "Remove from seat" asks this before it frees the seat, for the reason
 * `hasPaidInvoiceForSeat` in `./allocation-grid.ts` gives: `revoke_seat` leaves a paid
 * invoice alone, and the organiser is told its number so they can refund it.
 */
export async function readPaidInvoiceNumber(
	supabase: SupabaseClient,
	seatId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('invoices')
		.select('number')
		.eq('seat_id', seatId)
		.eq('status', 'paid')
		.order('created_at', { ascending: true })
		.limit(1)
		.overrideTypes<{ number: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the invoice for this seat: ${error.message}`);
	}

	return data?.[0]?.number ?? null;
}
