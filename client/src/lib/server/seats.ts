/**
 * Where the seats section of the committee editor gets its data: one seat on
 * its own, and every change an organiser makes to a committee's list of them.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument. Pages pass in `locals.supabase`, the client that knows who is
 * signed in, so the `seats` policies decide what each call is allowed to do:
 * an organiser may rename, reorder and hide a seat in their own conference but
 * never write who sits in it or move it to another committee, and may only
 * delete one that nobody sits in and no delegation holds (migrations
 * 20261022110000 and 20261023120000).
 *
 * Reading a whole committee's seats is `getCommitteeForManage` in
 * `./manage-committees.ts`, which is where the editor's seats table comes from. This
 * file is the one seat a page asks about before it hides or deletes it, and the
 * writes themselves. Putting somebody in a seat is `./seat-acceptance.ts`, and
 * the allocation grid, where seats are freed and delegates moved, is
 * `./allocation-grid.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ManagedSeat, SeatKind } from '$lib/committees';
import type { MoveDirection } from './manage-committees';

/** The seat columns this file reads. The same list as the editor's, without the committee. */
const SEAT_COLUMNS = 'id, name, kind, country_code, position, is_available, user_id, delegation_id';

/** One `seats` row, under the database's own column names. */
type SeatRow = {
	id: string;
	name: string;
	kind: SeatKind;
	country_code: string | null;
	position: number;
	is_available: boolean;
	/** The delegate sitting in the seat, or `null` while it is free. */
	user_id: string | null;
	/** The delegation the seat belongs to, or `null`. */
	delegation_id: string | null;
};

/**
 * The name of whoever is sitting in this seat, or `null` when it is free.
 *
 * `./seat-holders.ts` looks the delegates up a list at a time and answers with a
 * map, because its pages read whole committees at once. One seat needs one
 * name, and asking for it straight is easier to read than building a list of
 * one, so this is a second, smaller lookup rather than a shared one.
 *
 * It is a query of its own because nothing in the schema joins `seats` to
 * `profiles`: `seats.user_id` points at `auth.users`, and PostgREST can only
 * bring along a table that a foreign key actually names.
 *
 * A name that does not come back is left as `null` rather than raised, the way
 * the team lists in `./team.ts` treat a missing profile: the page still knows
 * from the seat itself that somebody is in it.
 */
async function readHolderName(
	supabase: SupabaseClient,
	userId: string | null
): Promise<string | null> {
	if (userId === null) {
		return null;
	}

	const { data } = await supabase
		.from('profiles')
		.select('full_name')
		.eq('id', userId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ full_name: string }, { merge: false }>();

	return data?.full_name ?? null;
}

/**
 * The name of the delegation this seat belongs to, or `null` when it belongs to
 * none.
 *
 * A second query for the same reason `readHolderName` above is one, and a
 * missing name is treated the same way. It asks the `participant_delegations`
 * view, which names a delegation to everybody who may know of it without
 * handing over its join code, so a chair editing their committee's seats
 * reads the same name an organiser does (see `readDelegationNames` in
 * `./seat-holders.ts`).
 */
async function readDelegationName(
	supabase: SupabaseClient,
	delegationId: string | null
): Promise<string | null> {
	if (delegationId === null) {
		return null;
	}

	const { data } = await supabase
		.from('participant_delegations')
		.select('name')
		.eq('id', delegationId)
		.maybeSingle()
		.overrideTypes<{ name: string }, { merge: false }>();

	return data?.name ?? null;
}

/**
 * One seat of one committee, or `null` when that committee has no seat with
 * that id.
 *
 * The committee is part of the question and not only the seat, so a seat id
 * from another committee is nothing rather than a seat an organiser can change
 * by guessing an id.
 *
 * `isFilled` and `isReserved` are what the page's "Free the seat first" check
 * asks about, and both come off the seat row itself. The delegate's and the
 * delegation's names come along so that the page can say who has it, but a name
 * that could not be read never makes a held seat look free
 * (`specs/05-pages/organiser/committee-edit.md`).
 */
export async function getSeat(
	supabase: SupabaseClient,
	committeeId: string,
	seatId: string
): Promise<ManagedSeat | null> {
	const { data, error } = await supabase
		.from('seats')
		.select(SEAT_COLUMNS)
		.eq('committee_id', committeeId)
		.eq('id', seatId)
		.maybeSingle()
		.overrideTypes<SeatRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the seat: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	// Neither name needs the other's answer, so both start at once.
	const [holderName, delegationName] = await Promise.all([
		readHolderName(supabase, data.user_id),
		readDelegationName(supabase, data.delegation_id)
	]);

	return {
		id: data.id,
		name: data.name,
		kind: data.kind,
		countryCode: data.country_code,
		position: data.position,
		isAvailable: data.is_available,
		isFilled: data.user_id !== null,
		// A seat is only being held for a delegation while nobody is sitting in it.
		// Once the delegation names somebody it is a filled seat like any other.
		isReserved: data.user_id === null && data.delegation_id !== null,
		holderName,
		delegationName
	};
}

