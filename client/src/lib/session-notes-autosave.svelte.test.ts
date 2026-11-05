import type { ActionResult } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTES_SAVE_DELAY_MS, type SessionNotes } from './session-notes';
import { createNotesAutosave } from './session-notes-autosave.svelte';

// SvelteKit's `deserialize` only works inside a running app. The stand-in
// fetch below answers in plain JSON, so reading it back is `JSON.parse`.
vi.mock('$app/forms', () => ({ deserialize: (text: string) => JSON.parse(text) }));

const STORED: SessionNotes = {
	body: 'Opening',
	bodyHtml: 'Opening',
	revision: 2,
	updatedById: 'chair-1',
	updatedByName: 'Amira Haddad',
	updatedAt: '2026-09-26T09:00:00.000Z'
};

const SARAS_NOTES: SessionNotes = {
	body: 'Hers',
	bodyHtml: '<p>Hers</p>',
	revision: 3,
	updatedById: 'sara-id',
	updatedByName: 'Sara Okafor',
	updatedAt: '2026-09-26T09:30:00.000Z'
};

const fetchMock = vi.fn();

/** Make the next save answer with `result`. */
function answerWith(result: ActionResult) {
	fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(result)));
}

/** The fields of the save sent `index` saves ago, counting from the first. */
function sentFields(index: number): Record<string, string> {
	const body = fetchMock.mock.calls[index][1].body as FormData;

	return Object.fromEntries(body.entries()) as Record<string, string>;
}

/** Let the save delay pass and every answer arrive. */
async function waitForSave() {
	await vi.advanceTimersByTimeAsync(NOTES_SAVE_DELAY_MS);
}

function makeAutosave() {
	return createNotesAutosave({
		action: '?/saveSessionNotes',
		sessionId: 'session-1',
		notes: STORED
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('createNotesAutosave', () => {
	it('saves a moment after the last change, starting from the stored revision', async () => {
		const autosave = makeAutosave();
		answerWith({ type: 'success', status: 200, data: { sessionNotesSaved: { revision: 3 } } });

		autosave.edit('Opening\n\n**France**');
		expect(autosave.status).toBe('waiting');
		expect(fetchMock).not.toHaveBeenCalled();

		await waitForSave();

		expect(sentFields(0)).toEqual({
			sessionId: 'session-1',
			body: 'Opening\n\n**France**',
			revision: '2',
			background: '1'
		});
		expect(autosave.status).toBe('saved');
		expect(autosave.hasUnsavedText).toBe(false);
	});

	it('sends nothing when the text was typed back to what is stored', async () => {
		const autosave = makeAutosave();

		autosave.edit('Opening');
		await waitForSave();

		expect(fetchMock).not.toHaveBeenCalled();
		expect(autosave.status).toBe('saved');
	});

	it('keeps the text after a failed save and tries again on the next change', async () => {
		const autosave = makeAutosave();
		fetchMock.mockRejectedValueOnce(new TypeError('offline'));

		autosave.edit('Lost?');
		await waitForSave();

		expect(autosave.status).toBe('failed');
		expect(autosave.failureMessage).toMatch(/did not reach the server/);
		expect(autosave.hasUnsavedText).toBe(true);
		expect(autosave.isAtRisk).toBe(true);

		answerWith({ type: 'success', status: 200, data: { sessionNotesSaved: { revision: 3 } } });
		autosave.edit('Lost? No.');
		await waitForSave();

		expect(sentFields(1).body).toBe('Lost? No.');
		expect(autosave.status).toBe('saved');
	});

	it('stops on another chair\'s notes, then saves over them on "Keep mine"', async () => {
		const autosave = makeAutosave();
		answerWith({ type: 'failure', status: 409, data: { sessionNotesConflict: SARAS_NOTES } });

		autosave.edit('Mine');
		await waitForSave();

		expect(autosave.status).toBe('conflict');
		expect(autosave.conflict).toEqual(SARAS_NOTES);

		// Typing on sends nothing until the chair has chosen.
		autosave.edit('Mine, more');
		await waitForSave();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		answerWith({ type: 'success', status: 200, data: { sessionNotesSaved: { revision: 4 } } });
		autosave.keepMine();
		await vi.advanceTimersByTimeAsync(0);

		expect(sentFields(1)).toMatchObject({ body: 'Mine, more', revision: '3' });
		expect(autosave.conflict).toBeNull();
		expect(autosave.status).toBe('saved');
	});

	it('puts the other chair\'s notes in the editor on "Use theirs"', async () => {
		const autosave = makeAutosave();
		answerWith({ type: 'failure', status: 409, data: { sessionNotesConflict: SARAS_NOTES } });

		autosave.edit('Mine');
		await waitForSave();
		const versionBefore = autosave.editorVersion;
		autosave.useTheirs();

		expect(autosave.editorStartMarkdown).toBe('Hers');
		expect(autosave.editorVersion).toBe(versionBefore + 1);
		expect(autosave.status).toBe('saved');
		expect(autosave.hasUnsavedText).toBe(false);
	});

	it("starts the editor from text typed before the page's script ran, and saves it", async () => {
		const autosave = makeAutosave();
		answerWith({ type: 'success', status: 200, data: { sessionNotesSaved: { revision: 3 } } });

		autosave.startFromTypedText('Typed **early**');
		await waitForSave();

		expect(autosave.editorStartMarkdown).toBe('Typed **early**');
		expect(sentFields(0).body).toBe('Typed **early**');
	});
});
