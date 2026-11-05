import type { ActionResult } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftAutosave } from './paper-draft-autosave.svelte';
import { DRAFT_SAVE_DELAY_MS, type PaperDraft, type TheirDraft } from './paper-writing';

// SvelteKit's `deserialize` only works inside a running app. The stand-in
// fetch below answers in plain JSON, so reading it back is `JSON.parse`.
vi.mock('$app/forms', () => ({ deserialize: (text: string) => JSON.parse(text) }));

const ACTION = '?way=write&edit=1&/saveDraft';

const STORED: PaperDraft = {
	body: 'France supports',
	revision: 2,
	updatedAt: '2026-09-27T09:00:00.000Z',
	updatedById: 'delegate-1',
	updatedByName: 'Tom Price'
};

/** The draft a fellow member of the delegation saved first (T147). */
const THEIRS: TheirDraft = {
	body: 'France supports, says Rachel',
	bodyHtml: '<p>France supports, says Rachel</p>',
	revision: 5,
	updatedAt: '2026-09-27T09:30:00.000Z',
	updatedById: 'member-2',
	updatedByName: 'Rachel Morgan'
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
	await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
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

describe('createDraftAutosave', () => {
	it('saves a moment after the last change, to the action, from the stored revision', async () => {
		const autosave = createDraftAutosave({
			action: ACTION,
			readerId: 'delegate-1',
			startMarkdown: STORED.body,
			draft: STORED
		});
		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 3 } } });

		autosave.edit('France supports the treaty');
		expect(autosave.status).toBe('waiting');
		expect(fetchMock).not.toHaveBeenCalled();

		await waitForSave();

		expect(fetchMock.mock.calls[0][0]).toBe(ACTION);
		expect(sentFields(0)).toEqual({
			body: 'France supports the treaty',
			revision: '2',
			background: '1'
		});
		expect(autosave.status).toBe('saved');
		expect(autosave.hasUnsavedText).toBe(false);
		expect(autosave.lastEditor).toEqual({ id: 'delegate-1', name: null });
	});

	it('starts a first draft from revision 0 and carries on from the revision it got', async () => {
		const autosave = createDraftAutosave({
			action: ACTION,
			readerId: 'delegate-1',
			startMarkdown: '',
			draft: null
		});
		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 1 } } });
		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 2 } } });

		autosave.edit('One');
		await waitForSave();
		autosave.edit('One two');
		await waitForSave();

		expect(sentFields(0).revision).toBe('0');
		expect(sentFields(1).revision).toBe('1');
	});

	it('sends nothing for "Edit and resubmit" until the submitted text changes', async () => {
		const autosave = createDraftAutosave({
			action: ACTION,
			readerId: 'delegate-1',
			startMarkdown: 'Sent',
			draft: null
		});

		autosave.edit('Sent!');
		autosave.edit('Sent');
		await waitForSave();

		expect(fetchMock).not.toHaveBeenCalled();
		expect(autosave.status).toBe('saved');
	});

	it('keeps the text after a failed save and says why', async () => {
		const autosave = createDraftAutosave({
			action: ACTION,
			readerId: 'delegate-1',
			startMarkdown: STORED.body,
			draft: STORED
		});
		fetchMock.mockRejectedValueOnce(new TypeError('offline'));

		autosave.edit('Lost?');
		await waitForSave();

		expect(autosave.status).toBe('failed');
		expect(autosave.failureMessage).toMatch(/did not reach the server/);
		expect(autosave.hasUnsavedText).toBe(true);
		expect(autosave.isAtRisk).toBe(true);
	});

	it('stops on a draft saved first, then saves over it on "Keep mine"', async () => {
		const autosave = createDraftAutosave({
			action: ACTION,
			readerId: 'delegate-1',
			startMarkdown: STORED.body,
			draft: STORED
		});
		answerWith({
			type: 'failure',
			status: 409,
			data: { draftConflict: { revision: 5, theirs: THEIRS } }
		});

		autosave.edit('Mine');
		await waitForSave();

		expect(autosave.status).toBe('conflict');
		expect(autosave.hasConflict).toBe(true);
		expect(autosave.theirDraft).toEqual(THEIRS);

		// Typing on sends nothing while the clash waits for the delegate.
		autosave.edit('Mine, longer');
		await waitForSave();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 6 } } });
		autosave.keepMine();
		await waitForSave();

		expect(sentFields(1)).toMatchObject({ body: 'Mine, longer', revision: '5' });
		expect(autosave.hasConflict).toBe(false);
		expect(autosave.status).toBe('saved');
	});

	it('puts the draft saved first in the editor on "Use theirs", and sends nothing', async () => {
		const autosave = createDraftAutosave({
			action: ACTION,
			readerId: 'delegate-1',
			startMarkdown: STORED.body,
			draft: STORED
		});
		answerWith({
			type: 'failure',
			status: 409,
			data: { draftConflict: { revision: 5, theirs: THEIRS } }
		});

		autosave.edit('Mine');
		await waitForSave();
		autosave.useTheirs();

		expect(autosave.hasConflict).toBe(false);
		expect(autosave.status).toBe('saved');
		expect(autosave.editorStartMarkdown).toBe(THEIRS.body);
		expect(autosave.editorVersion).toBe(1);
		expect(autosave.hasUnsavedText).toBe(false);
		expect(autosave.savedAt).toBe(Date.parse(THEIRS.updatedAt));
		expect(autosave.lastEditor).toEqual({ id: 'member-2', name: 'Rachel Morgan' });

		// The next change carries on from their revision.
		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 6 } } });
		autosave.edit(`${THEIRS.body}, and Tom`);
		await waitForSave();

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(sentFields(1)).toMatchObject({ revision: '5' });
	});

	it('starts the draft again on "Keep mine" when the one it met is gone', async () => {
		const autosave = createDraftAutosave({
			action: ACTION,
			readerId: 'delegate-1',
			startMarkdown: STORED.body,
			draft: STORED
		});
		answerWith({
			type: 'failure',
			status: 409,
			data: { draftConflict: { revision: 0, theirs: null } }
		});

		autosave.edit('Mine');
		await waitForSave();

		expect(autosave.theirDraft).toBeNull();

		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 1 } } });
		autosave.keepMine();
		await waitForSave();

		expect(sentFields(1)).toMatchObject({ body: 'Mine', revision: '0' });
		expect(autosave.status).toBe('saved');
	});

	it('saves again when the delegate typed on while a save was on its way', async () => {
		const autosave = createDraftAutosave({
			action: ACTION,
			readerId: 'delegate-1',
			startMarkdown: STORED.body,
			draft: STORED
		});
		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 3 } } });
		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 4 } } });

		autosave.edit('First');
		const firstSave = autosave.saveNow();
		autosave.edit('First and second');
		await firstSave;

		expect(autosave.status).toBe('waiting');

		await waitForSave();

		expect(sentFields(1)).toMatchObject({ body: 'First and second', revision: '3' });
		expect(autosave.status).toBe('saved');
	});

	it('sends nothing once stopped', async () => {
		const autosave = createDraftAutosave({
			action: ACTION,
			readerId: 'delegate-1',
			startMarkdown: STORED.body,
			draft: STORED
		});

		autosave.edit('Going away');
		autosave.stop();
		await waitForSave();

		expect(fetchMock).not.toHaveBeenCalled();
	});
});
