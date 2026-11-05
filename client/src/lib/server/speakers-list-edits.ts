/**
 * Reading a session's speakers lists, and editing them from the Speakers page:
 * adding a seat, reordering, removing, the speaking time and whether the list
 * is open.
 *
 * Files under `$lib/server` only ever run on the server. Every function takes
 * the reader's own Supabase client, so Row Level Security decides what they may
 * read and write. Moving the floor on (the next speaker and the yields) is
 * `./speakers-lists.ts`, which the Room page shares. The page's rules are in
 * `$lib/speakers-lists.ts`, so this file only fetches and writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoomSeat, SpeakerStatus } from '$lib/committee-room';
import type { EntryPosition, ListedSpeaker, SessionSpeakersList } from '$lib/speakers-lists';
import { entrySeat } from '$lib/server/committee-room';

/** One `speakers_lists` row, with what the page shows of it. */
type ListRow = {
	id: string;
	name: string;
	speaking_time_seconds: number;
	is_open: boolean;
};

/**
 * One `speakers_list_entries` row, with the seat it is for. An entry on a
 * single speaker's list may name somebody who holds no seat (S9): its seat is
 * then null and `speaker_name` holds the typed name.
 */
type EntryRow = {
	id: string;
	speakers_list_id: string;
	position: number;
	status: SpeakerStatus;
	spoke_seconds: number | null;
	speaker_name: string | null;
	seat: { id: string; name: string; country_code: string | null } | null;
};

/** An entry row, in the shape the page draws, with the seat the layout already read. */
function toListedSpeaker(row: EntryRow, seatsById: Map<string, RoomSeat>): ListedSpeaker {
	// The layout reads only the seats still on offer, so a seat taken away since
	// falls back to what the entry itself says about it; a typed name stands in
	// a seat of its own (`entrySeat`).
	const seat = entrySeat(row.id, row.seat, row.speaker_name, seatsById);

	return {
		id: row.id,
		position: row.position,
		status: row.status,
		spokeSeconds: row.spoke_seconds,
		seat
	};
}

/**
 * Every speakers list of a session, oldest first, each with its entries in
 * `position` order and every status included. `seats` is the chair layout's,
 * which already carries each delegate's name.
 */
export async function getSpeakersLists(
	supabase: SupabaseClient,
	sessionId: string,
	seats: RoomSeat[]
): Promise<SessionSpeakersList[]> {
	const { data: lists, error: listsError } = await supabase
		.from('speakers_lists')
		.select('id, name, speaking_time_seconds, is_open')
		.eq('session_id', sessionId)
		.order('created_at', { ascending: true })
		.overrideTypes<ListRow[], { merge: false }>();

	if (listsError) {
		throw new Error(`Could not read the speakers lists: ${listsError.message}`);
	}

	const listRows = lists ?? [];

	if (listRows.length === 0) return [];

	const { data: entries, error: entriesError } = await supabase
		.from('speakers_list_entries')
		.select(
			'id, speakers_list_id, position, status, spoke_seconds, speaker_name, seat:seats(id, name, country_code)'
		)
		.in(
			'speakers_list_id',
			listRows.map((list) => list.id)
		)
		.order('position', { ascending: true })
		.order('created_at', { ascending: true })
		.overrideTypes<EntryRow[], { merge: false }>();

	if (entriesError) {
		throw new Error(`Could not read the speakers: ${entriesError.message}`);
	}

	const seatsById = new Map(seats.map((seat) => [seat.id, seat]));
	const entryRows = entries ?? [];

	return listRows.map((list) => {
		const ownEntries = entryRows.filter((entry) => entry.speakers_list_id === list.id);

		return {
			speakersList: {
				id: list.id,
				name: list.name,
				speakingTimeSeconds: list.speaking_time_seconds,
				isOpen: list.is_open
			},
			speakers: ownEntries.map((entry) => toListedSpeaker(entry, seatsById))
		};
	});
}

