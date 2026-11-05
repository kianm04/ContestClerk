import { describe, expect, it } from 'vitest';
import { addNotePress, deleteNotePress } from './note-presses';

// These mirror what `$lib/server/chair-notes.ts`'s `addChairNote` and
// `deleteChairNote` write, so a press worked out here shows the same thing the
// server will save. The body's own check (`noteBodyProblem`) is already
// tested in `chair-notes.test.ts`; these tests are about the row a press
// builds on top of it.

const PRESSED = new Date('2026-01-01T10:00:00Z');

describe('addNotePress', () => {
	it('builds the new note under "You", for the reader who wrote it', () => {
		const expectation = addNotePress('Good point.', 'seat-de', 'note-1', 'chair-1', PRESSED);

		expect(expectation).toEqual({
			notes: [
				{
					id: 'note-1',
					added: {
						id: 'note-1',
						seatId: 'seat-de',
						authorId: 'chair-1',
						authorName: null,
						authorTitle: null,
						body: 'Good point.',
						bodyHtml: null,
						createdAt: '2026-01-01T10:00:00.000Z'
					}
				}
			]
		});
	});

	it('trims the body before saving it', () => {
		const expectation = addNotePress('  Good point.  ', 'seat-de', 'note-1', 'chair-1', PRESSED);

		expect(expectation?.notes?.[0].added?.body).toBe('Good point.');
	});

	it('answers null for a body the server would refuse: empty', () => {
		expect(addNotePress('   ', 'seat-de', 'note-1', 'chair-1', PRESSED)).toBeNull();
	});

	it('answers null for a body the server would refuse: too long', () => {
		const tooLong = 'x'.repeat(1001);

		expect(addNotePress(tooLong, 'seat-de', 'note-1', 'chair-1', PRESSED)).toBeNull();
	});
});

describe('deleteNotePress', () => {
	it('takes the note off the list', () => {
		expect(deleteNotePress('note-1')).toEqual({ notes: [{ id: 'note-1', isDeleted: true }] });
	});
});
