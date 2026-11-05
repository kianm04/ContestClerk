/**
 * The organiser's committees editor: everything `/manage/[slug]/committees`
 * and the committee edit page beside it read and write.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument, and every query here runs as the signed-in organiser, so the
 * `committees` policies decide whether it is allowed: reading, adding and
 * changing for somebody who can manage the conference, and deleting only while
 * no seat in the committee is filled or held for a delegation (migration
 * 20261023120000).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommitteeFormValues } from '$lib/committee-details';
import {
	summariseManagedSeats,
	type CommitteeLevel,
	type ManagedCommittee,
	type ManagedCommitteeRow,
	type ManagedSeat,
	type ManagedSeatCounts
} from '$lib/committees';
import { countCommitteeDocuments, type CommitteeDocumentCounts } from './documents';
import {
	holderOf,
	readDelegationNames,
	readSeatHolders,
	type SeatHolder,
	type SeatRow
} from './seat-holders';
import { listChairNamesByCommittee } from './team';

/** Which way along the list a committee or a seat is being moved. */
export type MoveDirection = 'up' | 'down';

/** The error code Postgres sends when an id is not a uuid at all. */
const INVALID_ID_CODE = '22P02';

/**
 * The committee columns the organiser's pages ask for.
 *
 * Longer than `COMMITTEE_COLUMNS` in `./committees.ts`, because the public page has no use for
 * `position` or the speaking time and the editor changes both.
 */
const MANAGED_COMMITTEE_COLUMNS =
	'id, slug, name, abbreviation, description, topics, level, room, position, default_speaking_time_seconds';

/** One `committees` row, under the database's own column names. */
type CommitteeRow = {
	id: string;
	slug: string;
	name: string;
	abbreviation: string | null;
	description: string | null;
	topics: string[];
	level: CommitteeLevel;
	room: string | null;
	position: number;
	default_speaking_time_seconds: number;
};

/**
 * The same row under the names the pages use.
 *
 * Only one column is really spelled differently, but renaming it in one place
 * keeps every page reading `defaultSpeakingTimeSeconds` and none of them the
 * database's own spelling.
 */
function toManagedCommitteeRow(row: CommitteeRow): ManagedCommitteeRow {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		abbreviation: row.abbreviation,
		description: row.description,
		topics: row.topics,
		level: row.level,
		room: row.room,
		position: row.position,
		defaultSpeakingTimeSeconds: row.default_speaking_time_seconds
	};
}

/** An empty optional field is saved as "no value" (`null`) rather than as empty text. */
function emptyToNull(text: string): string | null {
	return text === '' ? null : text;
}

/**
 * The speaking time as a number, because the form hands every field over as
 * text. The form's own checks in `$lib/committee-details.ts` have already
 * turned away anything that is not a whole number of seconds.
 */
function toSpeakingTimeSeconds(text: string): number {
	return Number(text);
}

/** The seat columns the editor reads, with the committee each seat belongs to. */
const MANAGED_SEAT_COLUMNS =
	'id, committee_id, name, kind, country_code, position, is_available, user_id, delegation_id';

/** One `seats` row as the organiser's pages read it: a `SeatRow` with its committee on it. */
type ManagedSeatRow = SeatRow & { committee_id: string };

/** The two name lookups a seat needs, made once for a whole list of seats. */
type SeatNames = {
	holders: Map<string, SeatHolder>;
	delegations: Map<string, string>;
};

/**
 * The delegates' and the delegations' names for these seats.
 *
 * Both lookups are the ones the public page already makes, for the reason
 * `readSeatHolders` and `readDelegationNames` in `./seat-holders.ts` give: PostgREST cannot
 * bring either table along from `seats`. Neither needs the other's answer, so
 * both start at once.
 */
async function readSeatNames(supabase: SupabaseClient, rows: SeatRow[]): Promise<SeatNames> {
	const [holders, delegations] = await Promise.all([
		readSeatHolders(supabase, rows),
		readDelegationNames(supabase, rows)
	]);

	return { holders, delegations };
}

/** What the seat itself says about its state, which is all the counting reads. */
type SeatState = Pick<ManagedSeat, 'isAvailable' | 'isFilled' | 'isReserved'>;