/**
 * Throw when an update changed nothing. Row Level Security answers a refused
 * update with no rows rather than an error, and the page has already made sure
 * the reader chairs this committee, so it means something is wrong on our side.
 */
function expectChanged(rows: unknown[] | null, what: string): void {
	if (!rows || rows.length === 0) {
		throw new Error(`${what} was not changed.`);
	}
}

/**
 * Put a seat at the end of a list, waiting. `position` is `nextPosition` of
 * the list. `entryId` is the id the chair's browser chose for the entry
 * (`$lib/new-row-id.ts`); with null the database chooses one.
 */
export async function addSpeaker(
	supabase: SupabaseClient,
	listId: string,
	seatId: string,
	position: number,
	entryId: string | null = null
): Promise<void> {
	const { error } = await supabase.from('speakers_list_entries').insert({
		// Leaving `id` out lets the database choose it.
		...(entryId === null ? {} : { id: entryId }),
		speakers_list_id: listId,
		seat_id: seatId,
		position,
		status: 'waiting'
	});

	if (error) {
		throw new Error(`Could not add the speaker: ${error.message}`);
	}
}

/** Give one entry a new position. */
async function moveEntry(supabase: SupabaseClient, entryId: string, position: number) {
	const { data, error } = await supabase
		.from('speakers_list_entries')
		.update({ position })
		.eq('id', entryId)
		.select('id');

	if (error) {
		throw new Error(`Could not move the speaker: ${error.message}`);
	}

	expectChanged(data, 'The speaker');
}

/** Swap the places of two entries of one list, which is what "Move up" and "Move down" do. */
export async function swapSpeakers(
	supabase: SupabaseClient,
	first: { id: string; position: number },
	second: { id: string; position: number }
): Promise<void> {
	await moveEntry(supabase, first.id, second.position);
	await moveEntry(supabase, second.id, first.position);
}

/**
 * Write the new positions a drag or "Move to top" worked out
 * (`placedPositions` in `$lib/speakers-lists.ts`), one entry at a time, as
 * `swapSpeakers` does.
 */
export async function placeSpeakers(
	supabase: SupabaseClient,
	positions: EntryPosition[]
): Promise<void> {
	for (const entry of positions) {
		await moveEntry(supabase, entry.id, entry.position);
	}
}

/**
 * Take a seat off the list. The entry becomes `removed` rather than being
 * deleted, so the record of who was on the list stays.
 */
export async function removeSpeaker(supabase: SupabaseClient, entryId: string): Promise<void> {
	const { data, error } = await supabase
		.from('speakers_list_entries')
		.update({ status: 'removed' })
		.eq('id', entryId)
		.select('id');

	if (error) {
		throw new Error(`Could not remove the speaker: ${error.message}`);
	}

	expectChanged(data, 'The speaker');
}

/** Change one list's columns: its speaking time, or whether it is open. */
async function updateList(
	supabase: SupabaseClient,
	listId: string,
	changes: { speaking_time_seconds?: number; is_open?: boolean }
): Promise<void> {
	const { data, error } = await supabase
		.from('speakers_lists')
		.update(changes)
		.eq('id', listId)
		.select('id');

	if (error) {
		throw new Error(`Could not change the speakers list: ${error.message}`);
	}

	expectChanged(data, 'The speakers list');
}

/**
 * Set how long each speaker on the list gets. The running timer is left
 * alone, so the change reaches the next speaker, not the one speaking.
 */
export async function setSpeakingTime(
	supabase: SupabaseClient,
	listId: string,
	seconds: number
): Promise<void> {
	await updateList(supabase, listId, { speaking_time_seconds: seconds });
}

/** Open or close a list. A closed list takes no new speakers but still moves on. */
export async function setListOpen(
	supabase: SupabaseClient,
	listId: string,
	isOpen: boolean
): Promise<void> {
	await updateList(supabase, listId, { is_open: isOpen });
}
