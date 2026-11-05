/**
 * What the Notes page's "Add note" and "Delete" buttons are expected to
 * change, worked out in the browser at the moment of the press (T141).
 * Mirrors `$lib/server/chair-notes.ts`'s `addChairNote` and `deleteChairNote`,
 * so the screen shows what the database will hold.
 */
import { noteBodyProblem, type ChairNote } from '$lib/chair-notes';
import type { ChairExpectation } from '$lib/chair-form';

/**
 * "Add note": the note added under `newNoteId` (the id the browser chose,
 * which the server saves the row under). Null when the text is empty or too
 * long, which the server would refuse, so the screen leaves it to the
 * server's answer.
 */
export function addNotePress(
	body: string,
	seatId: string,
	newNoteId: string,
	authorId: string,
	pressed: Date
): ChairExpectation | null {
	if (noteBodyProblem(body) !== null) return null;

	const added: ChairNote = {
		id: newNoteId,
		seatId,
		authorId,
		// Not known in the browser. `noteAuthorLabel` shows "You" for the
		// reader's own note by `authorId` alone, so a fresh note needs neither.
		authorName: null,
		authorTitle: null,
		body: body.trim(),
		// Only the server turns Markdown into HTML, so the note shows as text until it answers.
		bodyHtml: null,
		createdAt: pressed.toISOString()
	};

	return { notes: [{ id: newNoteId, added }] };
}

/** "Delete": the note is taken off the list. */
export function deleteNotePress(noteId: string): ChairExpectation {
	return { notes: [{ id: noteId, isDeleted: true }] };
}
