import type { ActionResult } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
	base64ToBytes,
	bytesToBase64,
	openPaperDocument,
	paperDocumentMarkdown,
	paperDocumentState,
	seedPaperDocument,
	writeMarkdownIntoPaperDocument
} from './paper-document';
import { CHANNEL_ORIGIN } from './paper-live-channel';
import { createLivePaperSave } from './paper-live-save.svelte';
import { DRAFT_SAVE_DELAY_MS, PAPER_WRITING_MESSAGES, type PaperDraft } from './paper-writing';

// SvelteKit's `deserialize` only works inside a running app. The stand-in
// fetch below answers in plain JSON, so reading it back is `JSON.parse`.
vi.mock('$app/forms', () => ({ deserialize: (text: string) => JSON.parse(text) }));

const ACTION = '?/saveDraft';

const STORED: PaperDraft = {
	body: 'France supports the treaty.',
	revision: 2,
	updatedAt: '2026-09-27T09:00:00.000Z',
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

/** The stored draft's document, as the page opens it, and a save helper on it. */
function startSaving() {
	const document = openPaperDocument(seedPaperDocument(STORED.body));
	const save = createLivePaperSave({
		action: ACTION,
		replacedMessage: PAPER_WRITING_MESSAGES.replaced,
		document,
		draft: STORED,
		readerId: 'member-1'
	});

	return { document, save };
}

/** Type `text` at the end of the paper, as the writer at this page. */
function type(document: Y.Doc, text: string) {
	writeMarkdownIntoPaperDocument(document, `${paperDocumentMarkdown(document)}${text}`);
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

describe('createLivePaperSave', () => {
	it('posts the whole document a moment after the writer types, from the stored revision', async () => {
		const { document, save } = startSaving();
		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 3 } } });

		type(document, ' Tom agrees.');
		expect(save.status).toBe('waiting');
		expect(save.hasUnsavedText).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);

		expect(fetchMock.mock.calls[0][0]).toBe(ACTION);
		expect(sentFields(0)).toEqual({
			document: bytesToBase64(paperDocumentState(document)),
			revision: '2',
			background: '1'
		});
		expect(save.status).toBe('saved');
		expect(save.hasUnsavedText).toBe(false);
		expect(save.lastEditor).toEqual({ id: 'member-1', name: null });
	});

	it('does not save what arrived from the others, which their own pages save', async () => {
		const { document } = startSaving();
		const rachels = openPaperDocument(seedPaperDocument(STORED.body));
		type(rachels, ' Rachel agrees.');

		Y.applyUpdate(document, paperDocumentState(rachels), CHANNEL_ORIGIN);
		await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("applies the others' saved words the answer carries, and saves from the new revision", async () => {
		const { document, save } = startSaving();
		const rachels = openPaperDocument(seedPaperDocument(STORED.body));
		type(rachels, ' Rachel agrees.');
		const missing = bytesToBase64(paperDocumentState(rachels));
		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 5, missing } } });
		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 6 } } });

		type(document, ' Tom too.');
		await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);

		expect(paperDocumentMarkdown(document)).toContain('Rachel agrees.');
		expect(paperDocumentMarkdown(document)).toContain('Tom too.');
		// Their words are stored already, so they send nothing on their own.
		await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		type(document, ' More.');
		await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
		expect(sentFields(1).revision).toBe('5');
		expect(save.status).toBe('saved');
	});

	it("asks for the others' saves when told to, even with nothing of its own", async () => {
		const { save } = startSaving();
		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 2 } } });

		await save.saveNow();
		expect(fetchMock).not.toHaveBeenCalled();

		await save.saveNow(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(save.status).toBe('saved');
		// Asking is not a save of this writer's, so the last editor stays who it was.
		expect(save.lastEditor).toEqual({ id: 'member-2', name: 'Rachel Morgan' });
	});

	it('keeps the writing and says so when a save fails, then saves it on the next try', async () => {
		const { document, save } = startSaving();
		fetchMock.mockRejectedValueOnce(new TypeError('offline'));
		answerWith({ type: 'success', status: 200, data: { draftSaved: { revision: 3 } } });

		type(document, ' Offline words.');
		await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);

		expect(save.status).toBe('failed');
		expect(save.isAtRisk).toBe(true);
		expect(save.failureMessage).not.toBeNull();

		await save.saveNow();
		expect(save.status).toBe('saved');
		expect(save.failureMessage).toBeNull();
		expect(base64ToBytes(sentFields(1).document)).toEqual(paperDocumentState(document));
	});

	it('stops saving once the draft was submitted and started again elsewhere', async () => {
		const { document, save } = startSaving();
		answerWith({ type: 'failure', status: 409, data: { isDraftReplaced: true } });

		type(document, ' Late words.');
		await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);

		expect(save.isReplaced).toBe(true);
		expect(save.failureMessage).toBe(PAPER_WRITING_MESSAGES.replaced);

		type(document, ' More.');
		await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('stops listening to the document once stopped', async () => {
		const { document, save } = startSaving();

		save.stop();
		type(document, ' After leaving.');
		await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DELAY_MS);

		expect(fetchMock).not.toHaveBeenCalled();
	});
});
