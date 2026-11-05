/**
 * Reading the speakers list the room is working through, with every entry,
 * for the Mod and Single speaker views (`specs/05-pages/chair/mod.md` and
 * `single-speaker.md`, "Data"): a moderated caucus's own list, or a single
 * speaker's, with its purpose.
 *
 * Files under `$lib/server` only ever run on the server. Both pages that draw
 * either view, the view's own route and `chair` while the mode is live, call
 * these readers, so the two cannot drift apart. The rows come back in the
 * shape the GSL view's reader gives (`$lib/server/gsl-view.ts`), so the floor
 * and queue pieces draw any of the three lists alike.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoomSeat, SpeakerStatus } from '$lib/committee-room';
import type { GslEntry, GslList } from '$lib/gsl-floor';
import { entrySeat } from '$lib/server/committee-room';

/** A list with every entry, and the purpose a single speaker's list carries. */
export type ActiveList = GslList & {
	/** "Right of reply", or null: only a single speaker's list may have one. */
	purpose: string | null;
};

/** The `speakers_lists` row, with what the views show of it. */
type ListRow = {
	id: string;
	name: string;
	speaking_time_seconds: number;
	is_open: boolean;
	purpose: string | null;
};

/**
 * One `speakers_list_entries` row with its seat. An entry with no seat (a
 * single speaker's typed name) brings its `speaker_name` instead.
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

/** An entry row in the shape the views draw, with the seat the layout already read. */
function toEntry(row: EntryRow, seatsById: Map<string, RoomSeat>): GslEntry {
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
 * The list `listId` with every entry in `position` order and every status
 * included, or null when there is no such list this reader may see. `seats`
 * is the chair layout's, which already carries each delegate's name.
 */
export async function readListWithEntries(
	supabase: SupabaseClient,
	listId: string,
	seats: RoomSeat[]
): Promise<ActiveList | null> {
	const [listResult, entriesResult] = await Promise.all([
		supabase
			.from('speakers_lists')
			.select('id, name, speaking_time_seconds, is_open, purpose')
			.eq('id', listId)
			.maybeSingle()
			.overrideTypes<ListRow, { merge: false }>(),
		supabase
			.from('speakers_list_entries')
			.select(
				'id, position, status, spoke_seconds, finished_at, speaker_name, seat:seats(id, name, country_code)'
			)
			.eq('speakers_list_id', listId)
			.order('position', { ascending: true })
			.order('created_at', { ascending: true })
			.overrideTypes<EntryRow[], { merge: false }>()
	]);

	if (listResult.error || entriesResult.error) {
		const message = listResult.error?.message ?? entriesResult.error?.message;
		throw new Error(`Could not read the speakers list: ${message}`);
	}

	const list = listResult.data;

	if (!list) return null;

	const seatsById = new Map(seats.map((seat) => [seat.id, seat]));

	return {
		speakersList: {
			id: list.id,
			name: list.name,
			speakingTimeSeconds: list.speaking_time_seconds,
			isOpen: list.is_open
		},
		speakers: (entriesResult.data ?? []).map((row) => toEntry(row, seatsById)),
		purpose: list.purpose
	};
}
