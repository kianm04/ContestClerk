/**
 * The organiser's allocation grid at `/manage/[slug]/allocation`, where every
 * seat of every committee is on one screen and the gaps get fixed: a seat
 * freed, a delegate moved, a seat hidden.
 *
 * What the grid makes of these rows — the counts at the top, the filters and
 * the colour of a cell — is `$lib/allocation.ts`, so nothing here decides what
 * a seat's state means. The three functions that change a seat are thin
 * wrappers over database functions, for the reason `acceptApplication` in
 * `./seat-acceptance.ts` gives. The participants page frees seats through
 * `freeSeat` here too, and withdrawing an acceptance in
 * `./application-review.ts` goes through `revokeSeat`.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument, the way `./seats.ts` explains.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ALREADY_FREE_REFUSAL, type GridSeat } from '$lib/allocation';
import { removeOrphanedDocumentFiles } from './orphaned-document-files';

/**
 * The sentence written on the application of a delegate whose seat the
 * organisers took back. `specs/05-pages/organiser/allocation.md` asks for these
 * exact words, so they live in one place rather than in the page as well.
 */
const SEAT_RELEASED_NOTE = 'Seat released by the organisers';

/**
 * The columns the grid reads.
 *
 * `committees!inner(...)` is here for the same reason `listFreeSeats` in
 * `./seat-acceptance.ts` has it: `seats` has no `conference_id` of its own,
 * and without the `!inner` the filter on `committees.conference_id` would not
 * narrow which seats come back.
 * The committee's own columns come along with it, because each column of the
 * grid is a committee and needs its name.
 *
 * `delegations(name)` can be embedded because `seats.delegation_id` really is a
 * foreign key naming `delegations`, which is what PostgREST needs before it
 * will bring a table along. The delegate's name cannot be, which is what
 * `readSeatHolderProfiles` below is for.
 */
const GRID_SEAT_COLUMNS =
	'id, committee_id, name, country_code, is_available, user_id, delegation_id, application_id, committees!inner(conference_id, id, name, abbreviation, position), delegations(name)';

/**
 * How many rows one query of the allocation grid asks for at a time: the seats
 * and the accepted delegations. `supabase/config.toml` sets `max_rows = 1000`,
 * and PostgREST answers with no more than that whatever it is asked, so the
 * grid reads a window at a time until one comes back empty.
 * `readConferenceInvoiceRows` in `./invoices.ts` does the same.
 */
const GRID_READ_BATCH_SIZE = 500;

/**
 * How many user ids one `.in(...)` lookup of the delegates' profiles asks
 * about. A hundred uuids is about four kilobytes of address, which nothing
 * objects to; every delegate of a large conference in one request would not
 * be, and would meet `max_rows` as well.
 */
const HOLDER_LOOKUP_BATCH_SIZE = 100;

/** The error code Supabase sends when a window starts past the last row. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

/** One `seats` row as the grid asks for it, under the database's own column names. */
type GridSeatRow = {
	id: string;
	committee_id: string;
	name: string;
	country_code: string | null;
	is_available: boolean;
	/** The delegate sitting in the seat, or `null` while nobody is in it. */
	user_id: string | null;
	/** The delegation the seat is held for, or `null`. */
	delegation_id: string | null;
	/** The application that won this seat, or `null` for a delegation's seat. */
	application_id: string | null;
	/** One committee rather than a list, because a seat belongs to exactly one. */
	committees: {
		conference_id: string;
		id: string;
		name: string;
		abbreviation: string | null;
		position: number;
	};
	/** `null` when the seat is held for nobody. */
	delegations: { name: string } | null;
};

/** One `profiles` row, with everything a filled cell of the grid shows of a person. */
type HolderProfileRow = {
	id: string;
	full_name: string;
	avatar_path: string | null;
	country_code: string | null;
	institution_name: string | null;
};

/** One person sitting in a seat, as the grid's cell shows them. */
type SeatHolder = {
	fullName: string;
	avatarPath: string | null;
	countryCode: string | null;
	/** The school or university on their profile, shown under their name. */
	institutionName: string | null;
};

