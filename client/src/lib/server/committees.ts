/**
 * The committee list on a conference's page: every committee of one
 * conference, each with how many of its seats are taken.
 *
 * The other committee readers each have a file of their own beside this one:
 * `./committee-page.ts` for one committee's own page, `./manage-committees.ts`
 * for the organiser's committees editor, and `./my-committees.ts` for the
 * committees one person takes part in.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument. Pages pass in `locals.supabase`, the client that knows who is
 * signed in, so the database's Row Level Security rules (see
 * `specs/02-architecture/permissions.md`) decide what each reader gets back.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { summariseSeats, type Committee, type SeatSummary } from '$lib/committees';

/** A committee on the conference page, with how full it is. */
export type CommitteeWithSeats = {
	committee: Committee;
	seatSummary: SeatSummary;
};

/**
 * The committee columns the public pages ask for: the list here, and the one
 * committee `./committee-page.ts` reads.
 *
 * The database's names and the `Committee` type's names are the same word for
 * word, so a row of this select already is a `Committee`. That is why there is
 * no renaming step here of the kind `toConference` is in `./conferences`.
 */
export const COMMITTEE_COLUMNS = 'id, slug, name, abbreviation, description, topics, level, room';

/** One row of the seat count query: which committee a seat is in, and whether anybody has it. */
type SeatCountRow = {
	committee_id: string;
	is_taken: boolean;
};

/**
 * How many seats each of these committees has, and how many are taken.
 *
 * The counting happens here in TypeScript rather than in SQL because
 * `public_seats` is a plain view with no grouping of its own: a count per
 * committee would need a database function or a second view to go with it. A
 * conference has tens of seats, not thousands, so gathering the rows and
 * counting them is both quick enough and far easier to follow.
 *
 * Only the grouping is done here. The counting itself is `summariseSeats` in
 * `$lib/committees.ts`, which is also what the committee page's own seat list
 * uses, so "12 of 15 seats taken" cannot come out differently on the two pages.
 *
 * A committee nobody has made seats for yet is simply missing from the map.
 */
async function countSeatsByCommittee(
	supabase: SupabaseClient,
	committeeIds: string[]
): Promise<Map<string, SeatSummary>> {
	const { data, error } = await supabase
		.from('public_seats')
		.select('committee_id, is_taken')
		.in('committee_id', committeeIds)
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<SeatCountRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not count the seats: ${error.message}`);
	}

	const rows: SeatCountRow[] = data ?? [];
	const seatsByCommittee = new Map<string, { isTaken: boolean }[]>();

	for (const row of rows) {
		const seats = seatsByCommittee.get(row.committee_id) ?? [];

		seats.push({ isTaken: row.is_taken });
		seatsByCommittee.set(row.committee_id, seats);
	}

	const counts = new Map<string, SeatSummary>();

	for (const [committeeId, seats] of seatsByCommittee) {
		counts.set(committeeId, summariseSeats(seats));
	}

	return counts;
}

/**
 * Every committee of one conference, in the organiser's own order, each with
 * the number of seats already taken.
 *
 * This is two queries rather than one, because the second needs the ids the
 * first found.
 */
export async function listCommitteesWithSeatCounts(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<CommitteeWithSeats[]> {
	const { data, error } = await supabase
		.from('committees')
		.select(COMMITTEE_COLUMNS)
		.eq('conference_id', conferenceId)
		// `position` is the order the organiser put the committees in.
		.order('position', { ascending: true })
		.overrideTypes<Committee[], { merge: false }>();

	if (error) {
		throw new Error(`Could not list the committees: ${error.message}`);
	}

	const committees: Committee[] = data ?? [];

	// Nothing to count, and `.in('committee_id', [])` would be a pointless request.
	if (committees.length === 0) {
		return [];
	}

	const committeeIds = committees.map((committee) => committee.id);
	const seatCounts = await countSeatsByCommittee(supabase, committeeIds);

	return committees.map((committee) => ({
		committee,
		seatSummary: seatCounts.get(committee.id) ?? { taken: 0, total: 0 }
	}));
}
