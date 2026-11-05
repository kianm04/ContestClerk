import { describe, expect, it } from 'vitest';
import { NETWORK_FAILURE_MESSAGE, SERVER_FAILURE_MESSAGE } from '$lib/in-place-form.svelte';
import {
	PAPER_WRITING_MESSAGES,
	WRITTEN_PAPER_MAX_LENGTH,
	countWords,
	draftChangedByText,
	draftSaveStatusText,
	isUnchangedResubmission,
	normaliseLineEnds,
	paperWayAction,
	paperWayTabs,
	paperWriteView,
	readDraftSaveOutcome,
	readPaperWay,
	wordCountText,
	writerStart,
	writtenPaperProblem
} from './paper-writing';

const SAVED_AT = Date.parse('2026-09-27T10:00:00Z');

describe('readPaperWay', () => {
	it('opens the way named in the address', () => {
		expect(readPaperWay('upload', false)).toBe('upload');
		expect(readPaperWay('write', true)).toBe('write');
	});

	it('otherwise opens the way the paper was handed in, and writing for no paper', () => {
		expect(readPaperWay(null, true)).toBe('upload');
		expect(readPaperWay(null, false)).toBe('write');
		expect(readPaperWay('something', false)).toBe('write');
	});
});

describe('paperWayTabs', () => {
	it('links both ways and marks the one open', () => {
		const tabs = paperWayTabs('thimun-2027', 'unsc', 'upload');

		expect(tabs.map((tab) => [tab.label, tab.href, tab.isActive])).toEqual([
			['Write it here', '/conferences/thimun-2027/committees/unsc/position-paper?way=write', false],
			['Upload a PDF', '/conferences/thimun-2027/committees/unsc/position-paper?way=upload', true]
		]);
	});
});

describe('paperWayAction', () => {
	it('keeps the way, and editing for writing, in front of the action', () => {
		expect(paperWayAction('upload', 'upload')).toBe('?way=upload&/upload');
		expect(paperWayAction('write', 'submitWritten')).toBe('?way=write&edit=1&/submitWritten');
	});
});

describe('countWords', () => {
	it('counts words and not the Markdown marks around them', () => {
		expect(countWords('## Small arms\n\n- One **binding** rule\n> quoted')).toBe(6);
	});

	it('counts numbers and words in other scripts', () => {
		expect(countWords('Résolution 2250 из 2015')).toBe(4);
	});

	it('is 0 for an empty or blank text', () => {
		expect(countWords('')).toBe(0);
		expect(countWords('  \n ## -')).toBe(0);
	});
});

describe('wordCountText', () => {
	it('says one word and many words', () => {
		expect(wordCountText(1)).toBe('1 word');
		expect(wordCountText(0)).toBe('0 words');
		expect(wordCountText(812)).toBe('812 words');
	});
});

describe('normaliseLineEnds', () => {
	it('turns Windows line ends into plain ones', () => {
		expect(normaliseLineEnds('one\r\ntwo\nthree')).toBe('one\ntwo\nthree');
	});
});

describe('writtenPaperProblem', () => {
	it('refuses a blank paper', () => {
		expect(writtenPaperProblem(' \n ')).toBe(PAPER_WRITING_MESSAGES.empty);
	});

	it('refuses a paper over the limit and takes one at it', () => {
		expect(writtenPaperProblem('a'.repeat(WRITTEN_PAPER_MAX_LENGTH + 1))).toBe(
			PAPER_WRITING_MESSAGES.tooLong
		);
		expect(writtenPaperProblem('a'.repeat(WRITTEN_PAPER_MAX_LENGTH))).toBeNull();
	});
});

describe('isUnchangedResubmission', () => {
	it('is true only for the same text the chair sent back', () => {
		expect(isUnchangedResubmission('Text', 'changes_requested', 'Text')).toBe(true);
		expect(isUnchangedResubmission('Text', 'changes_requested', 'Text, better')).toBe(false);
		expect(isUnchangedResubmission('Text', 'submitted', 'Text')).toBe(false);
		expect(isUnchangedResubmission(null, 'changes_requested', 'Text')).toBe(false);
	});
});

describe('paperWriteView', () => {
	it('shows the editor when there is nothing written yet and the paper is open', () => {
		expect(paperWriteView({ isWritten: false, isEditing: false, closedReason: null })).toBe(
			'editor'
		);
	});

	it('shows a submitted written paper read only until "Edit and resubmit"', () => {
		expect(paperWriteView({ isWritten: true, isEditing: false, closedReason: null })).toBe(
			'submitted'
		);
		expect(paperWriteView({ isWritten: true, isEditing: true, closedReason: null })).toBe('editor');
	});

	it('keeps a closed written paper readable, and shows only the reason otherwise', () => {
		expect(paperWriteView({ isWritten: true, isEditing: true, closedReason: 'Approved' })).toBe(
			'submitted'
		);
		expect(paperWriteView({ isWritten: false, isEditing: false, closedReason: 'Late' })).toBe(
			'closed'
		);
	});
});

