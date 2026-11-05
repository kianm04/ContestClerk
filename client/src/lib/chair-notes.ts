/**
 * The chair notes page: private observations a chair keeps on each seat, so
 * awards are decided on evidence rather than memory.
 *
 * The shapes and rules live here, where they can be read and tested without
 * Svelte or a database. `$lib/server/chair-notes.ts` reads and writes the rows.
 */

import type { RoomSeat } from '$lib/committee-room';

/** One `chair_notes` row, with the author's name for display. */
export type ChairNote = {
	id: string;
	seatId: string;
	authorId: string;
	/** The author's profile name, or null when they never gave one. */
	authorName: string | null;
	/** The author's `committee_chairs.title`, such as "Vice Chair", or null for an organiser. */
	authorTitle: string | null;
	/** The note as the chair wrote it, in Markdown (T144). */
	body: string;
	/**
	 * The note as safe HTML, made by `renderMarkdown` on the server. Null for a
	 * note just added in the browser, which shows as plain text until the page
	 * has been read again.
	 */
	bodyHtml: string | null;
	/** When the note was written, as an ISO timestamp. */
	createdAt: string;
};

/** Whether a seat has a delegate in it now and since when, from the `seats` row. */
export type SeatAllocation = {
	seatId: string;
	/**
	 * Whether a delegate sits in the seat. That is all the page asks, so the
	 * delegate's account id stays on the server rather than reaching every
	 * chair's browser (security review I14).
	 */
	isFilled: boolean;
	/** When that delegate was given the seat, or null for an empty seat. */
	allocatedAt: string | null;
};

/** The longest note the form accepts, as `chair_notes` has no limit of its own. */
export const NOTE_BODY_MAX_LENGTH = 1000;

/** The sentences the page answers a refused form with. */
export const NOTE_REFUSALS = {
	emptyBody: 'Write something before adding the note.',
	longBody: `Keep the note to at most ${NOTE_BODY_MAX_LENGTH} characters.`,
	seat: 'That seat is not in this committee.',
	note: 'That note no longer exists, or it is not yours to delete.',
	confirm: 'Please confirm before deleting a note.'
};

/**
 * What is wrong with a note's text, or null when it may be saved. Spaces alone
 * count as nothing written.
 */
export function noteBodyProblem(body: string): string | null {
	const trimmed = body.trim();

	if (trimmed === '') return NOTE_REFUSALS.emptyBody;
	if (trimmed.length > NOTE_BODY_MAX_LENGTH) return NOTE_REFUSALS.longBody;

	return null;
}

/** How many notes each seat has, keyed by seat id. A seat without notes is left out. */
export function countNotesBySeat(notes: ChairNote[]): Record<string, number> {
	const counts: Record<string, number> = {};

	for (const note of notes) {
		counts[note.seatId] = (counts[note.seatId] ?? 0) + 1;
	}

	return counts;
}

/** The notes of one seat, keeping the order they came in (newest first from the server). */
export function notesOfSeat(notes: ChairNote[], seatId: string | null): ChairNote[] {
	return notes.filter((note) => note.seatId === seatId);
}

/**
 * The seat the page shows. `?seat=<id>` wins when it names one of the
 * committee's seats; otherwise it is the first seat with a delegate in it, and
 * null when nobody is seated yet.
 */
export function chooseNoteSeatId(
	seats: RoomSeat[],
	allocations: SeatAllocation[],
	requestedSeatId: string | null
): string | null {
	if (requestedSeatId !== null && seats.some((seat) => seat.id === requestedSeatId)) {
		return requestedSeatId;
	}

	const seatedIds = new Set(
		allocations.filter((allocation) => allocation.isFilled).map((each) => each.seatId)
	);
	const firstSeated = seats.find((seat) => seatedIds.has(seat.id));

	return firstSeated?.id ?? null;
}

/** Whether any of the committee's seats has a delegate in it. */
export function hasSeatedDelegate(allocations: SeatAllocation[]): boolean {
	return allocations.some((allocation) => allocation.isFilled);
}

/**
 * Whether a note was written about somebody other than the delegate in the
 * seat now: it is older than the moment the current delegate was seated.
 * Notes stay with the seat, so a moved delegate's notes are marked, not lost.
 */
export function isAboutEarlierDelegate(
	noteCreatedAt: string,
	seatAllocatedAt: string | null
): boolean {
	if (seatAllocatedAt === null) return false;

	return new Date(noteCreatedAt).getTime() < new Date(seatAllocatedAt).getTime();
}

/**
 * The author as the note list names them: "You" for the reader's own notes,
 * otherwise the name with the chair title in brackets, "Sara (Vice Chair)".
 */
export function noteAuthorLabel(note: ChairNote, readerId: string): string {
	if (note.authorId === readerId) return 'You';

	const name = note.authorName ?? 'A chair';

	if (note.authorTitle === null) return name;

	return `${name} (${note.authorTitle})`;
}

/** The seats whose name contains the search text, ignoring case. An empty search keeps them all. */
export function filterSeatsByName(seats: RoomSeat[], searchText: string): RoomSeat[] {
	const wanted = searchText.trim().toLowerCase();

	if (wanted === '') return seats;

	return seats.filter((seat) => seat.name.toLowerCase().includes(wanted));
}

/**
 * The choices of the seat dropdown the page shows on a phone instead of the
 * seat column, with each seat's note count in brackets: "France (3)".
 */
export function noteSeatOptions(
	seats: RoomSeat[],
	noteCounts: Record<string, number>
): { value: string; label: string }[] {
	return seats.map((seat) => ({
		value: seat.id,
		label: `${seat.name} (${noteCounts[seat.id] ?? 0})`
	}));
}
