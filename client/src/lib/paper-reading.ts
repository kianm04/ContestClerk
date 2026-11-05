/**
 * The reading page of a position paper written on MUNMeet (T146),
 * `…/chair/papers/[seatId]`, without any Svelte or any database: which seat
 * it shows, and which written papers come before and after it.
 *
 * Both the server and the browser import this file, so nothing here may be
 * server-only. The rules it follows are in `specs/05-pages/chair/papers.md`.
 */

import type { PaperSeatRow } from '$lib/documents-page';

/** One seat whose paper was written on MUNMeet, with the neighbours "Previous" and "Next" lead to. */
export type WrittenPaperPlace = {
	seat: PaperSeatRow;
	/** The seat of the written paper before this one, or `null` for the first. */
	previousSeatId: string | null;
	/** The seat of the written paper after this one, or `null` for the last. */
	nextSeatId: string | null;
};

/**
 * Find the seat `seatId` among the committee's seats, and the written papers
 * either side of it in the committee's seat order.
 *
 * `null` when the seat is not one of these, has no paper, or its paper is an
 * uploaded PDF, which has no reading page: the page answers 404 for all three.
 * Uploaded papers are skipped by "Previous" and "Next" for the same reason.
 */
export function findWrittenPaper(seats: PaperSeatRow[], seatId: string): WrittenPaperPlace | null {
	const writtenSeats = seats.filter((seat) => seat.paper?.isWritten === true);
	const index = writtenSeats.findIndex((seat) => seat.seatId === seatId);

	if (index === -1) return null;

	const previousSeat = writtenSeats[index - 1] ?? null;
	const nextSeat = writtenSeats[index + 1] ?? null;

	return {
		seat: writtenSeats[index],
		previousSeatId: previousSeat?.seatId ?? null,
		nextSeatId: nextSeat?.seatId ?? null
	};
}