describe('writerStart', () => {
	const DRAFT = {
		body: 'Draft text',
		revision: 4,
		updatedAt: '2026-09-27T10:00:00Z',
		updatedById: 'delegate-1',
		updatedByName: 'Tom Price'
	};

	it('carries on from the draft, and from the submitted text when there is none', () => {
		const fromDraft = { draft: DRAFT, submittedBody: 'Sent', returnedText: null };
		const fromSubmitted = { draft: null, submittedBody: 'Sent', returnedText: null };

		expect(writerStart({ ...fromDraft, conflictRevision: null })).toEqual({
			markdown: 'Draft text',
			revision: 4
		});
		expect(writerStart({ ...fromSubmitted, conflictRevision: null })).toEqual({
			markdown: 'Sent',
			revision: 0
		});
	});

	it('keeps text a refused save handed back, with the revision it met', () => {
		const start = writerStart({
			draft: DRAFT,
			submittedBody: null,
			returnedText: 'Mine',
			conflictRevision: 6
		});

		expect(start).toEqual({ markdown: 'Mine', revision: 6 });
	});

	it('starts empty for a seat with nothing written', () => {
		const start = writerStart({
			draft: null,
			submittedBody: null,
			returnedText: null,
			conflictRevision: null
		});

		expect(start).toEqual({ markdown: '', revision: 0 });
	});
});

describe('draftSaveStatusText', () => {
	it('says how long ago the draft was saved', () => {
		expect(draftSaveStatusText('saved', SAVED_AT, SAVED_AT + 12_000)).toBe('Saved 12s ago');
		expect(draftSaveStatusText('saved', SAVED_AT, SAVED_AT + 1_000)).toBe('Saved just now');
	});

	it('says saving, not saved, or nothing', () => {
		expect(draftSaveStatusText('waiting', SAVED_AT, SAVED_AT)).toBe('Saving…');
		expect(draftSaveStatusText('saving', null, SAVED_AT)).toBe('Saving…');
		expect(draftSaveStatusText('failed', SAVED_AT, SAVED_AT)).toBe('Not saved');
		expect(draftSaveStatusText('conflict', SAVED_AT, SAVED_AT)).toBe('Not saved');
		expect(draftSaveStatusText('saved', null, SAVED_AT)).toBe('');
	});
});

describe('readDraftSaveOutcome', () => {
	it('reads a save and its new revision', () => {
		const outcome = readDraftSaveOutcome({
			type: 'success',
			status: 200,
			data: { draftSaved: { revision: 3 } }
		});

		expect(outcome).toEqual({ kind: 'saved', revision: 3 });
	});

	it("reads a live save with the others' changes the page lacks (T148)", () => {
		const outcome = readDraftSaveOutcome({
			type: 'success',
			status: 200,
			data: { draftSaved: { revision: 4, missing: 'AAE=' } }
		});

		expect(outcome).toEqual({ kind: 'saved', revision: 4, missing: 'AAE=' });
	});

	it('reads a live save refused because the paper was submitted and started again', () => {
		const outcome = readDraftSaveOutcome({
			type: 'failure',
			status: 409,
			data: { flash: { tone: 'error', message: 'x' }, draftConflict: null, isDraftReplaced: true }
		});

		expect(outcome).toEqual({ kind: 'replaced' });
	});

	it('reads a clash with another window, and the draft that window saved', () => {
		const theirs = {
			body: 'Their text',
			bodyHtml: '<p>Their text</p>',
			revision: 5,
			updatedAt: '2026-09-27T10:00:00Z',
			updatedById: 'member-2',
			updatedByName: 'Rachel Morgan'
		};
		const outcome = readDraftSaveOutcome({
			type: 'failure',
			status: 409,
			data: { draftConflict: { revision: 5, theirs } }
		});

		expect(outcome).toEqual({ kind: 'conflict', revision: 5, theirs });
	});

	it('reads a clash with a draft that is gone', () => {
		const outcome = readDraftSaveOutcome({
			type: 'failure',
			status: 409,
			data: { draftConflict: { revision: 0, theirs: null } }
		});

		expect(outcome).toEqual({ kind: 'conflict', revision: 0, theirs: null });
	});

	it('reads a refusal in its own words', () => {
		const outcome = readDraftSaveOutcome({
			type: 'failure',
			status: 400,
			data: { flash: { tone: 'error', message: PAPER_WRITING_MESSAGES.tooLong } }
		});

		expect(outcome).toEqual({ kind: 'failed', message: PAPER_WRITING_MESSAGES.tooLong });
	});

	it('reads a redirect as a sign-in that ran out', () => {
		const outcome = readDraftSaveOutcome({ type: 'redirect', status: 303, location: '/login' });

		expect(outcome).toEqual({ kind: 'failed', message: PAPER_WRITING_MESSAGES.signedOut });
	});

	it('tells a network failure from a server failure', () => {
		expect(readDraftSaveOutcome({ type: 'error', error: 'network' })).toEqual({
			kind: 'failed',
			message: NETWORK_FAILURE_MESSAGE
		});
		expect(readDraftSaveOutcome({ type: 'error', status: 500, error: 'boom' })).toEqual({
			kind: 'failed',
			message: SERVER_FAILURE_MESSAGE
		});
		expect(readDraftSaveOutcome({ type: 'success', status: 200 })).toEqual({
			kind: 'failed',
			message: SERVER_FAILURE_MESSAGE
		});
	});
});

describe('draftChangedByText', () => {
	const THEIRS = {
		body: 'Their text',
		revision: 3,
		updatedAt: '2026-09-27T10:00:00Z',
		updatedById: 'member-2',
		updatedByName: 'Rachel Morgan'
	};

	it('names the fellow member who saved first by their first name', () => {
		expect(draftChangedByText(THEIRS, 'delegate-1')).toBe('Rachel changed this draft.');
	});

	it("calls the reader's own other window theirs", () => {
		expect(draftChangedByText(THEIRS, 'member-2')).toBe(
			'You changed this draft in another window.'
		);
	});

	it('says somebody else when the name cannot be read', () => {
		const unnamed = { ...THEIRS, updatedByName: null };

		expect(draftChangedByText(unnamed, 'delegate-1')).toBe('Somebody else changed this draft.');
	});
});