/** What the committee already has: the names it uses, and where its list ends. */
type ExistingSeats = {
	/** In lower case, because two seats are the same seat whatever the spelling. */
	names: Set<string>;
	/** The highest `position` in use, or -1 for a committee with no seats at all. */
	highestPosition: number;
};

/** The names and places of the seats a committee already has. */
async function readExistingSeats(
	supabase: SupabaseClient,
	committeeId: string
): Promise<ExistingSeats> {
	const { data, error } = await supabase
		.from('seats')
		.select('name, position')
		.eq('committee_id', committeeId)
		.overrideTypes<{ name: string; position: number }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the seats this committee already has: ${error.message}`);
	}

	const rows: { name: string; position: number }[] = data ?? [];
	const names = new Set<string>();
	let highestPosition = -1;

	for (const row of rows) {
		names.add(row.name.toLowerCase());
		highestPosition = Math.max(highestPosition, row.position);
	}

	return { names, highestPosition };
}

/** One new row for the `seats` table. */
type NewSeatRow = {
	committee_id: string;
	name: string;
	kind: SeatKind;
	country_code: string | null;
	position: number;
};

/** One seat about to be added, as the editor and the ready-made lists both describe it. */
export type NewSeat = {
	name: string;
	countryCode: string | null;
	/** Left out, a seat with a country code is a `country` and everything else is `other`. */
	kind?: SeatKind;
};

/**
 * What kind of seat to store.
 *
 * The editor's own form has a "Kind" dropdown, and what it picked is what is
 * saved, so an observer seat is stored as an observer. The three ready-made
 * country lists in `$lib/seat-lists.ts` say nothing about the kind, and for
 * those the country code decides: a seat with one is a country, and anything
 * else is a character or a role, which the database's `seat_kind` calls `other`.
 */
function seatKindOf(seat: NewSeat): SeatKind {
	if (seat.kind) {
		return seat.kind;
	}

	if (seat.countryCode === null) {
		return 'other';
	}

	return 'country';
}

/** How an "add seats" run went: what went in, and what the committee already had. */
export type AddSeatsResult = {
	addedCount: number;
	/** The seats that were skipped because the committee already has that name. */
	existingCount: number;
};

/**
 * Add a list of seats to one committee, skipping the names it already has, and
 * say how many of each there were.
 *
 * A name that is already there is not an error. An organiser pressing "Add UN
 * member states" on a committee that has half of them expects the other half to
 * appear, which is why the skipped ones are counted rather than refused
 * (`specs/05-pages/organiser/committee-edit.md`).
 *
 * Names are compared without their case, because "France" and "france" are the
 * same seat to a reader, but what is stored is the spelling that was handed in.
 * A seat may say what kind it is, and `seatKindOf` above says what happens when
 * it does not, which is what the ready-made country lists rely on.
 *
 * The new seats carry on from the highest position the committee has, so they
 * land at the bottom of the list in the order they arrived in.
 */
export async function addSeats(
	supabase: SupabaseClient,
	committeeId: string,
	seats: NewSeat[]
): Promise<AddSeatsResult> {
	// Nothing to add, and an insert of no rows would be a pointless request.
	if (seats.length === 0) {
		return { addedCount: 0, existingCount: 0 };
	}

	const existing = await readExistingSeats(supabase, committeeId);
	const seatsToAdd: NewSeat[] = [];

	for (const seat of seats) {
		const name = seat.name.toLowerCase();

		if (existing.names.has(name)) {
			continue;
		}

		// Remembering the name here skips one that is twice over in the list handed
		// in as well, which the unique index on (committee_id, name) would refuse.
		existing.names.add(name);
		seatsToAdd.push(seat);
	}

	const existingCount = seats.length - seatsToAdd.length;

	if (seatsToAdd.length === 0) {
		return { addedCount: 0, existingCount };
	}

	const rows: NewSeatRow[] = seatsToAdd.map((seat, index) => ({
		committee_id: committeeId,
		name: seat.name,
		kind: seatKindOf(seat),
		country_code: seat.countryCode,
		position: existing.highestPosition + 1 + index
	}));

	const { error } = await supabase.from('seats').insert(rows);

	if (error) {
		throw new Error(`Could not add the seats: ${error.message}`);
	}

	return { addedCount: seatsToAdd.length, existingCount };
}

/**
 * Offer this seat, or take it off the list without losing its place.
 *
 * `is_available` is how an organiser hides a seat they are not offering this
 * year: the seat keeps its position and its name, and `public_seats` leaves it
 * out. Whether the seat may be hidden at all is the page's question, which asks
 * `getSeat` first, because a filled or reserved one has to be freed instead.
 *
 * It goes through the database function `set_seat_availability` rather than
 * an update, because the allocation grid hides seats for whoever decides
 * applications, who may not change anything else about a seat.
 */
export async function setSeatAvailability(
	supabase: SupabaseClient,
	seatId: string,
	isAvailable: boolean
): Promise<void> {
	const { error } = await supabase.rpc('set_seat_availability', {
		seat_id: seatId,
		is_available: isAvailable
	});

	if (error) {
		throw new Error(`Could not change the seat: ${error.message}`);
	}
}

/** One `seats` row while it is being moved: only where it sits in the list matters. */
type SeatPositionRow = {
	id: string;
	position: number;
};

/**
 * Where this seat sits in its committee's list, or `null` when that committee
 * has no seat with that id.
 */
async function readSeatPosition(
	supabase: SupabaseClient,
	committeeId: string,
	seatId: string
): Promise<SeatPositionRow | null> {
	const { data, error } = await supabase
		.from('seats')
		.select('id, position')
		.eq('committee_id', committeeId)
		.eq('id', seatId)
		.maybeSingle()
		.overrideTypes<SeatPositionRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the seat's place in the list: ${error.message}`);
	}

	return data ?? null;
}

