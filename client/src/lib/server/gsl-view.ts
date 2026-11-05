/**
 * Reading what the GSL view draws besides the chair layout's frame: the
 * session's General Speakers' List with every entry (`specs/05-pages/chair/gsl.md`,
 * "Data").
 *
 * Files under `$lib/server` only ever run on the server. Both pages that draw
 * the view call this one reader, `chair/gsl` always and `chair` while the room
 * is in formal debate, so the two cannot drift apart. It is always the General
 * Speakers' List, whatever the live mode: while a caucus or a vote runs the
 * floor waits, but the list shown is still this one.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoomSeat, SpeakerStatus } from '$lib/committee-room';
import type { GslEntry, GslList } from '$lib/gsl-floor';
import { entrySeat } from '$lib/server/committee-room';

/** The `speakers_lists` row of the General Speakers' List, with what the view shows of it. */
type ListRow = {
	id: string;
	name: string;
	speaking_time_seconds: number;
	is_open: boolean;
};

/**
 * One `speakers_list_entries` row with its seat. `finished_at` orders the
 * "Spoken" line latest first. An entry with no seat (a typed name, which only
 * a single speaker's list has) brings its `speaker_name` instead.
 */
type EntryRow = {
	id: string;
	position: number;
	status: SpeakerStatus;
	spoke_seconds: number | null;
	finished_at: string | null;
	speaker_name: string | null;
	seat: { id: string; name: string; country_code: string | null } | null;
};

/** An entry row in the shape the view draws, with the seat the layout already read. */
function toGslEntry(row: EntryRow, seatsById: Map<string, RoomSeat>): GslEntry {
	return {
		id: row.id,
		position: row.position,
		status: row.status,
		spokeSeconds: row.spoke_seconds,
		finishedAt: row.finished_at,
		seat: entrySeat(row.id, row.seat, row.speaker_name, seatsById)
	};
}

/**
 * The General Speakers' List of the session `sessionId`, its one list of kind
 * `general`, with every entry in `position` order and every status included.
 * Null when the session has none. `seats` is the chair layout's, which
 * already carries each delegate's name.
 */
export async function readGslList(
	supabase: SupabaseClient,
	sessionId: string,
	seats: RoomSeat[]
): Promise<GslList | null> {
	const { data: list, error: listError } = await supabase
		.from('speakers_lists')
		.select('id, name, speaking_time_seconds, is_open')
		.eq('session_id', sessionId)
		.eq('kind', 'general')
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle()
		.overrideTypes<ListRow, { merge: false }>();

	if (listError) {
		throw new Error(`Could not read the General Speakers' List: ${listError.message}`);
	}

	if (!list) return null;

	const { data: entries, error: entriesError } = await supabase
		.from('speakers_list_entries')
		.select(
			'id, position, status, spoke_seconds, finished_at, speaker_name, seat:seats(id, name, country_code)'
		)
		.eq('speakers_list_id', list.id)
		.order('position', { ascending: true })
		.order('created_at', { ascending: true })
		.overrideTypes<EntryRow[], { merge: false }>();

	if (entriesError) {
		throw new Error(`Could not read the speakers: ${entriesError.message}`);
	}

	const seatsById = new Map(seats.map((seat) => [seat.id, seat]));

	return {
		speakersList: {
			id: list.id,
			name: list.name,
			speakingTimeSeconds: list.speaking_time_seconds,
			isOpen: list.is_open
		},
		speakers: (entries ?? []).map((row) => toGslEntry(row, seatsById))
	};
}
