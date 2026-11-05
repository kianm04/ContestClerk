/**
 * A session's speakers lists, as the queue of the GSL, Mod and Unmod views
 * draws and reorders them: their shapes, the groups a list is drawn in, the
 * positions a move or a drag writes, and the readings of the queue's fields.
 *
 * `specs/05-pages/chair/gsl.md` describes the queue. Who speaks next and
 * how long a speech lasted are `nextSpeaker` and `spokeSeconds` in
 * `$lib/committee-room.ts`, which the room shares. Fetching and writing is
 * `$lib/server/speakers-list-edits.ts`'s job. Nothing here talks to Supabase,
 * so the components can import it too.
 */

import type { RoomSpeaker, SpeakersListSummary } from '$lib/chair-room';
import type { RoomSeat } from '$lib/committee-room';
import { positionsAfterDrop, readDroppedPlace } from '$lib/drag-order';

/** One entry of a list, with how long it lasted once it has been spoken. */
export type ListedSpeaker = RoomSpeaker & {
	/** Seconds the seat spoke for, or null until the speech has ended. */
	spokeSeconds: number | null;
};

/** One speakers list of the session, with every entry in `position` order. */
export type SessionSpeakersList = {
	speakersList: SpeakersListSummary;
	speakers: ListedSpeaker[];
};

/** Which way "Move up" and "Move down" move an entry. */
export type MoveDirection = 'up' | 'down';

/** The shortest and longest speaking time a list may have, in seconds. */
export const MIN_SPEAKING_TIME_SECONDS = 30;
export const MAX_SPEAKING_TIME_SECONDS = 300;

/** The entries still waiting for the floor, in speaking order. */
export function waitingSpeakers<Entry extends RoomSpeaker>(speakers: Entry[]): Entry[] {
	const waiting = speakers.filter((speaker) => speaker.status === 'waiting');

	// `sort` changes the array it is given, so it sorts a copy.
	return [...waiting].sort((first, second) => first.position - second.position);
}

/**
 * The seats that may not be added again: those waiting or speaking. A seat
 * that has spoken, or was removed, may go back on the list.
 */
export function listedSeatIds(speakers: RoomSpeaker[]): string[] {
	const onTheList = speakers.filter(
		(speaker) => speaker.status === 'waiting' || speaker.status === 'speaking'
	);

	return onTheList.map((speaker) => speaker.seat.id);
}

/** The position a new entry takes: one after the highest there is, so it goes last. */
export function nextPosition(speakers: RoomSpeaker[]): number {
	const positions = speakers.map((speaker) => speaker.position);

	return Math.max(0, ...positions) + 1;
}

/**
 * The waiting entry an entry swaps places with when it moves `direction`, or
 * null when it is already first or last. Only waiting entries count, so an
 * entry that is speaking or has spoken never moves.
 */
export function waitingNeighbour(
	speakers: RoomSpeaker[],
	entryId: string,
	direction: MoveDirection
): RoomSpeaker | null {
	const waiting = waitingSpeakers(speakers);
	const index = waiting.findIndex((speaker) => speaker.id === entryId);

	if (index === -1) return null;

	const neighbourIndex = direction === 'up' ? index - 1 : index + 1;

	return waiting[neighbourIndex] ?? null;
}

/** A new position for one entry, as a drag or "Move to top" writes it. */
export type EntryPosition = { id: string; position: number };

/**
 * The positions to write so that a waiting entry stands at `toIndex` (from 0)
 * among the waiting entries, which close up behind it. Only entries whose
 * position changes are returned, and an empty list when the entry is not
 * waiting. A place past the end means last.
 *
 * The waiting entries are numbered afresh from the lowest position among
 * them, so two entries that shared a position get one each.
 */
export function placedPositions(
	speakers: RoomSpeaker[],
	entryId: string,
	toIndex: number
): EntryPosition[] {
	// The arithmetic is shared with every other ordered list (`$lib/drag-order.ts`).
	return positionsAfterDrop(waitingSpeakers(speakers), entryId, toIndex);
}

/**
 * The place a drag sends, counting from 1, read into an index counting from 0.
 * Null when it is not a whole number of at least 1.
 */
export function readQueueIndex(value: FormDataEntryValue | null): number | null {
	return readDroppedPlace(value);
}

/**
 * The seats whose country (the seat's name) or delegate's name contains what
 * the chair typed, ignoring capitals.
 */
export function filterSeatsByName(seats: RoomSeat[], query: string): RoomSeat[] {
	const wanted = query.trim().toLowerCase();

	if (wanted === '') return seats;

	return seats.filter((seat) => {
		const delegateName = seat.delegateName ?? '';

		return seat.name.toLowerCase().includes(wanted) || delegateName.toLowerCase().includes(wanted);
	});
}

/**
 * The `id` of the hidden form that saves a drag in the queue. Each page shows
 * one queue, and every drag handle names this form in its `form` attribute.
 */
export const QUEUE_DRAG_FORM_ID = 'queue-drag-form';

/** The `id` of the sentence that tells a screen reader how to drag a row with the keys. */
export const QUEUE_DRAG_HINT_ID = 'queue-drag-hint';
