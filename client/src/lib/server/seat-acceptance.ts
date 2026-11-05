/**
 * Putting somebody in a seat: the free seats of a conference, and accepting an
 * application or a delegation into them.
 *
 * This belongs to the organiser's two review pages and the applications table
 * at `/manage/[slug]/applications`, where accepting somebody means choosing a
 * seat for them. What "free" means is not written here: `seatState` in
 * `$lib/allocation.ts` decides it, so the seat-choosing panel in the browser
 * and the query below can never disagree about which seats are on offer.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument, the way `./seats.ts` explains. The committee editor's own changes
 * to a committee's seats are in `./seats.ts`; the allocation grid, where seats
 * are freed and delegates moved, is `./allocation-grid.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { seatState, suggestSeats, type AllocatableSeat, type SeatGroup } from '$lib/allocation';
import type { CommitteeChoice } from '$lib/applications';
import { committeeHeading } from '$lib/committees';
import { listCommitteesWithSeatCounts } from './committees';

/** One seat and its committee, as `readSeatLabel` at the foot of this file reads them. */
type SeatLabelRow = {
	name: string;
	committees: {
		name: string;
		abbreviation: string | null;
	};
};

/**
 * Accept an application into a seat: the seat, the status, the decision and the
 * invoice in one statement.
 *
 * `accept_application` is a security definer function, so everything it checks
 * — that the caller manages the conference, that the application is still
 * `submitted` or `waitlisted`, that the seat is free and in this conference —
 * is checked in the database and raises there. The message is passed on as it
 * is, because the page is what tells those refusals apart from a failure of
 * another kind: a bulk accept stops at the first application that fails, shows
 * the function's own sentences to the organiser and keeps anything else off the
 * screen (`specs/05-pages/organiser/applications.md`).
 */
export async function acceptApplication(
	supabase: SupabaseClient,
	applicationId: string,
	seatId: string
): Promise<void> {
	const { error } = await supabase.rpc('accept_application', {
		application_id: applicationId,
		seat_id: seatId
	});

	if (error) {
		throw new Error(error.message);
	}
}

/** One row of the free-seat query, under the database's own column names. */
type AllocatableSeatRow = {
	id: string;
	committee_id: string;
	name: string;
	country_code: string | null;
	is_available: boolean;
	delegation_id: string | null;
	user_id: string | null;
};

/**
 * How many seats one query of `readConferenceSeatRows` asks for at a time.
 * `supabase/config.toml` sets `max_rows = 1000`, and PostgREST answers with no
 * more than that whatever it is asked, so the seats are read a window at a
 * time until one comes back empty. The allocation grid in
 * `./allocation-grid.ts` reads its seats the same way.
 */
const SEAT_READ_BATCH_SIZE = 500;

/** The error code Supabase sends when a window starts past the last row. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

/**
 * Every seat row of one conference, however many there are, in the
 * organiser's own order.
 *
 * `seats` has no `conference_id` of its own: a seat belongs to a committee and
 * the committee belongs to the conference. `committees!inner(conference_id)` in
 * the select is what makes the committee part of the match rather than an
 * extra, so that the filter on `committees.conference_id` really narrows which
 * seats come back — the same `!inner` `findMySeat` in `./conferences.ts`
 * explains.
 *
 * PostgREST answers with at most `max_rows` rows whatever is asked of it, so
 * this asks for `SEAT_READ_BATCH_SIZE` rows at a time with `.range()` and moves
 * the window along by however many really came back, until one comes back
 * empty or starts past the end (`PGRST103`). Moving by what arrived rather than
 * by the size asked for is what keeps a row from being stepped over if
 * `max_rows` is ever set below the batch size; `readApplicationsForExport` in
 * `./application-table.ts` explains the same.
 *
 * The windows only line up if every request sorts the seats exactly the same
 * way, so the seat's id comes last in the order: two seats may share a
 * `position` and, in different committees, a name as well.
 */