/**
 * The seat just above or just below this one in the same committee, or `null`
 * when this one is already at the end it is being moved towards.
 *
 * Up the list is towards the lower positions, so the neighbour above is the
 * seat with the highest position below this one, and the neighbour below is the
 * other way round. Two seats are allowed to share a position, so `id` decides
 * between them, the same tie-break the lists are put in order by.
 */
async function readSeatNeighbour(
	supabase: SupabaseClient,
	committeeId: string,
	position: number,
	direction: MoveDirection
): Promise<SeatPositionRow | null> {
	let query = supabase.from('seats').select('id, position').eq('committee_id', committeeId);

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
		.overrideTypes<SeatPositionRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not find the seat to swap with: ${error.message}`);
	}

	return data ?? null;
}

/** Write one seat's place in the committee's list. */
async function setSeatPosition(
	supabase: SupabaseClient,
	seatId: string,
	position: number
): Promise<void> {
	const { error } = await supabase.from('seats').update({ position }).eq('id', seatId);

	if (error) {
		throw new Error(`Could not move the seat: ${error.message}`);
	}
}

/**
 * Move a seat one place up or down its committee's list.
 *
 * The same swap `moveCommittee` in `./manage-committees.ts` makes one level up: the
 * seat and its neighbour trade positions, which is one pair of statements and
 * leaves every other seat alone. A seat already at the end it is being moved
 * towards has no neighbour, and then nothing happens at all.
 */
export async function moveSeat(
	supabase: SupabaseClient,
	committeeId: string,
	seatId: string,
	direction: MoveDirection
): Promise<void> {
	const seat = await readSeatPosition(supabase, committeeId, seatId);

	if (!seat) {
		return;
	}

	const neighbour = await readSeatNeighbour(supabase, committeeId, seat.position, direction);

	if (!neighbour) {
		return;
	}

	// Neither update needs the other's answer, so both start at once.
	await Promise.all([
		setSeatPosition(supabase, seat.id, neighbour.position),
		setSeatPosition(supabase, neighbour.id, seat.position)
	]);
}

/**
 * Delete a seat and answer whether it went.
 *
 * `false` means Row Level Security refused. The `seats` delete policy only
 * allows a seat that nobody sits in and no delegation holds, so a delegate's
 * seat stays where it is (migration 20261023120000), and the page turns the
 * `false` into "You cannot delete a seat that is filled or reserved."
 *
 * A refused delete is not an error: the policy hides the row, so nothing
 * matches, nothing is deleted and no message comes back. Asking for the ids of
 * what was deleted with `.select('id')` is what tells the two apart.
 */
export async function deleteSeat(supabase: SupabaseClient, seatId: string): Promise<boolean> {
	const { data, error } = await supabase
		.from('seats')
		.delete()
		.eq('id', seatId)
		.select('id')
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not delete the seat: ${error.message}`);
	}

	const deleted: { id: string }[] = data ?? [];

	return deleted.length > 0;
}