/**
 * The people sitting in these seats, by user id.
 *
 * It is a second query for the reason `readHolderName` in `./seats.ts` already
 * gives: `seats.user_id` points at `auth.users` and not at `profiles`, and
 * PostgREST can only bring along a table that a foreign key actually names.
 * This is the list-at-a-time version, the way `readSeatsPageProfiles` in
 * `./delegations.ts` reads a delegation's people, because the grid reads a whole
 * conference at once. The ids are asked about `HOLDER_LOOKUP_BATCH_SIZE` at a
 * time, so that a conference with thousands of delegates is neither one very
 * long address nor an answer cut short at `max_rows`.
 *
 * A profile that does not come back is simply not in the map, and the seat it
 * belongs to keeps a `holderName` of `null`, which is how `readHolderName`
 * treats the same case: the grid still knows from the seat itself that somebody
 * is in it.
 */
async function readSeatHolderProfiles(
	supabase: SupabaseClient,
	rows: GridSeatRow[]
): Promise<Map<string, SeatHolder>> {
	const holders = new Map<string, SeatHolder>();
	// A set, because one person can only hold one seat in a conference but two
	// rows of a failed allocation could still name them, and asking twice for
	// the same id would be a longer request for the same answer.
	const holderIds = new Set<string>();

	for (const row of rows) {
		if (row.user_id !== null) {
			holderIds.add(row.user_id);
		}
	}

	// Nobody to look up, and `.in('id', [])` would be a request that cannot match
	// anything.
	if (holderIds.size === 0) {
		return holders;
	}

	const allHolderIds = Array.from(holderIds);

	for (
		let firstIndex = 0;
		firstIndex < allHolderIds.length;
		firstIndex += HOLDER_LOOKUP_BATCH_SIZE
	) {
		const batchIds = allHolderIds.slice(firstIndex, firstIndex + HOLDER_LOOKUP_BATCH_SIZE);

		const { data, error } = await supabase
			.from('profiles')
			.select('id, full_name, avatar_path, country_code, institution_name')
			.in('id', batchIds)
			// Replaces Supabase's guess at the row's shape with ours. It has to come last.
			.overrideTypes<HolderProfileRow[], { merge: false }>();

		// Anybody signed in may read every profile, so a failure here is a fault
		// rather than a rule turning the organiser away.
		if (error) {
			throw new Error(`Could not read the delegates' names: ${error.message}`);
		}

		for (const row of data ?? []) {
			holders.set(row.id, {
				fullName: row.full_name,
				avatarPath: row.avatar_path,
				countryCode: row.country_code,
				institutionName: row.institution_name
			});
		}
	}

	return holders;
}

/**
 * Every seat row of one conference, however many there are.
 *
 * PostgREST answers with at most `max_rows` rows whatever is asked of it, so
 * this asks for `GRID_READ_BATCH_SIZE` rows at a time and moves the window
 * along by however many really came back, until one comes back empty or
 * starts past the end (`PGRST103`). Moving by what arrived rather than by the
 * size asked for is what keeps a row from being stepped over if `max_rows` is
 * ever set below the batch size; `readApplicationsForExport` in
 * `./application-table.ts` explains the same.
 *
 * The windows only line up if every refresh sorts the seats exactly the same
 * way, so the seat's id comes last in the order: two committees may share a
 * `position`, and then two seats in them may share a position and a name.
 */
async function readGridSeatRows(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<GridSeatRow[]> {
	const rows: GridSeatRow[] = [];
	let firstIndex = 0;

	while (true) {
		const { data, error } = await supabase
			.from('seats')
			.select(GRID_SEAT_COLUMNS)
			.eq('committees.conference_id', conferenceId)
			.order('committees(position)', { ascending: true })
			.order('position', { ascending: true })
			.order('name', { ascending: true })
			.order('id', { ascending: true })
			.range(firstIndex, firstIndex + GRID_READ_BATCH_SIZE - 1)
			// Replaces Supabase's guess at the row's shape with ours. It has to come last.
			.overrideTypes<GridSeatRow[], { merge: false }>();

		// The window starts past the last row, which is the end of the list.
		if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
			return rows;
		}

		if (error) {
			throw new Error(`Could not read the seats: ${error.message}`);
		}

		const batch = data ?? [];

		if (batch.length === 0) {
			return rows;
		}

		rows.push(...batch);
		firstIndex = firstIndex + batch.length;
	}
}