async function readConferenceSeatRows(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<AllocatableSeatRow[]> {
	const rows: AllocatableSeatRow[] = [];
	let firstIndex = 0;

	while (true) {
		const { data, error } = await supabase
			.from('seats')
			.select(
				'id, committee_id, name, country_code, is_available, delegation_id, user_id, committees!inner(conference_id)'
			)
			.eq('committees.conference_id', conferenceId)
			// `position` is the order the organiser put the seats in. Two are allowed to
			// share one, so the name decides between them and the dropdown comes out the
			// same way round on every refresh.
			.order('position', { ascending: true })
			.order('name', { ascending: true })
			.order('id', { ascending: true })
			.range(firstIndex, firstIndex + SEAT_READ_BATCH_SIZE - 1)
			// Replaces Supabase's guess at the row's shape with ours. It has to come last.
			.overrideTypes<AllocatableSeatRow[], { merge: false }>();

		// The window starts past the last row, which is the end of the list.
		if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
			return rows;
		}

		if (error) {
			throw new Error(`Could not read the free seats: ${error.message}`);
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
 * Every seat of one conference that anybody may still be put in.
 *
 * It is every free seat and not only those among the first thousand seats,
 * because `readConferenceSeatRows` above reads the conference in windows. A
 * short list here would look to an organiser like a committee that is full.
 *
 * The seats come back in the organiser's own order, and the hidden, filled and
 * reserved ones are then dropped by `seatState`, so that "free" is written down
 * once in `$lib/allocation.ts` instead of being spelled out again here.
 */
export async function listFreeSeats(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<AllocatableSeat[]> {
	const rows = await readConferenceSeatRows(supabase, conferenceId);
	const seats: AllocatableSeat[] = rows.map((row) => ({
		id: row.id,
		committeeId: row.committee_id,
		name: row.name,
		countryCode: row.country_code,
		isAvailable: row.is_available,
		delegationId: row.delegation_id,
		userId: row.user_id
	}));

	return seats.filter((seat) => seatState(seat) === 'free');
}

/**
 * The free seats of a conference, grouped under their committee in the order
 * the organiser put the committees in.
 *
 * This is what the delegation review page's seat picker offers, and it is
 * `listFreeSeats` above plus the committees the seats belong to. Grouping is
 * `suggestSeats` in `$lib/allocation`. A delegation asks for a number of seats
 * and not for particular committees, so its page passes no preferences and the
 * committees stay in their own order. The application review page passes the
 * committee ids the applicant asked for, which puts those committees first, in
 * the applicant's order. A committee with no
 * free seat left is dropped rather than shown empty, and a hidden or taken seat
 * never reaches the picker at all, because `listFreeSeats` only returns seats
 * whose `seatState` is `free`.
 */
export async function listSeatsByCommittee(
	supabase: SupabaseClient,
	conferenceId: string,
	committeePreferences: string[] = []
): Promise<SeatGroup[]> {
	// Neither list needs the other's answer, so they run side by side.
	const [committeeRows, freeSeats] = await Promise.all([
		listCommitteesWithSeatCounts(supabase, conferenceId),
		listFreeSeats(supabase, conferenceId)
	]);

	const committees: CommitteeChoice[] = committeeRows.map((row) => ({
		id: row.committee.id,
		name: row.committee.name,
		abbreviation: row.committee.abbreviation
	}));

	return suggestSeats(committeePreferences, committees, freeSeats);
}

/**
 * Reserve seats for a delegation: the `allocate_delegation_seats` function.
 *
 * One call does the whole of accepting a group. It checks the seats are all
 * free, hidden from nobody and part of this conference, reserves every one of
 * them for the delegation, moves a `submitted` delegation to `accepted` with
 * `decided_at` and `decided_by`, and writes the one group invoice the fee rules
 * ask for. None of that could be several statements from here: two organisers
 * deciding at once would otherwise half-allocate a group.
 *
 * The message is passed on unchanged, the way `revokeSeat` in
 * `./allocation-grid.ts` passes its own on. "One of those seats is taken,
 * hidden, or not part of this conference" is what the caller sees when
 * somebody took a seat while the review page was open, and
 * `$lib/delegation-review.ts` turns it into a sentence naming the seat.
 */
export async function allocateDelegationSeats(
	supabase: SupabaseClient,
	delegationId: string,
	seatIds: string[]
): Promise<void> {
	const { error } = await supabase.rpc('allocate_delegation_seats', {
		delegation_id: delegationId,
		seat_ids: seatIds
	});

	if (error) {
		throw new Error(error.message);
	}
}

/**
 * "UNSC · France" for one seat of this conference, or `null` when the id names
 * no seat of theirs.
 *
 * Only the refusal in the delegation review page's `allocate` action asks for
 * this. When a ticked seat turns out to have been taken while the page was
 * open, it is no longer among the free seats the picker lists, so there is
 * nowhere left to read its name from and this one row is fetched to name it.
 * The conference is part of the question so that a seat id typed into a form by
 * hand cannot be used to read the names of another conference's seats.
 */
export async function readSeatLabel(
	supabase: SupabaseClient,
	conferenceId: string,
	seatId: string
): Promise<string | null> {
	const { data, error } = await supabase
		.from('seats')
		.select('name, committees!inner(name, abbreviation, conference_id)')
		.eq('id', seatId)
		.eq('committees.conference_id', conferenceId)
		// `maybeSingle` returns one row, or `null` when nothing matches, instead of a list.
		.maybeSingle()
		.overrideTypes<SeatLabelRow, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the seat: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	return `${committeeHeading(data.committees)} · ${data.name}`;
}