/**
 * Whether this seat is on offer, held, or being kept for a delegation.
 *
 * All three come off the seat row and none of them off a name. `user_id` is
 * what says somebody holds the seat; whether their name could be read is a
 * different question, and `summariseManagedSeats` in `$lib/committees.ts` says
 * what goes wrong when the two are treated as one.
 */
function toSeatState(row: SeatRow): SeatState {
	return {
		isAvailable: row.is_available,
		isFilled: row.user_id !== null,
		isReserved: row.user_id === null && row.delegation_id !== null
	};
}

/**
 * One seat as the editor's seats table shows it.
 *
 * `delegationName` is filled in whenever the seat belongs to a delegation, and
 * not only while it is still waiting for one of their members. That is where
 * this differs from the public page's `reservedForName`: an organiser looking
 * at a filled seat wants to see which school it went to. `isReserved` is the
 * narrower question, and is false as soon as somebody is sitting there.
 */
function toManagedSeat(row: ManagedSeatRow, names: SeatNames): ManagedSeat {
	const holder = holderOf(row, names.holders);
	const delegationName =
		row.delegation_id === null ? null : names.delegations.get(row.delegation_id);

	return {
		id: row.id,
		name: row.name,
		kind: row.kind,
		countryCode: row.country_code,
		position: row.position,
		...toSeatState(row),
		holderName: holder?.fullName ?? null,
		delegationName: delegationName ?? null
	};
}

/**
 * Every seat of these committees, in the organiser's own order.
 *
 * It reads the `seats` table and not the `public_seats` view, because the view
 * leaves out the seats the organiser has switched off and the organiser's pages
 * are the ones that have to show those too.
 */
async function readManagedSeatRows(
	supabase: SupabaseClient,
	committeeIds: string[]
): Promise<ManagedSeatRow[]> {
	const { data, error } = await supabase
		.from('seats')
		.select(MANAGED_SEAT_COLUMNS)
		.in('committee_id', committeeIds)
		// `position` is the order the organiser put the seats in.
		.order('position', { ascending: true })
		.overrideTypes<ManagedSeatRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the seats: ${error.message}`);
	}

	return data ?? [];
}

/**
 * How full each of these committees is, by committee id.
 *
 * No name is looked up here. The list page shows numbers and the editor shows
 * names, so only the editor pays for the two lookups those cost: this is one
 * query for a whole conference, where naming everybody would be three.
 *
 * The grouping is done here in TypeScript for the reason `countSeatsByCommittee`
 * in `./committees.ts` gives: PostgREST has no grouping of its own, and a conference has tens
 * of seats, not thousands. Only the grouping, though — the counting itself is
 * `summariseManagedSeats` in `$lib/committees.ts`, which the editor's own seats
 * table uses as well, so the two pages cannot disagree about one committee.
 *
 * A committee nobody has made seats for yet is simply missing from the map.
 */
async function countManagedSeatsByCommittee(
	supabase: SupabaseClient,
	committeeIds: string[]
): Promise<Map<string, ManagedSeatCounts>> {
	const rows = await readManagedSeatRows(supabase, committeeIds);
	const statesByCommittee = new Map<string, SeatState[]>();

	for (const row of rows) {
		const states = statesByCommittee.get(row.committee_id) ?? [];

		states.push(toSeatState(row));
		statesByCommittee.set(row.committee_id, states);
	}

	const counts = new Map<string, ManagedSeatCounts>();

	for (const [committeeId, states] of statesByCommittee) {
		counts.set(committeeId, summariseManagedSeats(states));
	}

	return counts;
}

/**
 * Every seat of one committee for the editor's table, with the delegate and the
 * delegation named.
 *
 * This is the page that shows the names, so this is where the two extra lookups
 * are made.
 */
async function readManagedSeats(
	supabase: SupabaseClient,
	committeeId: string
): Promise<ManagedSeat[]> {
	const rows = await readManagedSeatRows(supabase, [committeeId]);
	const names = await readSeatNames(supabase, rows);

	return rows.map((row) => toManagedSeat(row, names));
}

/**
 * Every committee of one conference for the organiser's list page, in their own
 * order, each with how full it is and who chairs it.
 *
 * Four queries however many committees there are: the committees, all of their
 * seats, all of their chairs, and the chairs' names. Nobody's name is read off a
 * seat, because this page shows numbers and only the editor shows names.
 */
export async function listCommitteesForManage(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<ManagedCommittee[]> {
	const { data, error } = await supabase
		.from('committees')
		.select(MANAGED_COMMITTEE_COLUMNS)
		.eq('conference_id', conferenceId)
		// `position` is the order the organiser put the committees in. Two
		// committees are allowed to share one, so `id` decides between them and
		// the list comes out the same way round on every refresh.
		.order('position', { ascending: true })
		.order('id', { ascending: true })
		.overrideTypes<CommitteeRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the committees: ${error.message}`);
	}

	const rows: CommitteeRow[] = data ?? [];

	// Nothing to count and nobody to look up, and `.in('committee_id', [])` would
	// be a pointless request.
	if (rows.length === 0) {
		return [];
	}

	const committeeIds = rows.map((row) => row.id);

	// None of these needs another's answer, so all three start at once.
	const [seatCountsByCommittee, chairNamesByCommittee, documentCountsByCommittee] =
		await Promise.all([
			countManagedSeatsByCommittee(supabase, committeeIds),
			listChairNamesByCommittee(supabase, committeeIds),
			countCommitteeDocuments(supabase, conferenceId)
		]);

	// A committee nobody has made seats for yet has no rows to count, which reads
	// as an empty committee rather than as a missing one.
	const emptyCounts: ManagedSeatCounts = { available: 0, filled: 0, reserved: 0, total: 0 };

	// A committee nobody has uploaded a single file for is missing from the
	// documents map in the same way, and reads as a committee with no guide and
	// no papers rather than as a missing one.
	const emptyDocumentCounts: CommitteeDocumentCounts = {
		hasBackgroundGuide: false,
		positionPaperCount: 0
	};

	return rows.map((row) => {
		const documentCounts = documentCountsByCommittee.get(row.id) ?? emptyDocumentCounts;

		return {
			...toManagedCommitteeRow(row),
			seatCounts: seatCountsByCommittee.get(row.id) ?? emptyCounts,
			chairNames: chairNamesByCommittee.get(row.id) ?? [],
			hasBackgroundGuide: documentCounts.hasBackgroundGuide,
			positionPaperCount: documentCounts.positionPaperCount
		};
	});
}

