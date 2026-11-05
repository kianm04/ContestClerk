import { describe, expect, it } from 'vitest';
import { NETWORK_FAILURE_MESSAGE, SERVER_FAILURE_MESSAGE } from '$lib/in-place-form.svelte';
import {
	SESSION_NOTES_REFUSALS,
	changedByText,
	readNotesDraft,
	readNotesRevision,
	readSaveOutcome,
	saveStatusText,
	savedAgoText,
	type SessionNotes
} from './session-notes';

const SAVED_AT = Date.parse('2026-09-26T10:00:00Z');

/** A moment `seconds` after `SAVED_AT`. */
function after(seconds: number): number {
	return SAVED_AT + seconds * 1000;
}

const SARAS_NOTES: SessionNotes = {
	body: 'Hers',
	bodyHtml: '<p>Hers</p>',
	revision: 4,
	updatedById: 'sara-id',
	updatedByName: 'Sara Okafor',
	updatedAt: '2026-09-26T10:00:00Z'
};

describe('savedAgoText', () => {
	it('counts seconds, then minutes, hours and days', () => {
		expect(savedAgoText(SAVED_AT, after(2))).toBe('just now');
		expect(savedAgoText(SAVED_AT, after(10))).toBe('10s ago');
		expect(savedAgoText(SAVED_AT, after(125))).toBe('2 min ago');
		expect(savedAgoText(SAVED_AT, after(3 * 3600))).toBe('3 h ago');
		expect(savedAgoText(SAVED_AT, after(24 * 3600))).toBe('1 day ago');
		expect(savedAgoText(SAVED_AT, after(3 * 24 * 3600))).toBe('3 days ago');
	});

	it('never counts backwards when the clocks disagree', () => {
		expect(savedAgoText(SAVED_AT, after(-30))).toBe('just now');
	});
});

describe('saveStatusText', () => {
	it('says what the notes are doing', () => {
		expect(saveStatusText('waiting', SAVED_AT, after(10))).toBe('Saving…');
		expect(saveStatusText('saving', null, after(10))).toBe('Saving…');
		expect(saveStatusText('failed', SAVED_AT, after(10))).toBe('Not saved');
		expect(saveStatusText('conflict', SAVED_AT, after(10))).toBe('Not saved');
		expect(saveStatusText('saved', SAVED_AT, after(10))).toBe('Auto-saved 10s ago');
	});

	it('says nothing about notes that were never saved', () => {
		expect(saveStatusText('saved', null, after(10))).toBe('');
	});
});

describe('changedByText', () => {
	it('names the other chair by first name', () => {
		expect(changedByText(SARAS_NOTES, 'reader-id')).toBe('Sara changed these notes.');
	});

	it('calls the reader "You" and a removed account "Another chair"', () => {
		expect(changedByText(SARAS_NOTES, 'sara-id')).toBe(
			'You changed these notes in another window.'
		);
		expect(changedByText({ ...SARAS_NOTES, updatedByName: null }, 'reader-id')).toBe(
			'Another chair changed these notes.'
		);
	});
});

describe('readNotesRevision', () => {
	it('reads a whole number and refuses anything else', () => {
		expect(readNotesRevision('0')).toBe(0);
		expect(readNotesRevision('12')).toBe(12);
		expect(readNotesRevision('-1')).toBeNull();
		expect(readNotesRevision('1.5')).toBeNull();
		expect(readNotesRevision(null)).toBeNull();
	});
});

describe('readNotesDraft', () => {
	it('reads the text a refused plain save sent back', () => {
		expect(readNotesDraft({ sessionNotesDraft: 'Mine' })).toBe('Mine');
		expect(readNotesDraft({ flash: {} })).toBeNull();
		expect(readNotesDraft(null)).toBeNull();
	});
});

describe('readSaveOutcome', () => {
	it('reads a save, and a clash with the other chair’s notes', () => {
		expect(
			readSaveOutcome({
				type: 'success',
				status: 200,
				data: { sessionNotesSaved: { revision: 3 } }
			})
		).toEqual({
			kind: 'saved',
			revision: 3
		});
		expect(
			readSaveOutcome({ type: 'failure', status: 409, data: { sessionNotesConflict: SARAS_NOTES } })
		).toEqual({ kind: 'conflict', current: SARAS_NOTES });
	});

	it('gives a refusal’s own words, or plain words for a break', () => {
		const refusal = { flash: { tone: 'error', message: SESSION_NOTES_REFUSALS.tooLong } };

		expect(readSaveOutcome({ type: 'failure', status: 400, data: refusal })).toEqual({
			kind: 'failed',
			message: SESSION_NOTES_REFUSALS.tooLong
		});
		expect(readSaveOutcome({ type: 'error', status: 500, error: 'boom' })).toEqual({
			kind: 'failed',
			message: SERVER_FAILURE_MESSAGE
		});
	});

	it('tells a lost connection and a lost sign-in apart', () => {
		expect(readSaveOutcome({ type: 'error', error: 'network' })).toEqual({
			kind: 'failed',
			message: NETWORK_FAILURE_MESSAGE
		});
		expect(readSaveOutcome({ type: 'redirect', status: 303, location: '/sign-in' })).toEqual({
			kind: 'failed',
			message: SESSION_NOTES_REFUSALS.signedOut
		});
	});
});
