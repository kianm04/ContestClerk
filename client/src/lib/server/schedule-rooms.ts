/**
 * The committees the reader chairs or sits in, for the room links on a
 * conference's schedule (T171). `$lib/schedule-rooms.ts` decides which of them to link
 * on which day.
 *
 * Files under `$lib/server` only ever run on the server. Row Level Security
 * lets everybody read their own `seats` and `committee_chairs` rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { committeeHeading } from '$lib/committees';
import { isQuickSession, type ConferenceKind } from '$lib/my-quick-sessions';
import type { ScheduleRoom } from '$lib/schedule-rooms';

/**
 * The conference a committee belongs to, as the lookups below bring it along.
 * `kind` says whether it is a quick session, which has no schedule and gets no
 * "Your room" line (S14).
 */
type RoomConferenceRow = {
	id: string;
	kind: ConferenceKind;
	slug: string;
	name: string;
	start_date: string;
	end_date: string;
	timezone: string;
};

/**
 * One row of either lookup: the committee the seat or the chair is for.
 * `committees(...)` follows a foreign key to exactly one row, so Supabase
 * answers with one object (or `null` when the row cannot be read).
 */
type RoomRow = {
	committees: {
		id: string;
		slug: string;
		name: string;
		abbreviation: string | null;
		conferences: RoomConferenceRow | null;
	} | null;
};

/** What both lookups ask for: the committee and its conference's days. */
const ROOM_COLUMNS =
	'committees(id, slug, name, abbreviation, conferences(id, kind, slug, name, start_date, end_date, timezone))';

/**
 * Turn the rows of one lookup into rooms, leaving out any whose committee could
 * not be read, and any of a quick session, which `/home` lists on its own.
 */
function toRooms(rows: RoomRow[], isChair: boolean): ScheduleRoom[] {
	const rooms: ScheduleRoom[] = [];

	for (const row of rows) {
		const committee = row.committees;

		if (committee === null || committee.conferences === null) {
			continue;
		}

		if (isQuickSession(committee.conferences)) {
			continue;
		}

		const conference = committee.conferences;

		rooms.push({
			committeeId: committee.id,
			heading: committeeHeading(committee),
			committeeSlug: committee.slug,
			conference: {
				id: conference.id,
				slug: conference.slug,
				name: conference.name,
				startDate: conference.start_date,
				endDate: conference.end_date,
				timezone: conference.timezone
			},
			isChair
		});
	}

	return rooms;
}

/**
 * Every committee this person chairs or holds a seat in, chaired ones first.
 * The two lookups need nothing from each other, so they go out together.
 */
export async function readMyRooms(
	supabase: SupabaseClient,
	userId: string
): Promise<ScheduleRoom[]> {
	const [chairs, seats] = await Promise.all([
		supabase
			.from('committee_chairs')
			.select(ROOM_COLUMNS)
			.eq('user_id', userId)
			.overrideTypes<RoomRow[], { merge: false }>(),
		supabase
			.from('seats')
			.select(ROOM_COLUMNS)
			.eq('user_id', userId)
			.overrideTypes<RoomRow[], { merge: false }>()
	]);

	if (chairs.error) {
		throw new Error(`Could not list the committees you chair: ${chairs.error.message}`);
	}

	if (seats.error) {
		throw new Error(`Could not list the committees you sit in: ${seats.error.message}`);
	}

	return [...toRooms(chairs.data ?? [], true), ...toRooms(seats.data ?? [], false)];
}