/** The committee the edit page is about, with the seats its table lists. */
export type CommitteeEditor = {
	committee: ManagedCommitteeRow;
	/** In the organiser's own order, the switched-off seats among them. */
	seats: ManagedSeat[];
};

/**
 * One committee of one conference for the edit page, with its seats, or `null`
 * when this conference has no committee with that id.
 *
 * The conference is part of the question and not only the committee, because
 * `specs/05-pages/organiser/committee-edit.md` says a `committeeId` belonging
 * to another conference is a 404 rather than a page an organiser can reach by
 * guessing an id.
 */
export async function getCommitteeForManage(
	supabase: SupabaseClient,
	conferenceId: string,
	committeeId: string
): Promise<CommitteeEditor | null> {
	const { data, error } = await supabase
		.from('committees')
		.select(MANAGED_COMMITTEE_COLUMNS)
		.eq('conference_id', conferenceId)
		.eq('id', committeeId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		.overrideTypes<CommitteeRow, { merge: false }>();

	// A malformed id is refused by Postgres rather than simply not found. It can
	// only come from an address somebody typed or edited by hand, and it names
	// nothing, so the page answers 404 like any other id it cannot find.
	if (error?.code === INVALID_ID_CODE) {
		return null;
	}

	if (error) {
		throw new Error(`Could not load the committee: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	const seats = await readManagedSeats(supabase, committeeId);

	return {
		committee: toManagedCommitteeRow(data),
		seats
	};
}

/**
 * Every committee link already in use in this conference, so the form can
 * refuse one that is taken.
 *
 * `exceptCommitteeId` leaves out the committee being edited: saving it without
 * changing its slug must not read as "already used".
 */
export async function listCommitteeSlugs(
	supabase: SupabaseClient,
	conferenceId: string,
	exceptCommitteeId?: string
): Promise<string[]> {
	// The query is built up in steps because the last condition is only there
	// sometimes. Nothing is sent to the database until it is awaited below.
	let query = supabase.from('committees').select('slug').eq('conference_id', conferenceId);

	if (exceptCommitteeId) {
		query = query.neq('id', exceptCommitteeId);
	}

	const { data, error } = await query.overrideTypes<{ slug: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the committee links: ${error.message}`);
	}

	const rows: { slug: string }[] = data ?? [];

	return rows.map((row) => row.slug);
}

/**
 * `planned_seat_count` as a column to write, or nothing at all. Only the
 * creation Setup step knows a committee's planned seats; the Manage pages
 * leave the argument out, and leaving the column out of their writes keeps
 * whatever the Setup step saved.
 */
function plannedSeatColumn(plannedSeatCount: number | null | undefined) {
	return plannedSeatCount === undefined ? {} : { planned_seat_count: plannedSeatCount };
}

/**
 * Add a committee to a conference and answer with its new id, which the page
 * needs for the link to the editor it sends the organiser to next.
 *
 * `position` is where the committee goes in the organiser's list: the page
 * passes the number of committees there already are, so a new one lands at the
 * bottom.
 *
 * Nothing here writes the committee's `committee_state` row, and nothing needs
 * to: the `create_committee_state` trigger added in T39 writes it as part of
 * this same insert, so a committee never exists without the row every page in
 * the committee room reads.
 */
export async function createCommittee(
	supabase: SupabaseClient,
	conferenceId: string,
	values: CommitteeFormValues,
	position: number,
	plannedSeatCount?: number | null
): Promise<string> {
	const { data, error } = await supabase
		.from('committees')
		.insert({
			...plannedSeatColumn(plannedSeatCount),
			conference_id: conferenceId,
			slug: values.slug,
			name: values.name,
			abbreviation: emptyToNull(values.abbreviation),
			description: emptyToNull(values.description),
			topics: values.topics,
			level: values.level,
			room: emptyToNull(values.room),
			position,
			default_speaking_time_seconds: toSpeakingTimeSeconds(values.defaultSpeakingTimeSeconds)
		})
		// Ask for the id of the new row back, as a single object rather than a list.
		.select('id')
		.single();

	if (error) {
		throw new Error(`Could not create the committee: ${error.message}`);
	}

	const row: { id: string } = data;

	return row.id;
}

/**
 * Save every column the committee form can change.
 *
 * Two columns of the table are deliberately missing. `conference_id` is not
 * written because a committee never moves between conferences: migration 0009's
 * `protect_committees_columns` trigger refuses an update that moves one, so
 * sending even the conference it already belongs to would be asking for
 * trouble. `position` is not written because `moveCommittee` below owns it, and
 * the arrows on the list page are the only thing that changes it.
 */
export async function updateCommittee(
	supabase: SupabaseClient,
	committeeId: string,
	values: CommitteeFormValues,
	plannedSeatCount?: number | null
): Promise<void> {
	const { error } = await supabase
		.from('committees')
		.update({
			...plannedSeatColumn(plannedSeatCount),
			slug: values.slug,
			name: values.name,
			abbreviation: emptyToNull(values.abbreviation),
			description: emptyToNull(values.description),
			topics: values.topics,
			level: values.level,
			room: emptyToNull(values.room),
			default_speaking_time_seconds: toSpeakingTimeSeconds(values.defaultSpeakingTimeSeconds)
		})
		.eq('id', committeeId);

	if (error) {
		throw new Error(`Could not save the committee: ${error.message}`);
	}
}

/**
 * Save only a committee's description and agenda: what somebody who edits
 * this one committee may change (`manage_committees` held per committee).
 * The database's `protect_committees_columns` refuses them any other column,
 * so nothing else is sent, not even unchanged.
 */
export async function updateCommitteeAgenda(
	supabase: SupabaseClient,
	committeeId: string,
	values: Pick<CommitteeFormValues, 'description' | 'topics'>
): Promise<void> {
	const { error } = await supabase
		.from('committees')
		.update({ description: emptyToNull(values.description), topics: values.topics })
		.eq('id', committeeId);

	if (error) {
		throw new Error(`Could not save the committee: ${error.message}`);
	}
}

/**
 * Delete a committee with its seats, and answer whether it went.
 *
 * `false` means Row Level Security refused, which it does for a committee with
 * a seat somebody sits in or a delegation holds (migration 20261023120000). A
 * refused delete is not an error: the policy hides the row, so nothing matches,
 * nothing is deleted and no message comes back. Asking for the ids of what was
 * deleted with `.select('id')` is what tells the two apart.
 */
export async function deleteCommittee(
	supabase: SupabaseClient,
	committeeId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('committees')
		.delete()
		.eq('id', committeeId)
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not delete the committee: ${error.message}`);
	}

	const deleted: { id: string }[] = data ?? [];

	return deleted.length > 0;
}

/** One `committees` row while it is being moved: only where it sits in the list matters. */
type CommitteePositionRow = {
	id: string;
	position: number;
};

/**
 * Where this committee sits in its conference's list, or `null` when that
 * conference has no committee with that id.
 *
 * The conference is part of the question for the same reason it is in
 * `getCommitteeForManage`: an id from somebody else's conference must move
 * nothing.
 */
async function readCommitteePosition(
	supabase: SupabaseClient,
	conferenceId: string,
	committeeId: string
): Promise<CommitteePositionRow | null> {
	const { data, error } = await supabase
		.from('committees')
		.select('id, position')
		.eq('conference_id', conferenceId)
		.eq('id', committeeId)
		.maybeSingle()
		.overrideTypes<CommitteePositionRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committee's place in the list: ${error.message}`);
	}

	return data ?? null;
}