/**
 * Every seat of one conference, with whoever is in it, for the allocation grid.
 *
 * This is the grid's one read: the page filters and counts what comes back
 * rather than asking again, so the numbers at the top and the cells below can
 * never disagree. It is every seat and not the first thousand: the grid has no
 * pager, because it draws a column per committee rather than a table, so the
 * rows are read in windows by `readGridSeatRows` above and the counts are
 * still made over the whole conference.
 *
 * The order is the committee's `position` first, so that the columns come out
 * in the order the organiser put their committees in, then the seat's own
 * `position` and then its name. Two seats are allowed to share a position, so
 * the name settles those and the grid comes out the same way round on every
 * refresh. `order=committees(position)` is PostgREST sorting the seats by a
 * column of the committee each one belongs to, which it can only do because the
 * committee is embedded with `!inner`.
 */
export async function listSeatsWithHolders(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<GridSeat[]> {
	const rows = await readGridSeatRows(supabase, conferenceId);
	const holders = await readSeatHolderProfiles(supabase, rows);

	return rows.map((row) => {
		const holder = row.user_id === null ? undefined : holders.get(row.user_id);

		return {
			id: row.id,
			committeeId: row.committee_id,
			name: row.name,
			countryCode: row.country_code,
			isAvailable: row.is_available,
			delegationId: row.delegation_id,
			userId: row.user_id,
			applicationId: row.application_id,
			committee: {
				id: row.committees.id,
				name: row.committees.name,
				abbreviation: row.committees.abbreviation
			},
			holderName: holder?.fullName ?? null,
			holderAvatarPath: holder?.avatarPath ?? null,
			holderCountryCode: holder?.countryCode ?? null,
			holderInstitution: holder?.institutionName ?? null,
			delegationName: row.delegations?.name ?? null
		};
	});
}

/** An accepted delegation that has fewer seats than it asked for. */
export type UnseatedDelegation = {
	id: string;
	name: string;
	/** The delegation's flag, `delegations.country_code`, or null when it has none. */
	countryCode: string | null;
	requestedSeats: number;
	/** How many seats of this conference carry this delegation's id. */
	allocatedSeats: number;
};

/** One `delegations` row with the seats reserved for it counted, as it comes back. */
type AcceptedDelegationRow = {
	id: string;
	name: string;
	country_code: string | null;
	requested_seats: number;
	/** One entry per seat held for this delegation, whether or not somebody is in it. */
	seats: { id: string }[];
};

/**
 * Every accepted delegation of one conference, however many there are, with the
 * seats held for each.
 *
 * Read a window at a time for the reason `readGridSeatRows` gives, so that the
 * warning at the top of the grid is not missing a delegation that happened to
 * sort after the thousandth. The id comes after the name in the order because
 * two delegations may share a name, and the windows only line up if every
 * request sorts them the same way.
 */
async function readAcceptedDelegationRows(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<AcceptedDelegationRow[]> {
	const rows: AcceptedDelegationRow[] = [];
	let firstIndex = 0;

	while (true) {
		const { data, error } = await supabase
			.from('delegations')
			.select('id, name, country_code, requested_seats, seats(id)')
			.eq('conference_id', conferenceId)
			.eq('status', 'accepted')
			.order('name', { ascending: true })
			.order('id', { ascending: true })
			.range(firstIndex, firstIndex + GRID_READ_BATCH_SIZE - 1)
			// Replaces Supabase's guess at the row's shape with ours. It has to come last.
			.overrideTypes<AcceptedDelegationRow[], { merge: false }>();

		// The window starts past the last row, which is the end of the list.
		if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
			return rows;
		}

		if (error) {
			throw new Error(`Could not read the accepted delegations: ${error.message}`);
		}

		const batch = data ?? [];

		if (batch.length === 0) {
			return rows;
		}

		rows.push(...batch);
		firstIndex = firstIndex + batch.length;
	}
}

/**
 * The accepted delegations still short of the seats they asked for.
 *
 * This is the warning at the top of the grid. A request is a wish and not a
 * limit (`specs/06-features/allocation.md`), so a delegation that was given
 * more seats than it asked for is not short and is left out, the same as one
 * given exactly as many.
 *
 * `seats(id)` can be embedded because `seats.delegation_id` really is a foreign
 * key naming `delegations`, which is what PostgREST needs before it will bring
 * a table along.
 */
export async function listUnseatedAcceptedDelegations(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<UnseatedDelegation[]> {
	const rows = await readAcceptedDelegationRows(supabase, conferenceId);
	const unseated: UnseatedDelegation[] = [];

	for (const row of rows) {
		const allocatedSeats = row.seats.length;

		if (allocatedSeats < row.requested_seats) {
			unseated.push({
				id: row.id,
				name: row.name,
				countryCode: row.country_code,
				requestedSeats: row.requested_seats,
				allocatedSeats
			});
		}
	}

	return unseated;
}

/**
 * Whether the bill for this seat has already been paid.
 *
 * It has to be asked *before* the seat is freed. `revoke_seat` voids an unpaid
 * invoice for the seat and leaves a paid one alone, and the organiser has to be
 * told which of the two happened; once the seat is free the invoice no longer
 * points at it and the question can no longer be answered.
 *
 * One row is enough to answer, so the query stops at one rather than counting.
 */
export async function hasPaidInvoiceForSeat(
	supabase: SupabaseClient,
	seatId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('invoices')
		.select('id')
		.eq('seat_id', seatId)
		.eq('status', 'paid')
		.limit(1)
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<{ id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the invoice for this seat: ${error.message}`);
	}

	const paidInvoices: { id: string }[] = data ?? [];

	return paidInvoices.length > 0;
}

/**
 * Takes the delegate out of a seat: the `revoke_seat` function.
 *
 * It rejects their application with the date and the decider, clears
 * `user_id` and `application_id`, voids an unpaid invoice for the seat and
 * leaves a paid one alone, and deletes their position paper, whose file
 * `removeOrphanedDocumentFiles` then takes out of the bucket. `delegation_id` is
 * kept, so a delegation's seat stays reserved for the delegation.
 *
 * `revoke_seat` is a security definer function, so everything it checks — that
 * the seat exists, that the caller manages the conference, that somebody is
 * really in it — is checked in the database and raises there. The message is
 * passed on as it is, for the reason `acceptApplication` in
 * `./seat-acceptance.ts` gives: the page shows the function's own sentence to
 * the organiser.
 */
export async function revokeSeat(supabase: SupabaseClient, seatId: string): Promise<void> {
	const { error } = await supabase.rpc('revoke_seat', { seat_id: seatId });

	if (error) {
		throw new Error(error.message);
	}

	// `revoke_seat` deleted the position paper's row but cannot reach the file,
	// so the service role removes it from the bucket now (T96).
	await removeOrphanedDocumentFiles();
}

/**
 * Takes a delegation's reservation off an empty seat: the
 * `remove_delegation_seat` function.
 *
 * It refuses a seat somebody is sitting in, with "Somebody is sitting in that
 * seat. Revoke it instead.", which is why `freeSeat` below chooses between the
 * two. The message is passed on unchanged, the same way `revokeSeat` above
 * passes its own on.
 */
export async function removeDelegationSeat(
	supabase: SupabaseClient,
	seatId: string
): Promise<void> {
	const { error } = await supabase.rpc('remove_delegation_seat', { seat_id: seatId });

	if (error) {
		throw new Error(error.message);
	}
}

/**
 * Moves whoever is in one seat into another: the `move_delegate` function.
 *
 * The old seat is freed before the new one is filled, and the delegate keeps
 * their application or their delegation and their invoice. The message is
 * passed on unchanged, the same way `revokeSeat` above passes its own on:
 * "That seat is not free" is what the page shows when somebody else took the
 * target seat while the organiser had the move panel open.
 */
export async function moveDelegate(
	supabase: SupabaseClient,
	fromSeatId: string,
	toSeatId: string
): Promise<void> {
	const { error } = await supabase.rpc('move_delegate', {
		from_seat_id: fromSeatId,
		to_seat_id: toSeatId
	});

	if (error) {
		throw new Error(error.message);
	}
}

/**
 * Trades the delegates sitting in two seats: the `swap_delegates` function
 * (T131).
 *
 * Each delegate keeps their application or their place in the delegation,
 * their unpaid invoice and their position paper, as `moveDelegate` above does
 * for one. The message is passed on unchanged for the page to match.
 */
export async function swapDelegates(
	supabase: SupabaseClient,
	firstSeatId: string,
	secondSeatId: string
): Promise<void> {
	const { error } = await supabase.rpc('swap_delegates', {
		first_seat_id: firstSeatId,
		second_seat_id: secondSeatId
	});

	if (error) {
		throw new Error(error.message);
	}
}

/**
 * Write "Seat released by the organisers" on the application whose seat was
 * just taken back.
 *
 * `revoke_seat` sets the application to `rejected` with its `decided_at` and
 * `decided_by`, but it writes no `decision_note`, which
 * `specs/05-pages/organiser/allocation.md` asks for. The note cannot be added
 * to the function, because three other tasks already depend on the applied
 * migration, so it is a second, small write from here. The `applications`
 * update policy lets an organiser write that column.
 *
 * A failure is logged rather than raised. By the time this runs the seat is
 * already free, which is what the organiser asked for, and the note is a
 * courtesy; raising here would tell them that something went wrong when the
 * thing they wanted worked.
 */
async function writeSeatReleasedNote(
	supabase: SupabaseClient,
	applicationId: string | null
): Promise<void> {
	// A delegation's member sits in their seat through the delegation rather than
	// through an application of their own, so there is nothing to write on.
	if (applicationId === null) {
		return;
	}

	const { error } = await supabase
		.from('applications')
		.update({ decision_note: SEAT_RELEASED_NOTE })
		.eq('id', applicationId);

	if (error) {
		console.error(`Could not note why the seat was freed: ${error.message}`);
	}
}

/**
 * Empties a seat, whichever of the two ways it is held.
 *
 * There are two database functions rather than one because freeing a seat is
 * two different decisions. `revoke_seat` is about a person: their application
 * is rejected, their unpaid invoice voided and their position paper deleted.
 * `remove_delegation_seat` is about a count: a delegation gives back a seat
 * nobody was ever put in, and each function refuses the other's case. The grid
 * has one "Free" button, so this is where the two are told apart.
 *
 * A delegation's seat with a member sitting in it goes through `revoke_seat`
 * too. That function keeps `delegation_id`, so the seat stays reserved for the
 * delegation and its head can name somebody else, which is exactly what
 * `specs/05-pages/organiser/allocation.md` asks for.
 *
 * The application id is read off the seat handed in rather than looked up
 * afterwards, because `revoke_seat` sets `seats.application_id` to null: by the
 * time the note is written, the seat no longer says which application it was.
 */
export async function freeSeat(supabase: SupabaseClient, seat: GridSeat): Promise<void> {
	if (seat.userId !== null) {
		await revokeSeat(supabase, seat.id);
		await writeSeatReleasedNote(supabase, seat.applicationId);
		return;
	}

	if (seat.delegationId !== null) {
		await removeDelegationSeat(supabase, seat.id);
		return;
	}

	/* The allocation grid refuses this before it ever gets here, because this
	   sentence is the last line of defence for any caller and not something an
	   organiser should be shown: the page has its own wording for it. */
	throw new Error(ALREADY_FREE_REFUSAL);
}