/**
 * The committee just above or just below this one in the same conference, or
 * `null` when this one is already at the end it is being moved towards.
 *
 * Up the list is towards the lower positions, so the neighbour above is the one
 * with the highest position below this one, and the neighbour below is the
 * other way round. Two committees are allowed to share a position, so `id`
 * decides between them here as well, which is the tie-break
 * `listCommitteesForManage` puts the list in order by.
 */
async function readCommitteeNeighbour(
	supabase: SupabaseClient,
	conferenceId: string,
	position: number,
	direction: MoveDirection
): Promise<CommitteePositionRow | null> {
	let query = supabase.from('committees').select('id, position').eq('conference_id', conferenceId);

	if (direction === 'up') {
		query = query
			.lt('position', position)
			.order('position', { ascending: false })
			.order('id', { ascending: false });
	} else {
		query = query
			.gt('position', position)
			.order('position', { ascending: true })
			.order('id', { ascending: true });
	}

	const { data, error } = await query
		.limit(1)
		.maybeSingle()
		.overrideTypes<CommitteePositionRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not find the committee to swap with: ${error.message}`);
	}

	return data ?? null;
}

/** Write one committee's place in the organiser's list. */
async function setCommitteePosition(
	supabase: SupabaseClient,
	committeeId: string,
	position: number
): Promise<void> {
	const { error } = await supabase.from('committees').update({ position }).eq('id', committeeId);

	if (error) {
		throw new Error(`Could not move the committee: ${error.message}`);
	}
}

/**
 * Move a committee one place up or down the organiser's list.
 *
 * It is a swap: the committee and its neighbour trade positions, which is one
 * pair of statements and leaves every other committee alone. A committee
 * already at the end it is being moved towards has no neighbour, and then
 * nothing happens at all, which is what the arrow at the end of the list does.
 */
export async function moveCommittee(
	supabase: SupabaseClient,
	conferenceId: string,
	committeeId: string,
	direction: MoveDirection
): Promise<void> {
	const committee = await readCommitteePosition(supabase, conferenceId, committeeId);

	if (!committee) {
		return;
	}

	const neighbour = await readCommitteeNeighbour(
		supabase,
		conferenceId,
		committee.position,
		direction
	);

	if (!neighbour) {
		return;
	}

	// Neither update needs the other's answer, so both start at once.
	await Promise.all([
		setCommitteePosition(supabase, committee.id, neighbour.position),
		setCommitteePosition(supabase, neighbour.id, committee.position)
	]);
}
