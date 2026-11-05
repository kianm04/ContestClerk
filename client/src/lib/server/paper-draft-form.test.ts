import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PAPER_WRITING_MESSAGES, WRITTEN_PAPER_MAX_LENGTH } from '$lib/paper-writing';
import type { LivePaperStore } from '$lib/server/paper-live-drafts';
import {
	readWrittenForm,
	refuseWriting,
	saveDraftFromForm,
	saveLivePaperFromForm
} from './paper-draft-form';

// The save itself is stood in for: its revision rules have their own tests in
// `position-paper-drafts.test.ts`. These are about how a posted form is read
// and how each outcome is answered, the same on both pages that save a draft.
vi.mock('$lib/server/position-paper-drafts', () => ({ savePaperDraft: vi.fn() }));
vi.mock('$lib/server/paper-live-drafts', () => ({
	LIVE_DOCUMENT_MAX_BYTES: 30,
	positionPaperDraftStore: vi.fn(),
	readLiveDocumentState: vi.fn(),
	saveLivePaper: vi.fn(),
	storedSuggestionCount: vi.fn()
}));

import {
	positionPaperDraftStore,
	readLiveDocumentState,
	saveLivePaper,
	storedSuggestionCount
} from '$lib/server/paper-live-drafts';
import { savePaperDraft } from '$lib/server/position-paper-drafts';

const SUPABASE = {} as SupabaseClient;

/** Where the paper is kept: the stand-in save above never looks inside it. */
const STORE = {} as LivePaperStore;

/** A form as the writer posts it. */
function formOf(fields: Record<string, string>): FormData {
	const formData = new FormData();

	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return formData;
}

beforeEach(() => {
	vi.mocked(savePaperDraft).mockReset();
	vi.mocked(saveLivePaper).mockReset();
	vi.mocked(positionPaperDraftStore).mockReset().mockReturnValue(STORE);
	// Unless a test says otherwise, the stored draft has no suggestions open.
	vi.mocked(readLiveDocumentState).mockReset().mockResolvedValue(null);
	vi.mocked(storedSuggestionCount).mockReset().mockReturnValue(0);
});

describe('readWrittenForm', () => {
	it('reads the text with plain line breaks, the revision and whether it is the autosave', () => {
		const form = readWrittenForm(formOf({ body: 'One\r\nTwo', revision: '3', background: '1' }));

		expect(form).toEqual({ body: 'One\nTwo', baseRevision: 3, isBackground: true, document: null });
	});

	it('reads a revision that is not one as null', () => {
		expect(readWrittenForm(formOf({ body: 'A', revision: 'x' })).baseRevision).toBeNull();
	});
});

describe('refuseWriting', () => {
	it('hands the text back with a toast, and the clash when there is one', () => {
		const refusal = refuseWriting(409, 'Clash', 'Mine', { revision: 4, theirs: null });

		expect(refusal).toMatchObject({
			status: 409,
			data: {
				flash: { tone: 'error', message: 'Clash' },
				draftText: 'Mine',
				draftConflict: { revision: 4, theirs: null }
			}
		});
	});
});

describe('saveDraftFromForm', () => {
	it('saves and answers with the revision now stored', async () => {
		vi.mocked(savePaperDraft).mockResolvedValue({ kind: 'saved', revision: 5 });

		const form = readWrittenForm(formOf({ body: 'Text', revision: '4' }));
		const result = await saveDraftFromForm(SUPABASE, 'seat-1', form);

		expect(savePaperDraft).toHaveBeenCalledWith(SUPABASE, {
			seatId: 'seat-1',
			body: 'Text',
			baseRevision: 4
		});
		expect(result).toEqual({ refusal: null, revision: 5, missing: null });
	});

	it('refuses a missing revision and a text that is too long, saving nothing', async () => {
		const noRevision = await saveDraftFromForm(
			SUPABASE,
			'seat-1',
			readWrittenForm(formOf({ body: 'Text' }))
		);
		const tooLong = await saveDraftFromForm(
			SUPABASE,
			'seat-1',
			readWrittenForm(formOf({ body: 'a'.repeat(WRITTEN_PAPER_MAX_LENGTH + 1), revision: '1' }))
		);

		expect(noRevision.refusal).toMatchObject({
			status: 400,
			data: { flash: { message: PAPER_WRITING_MESSAGES.revision } }
		});
		expect(tooLong.refusal).toMatchObject({
			status: 400,
			data: { flash: { message: PAPER_WRITING_MESSAGES.tooLong } }
		});
		expect(savePaperDraft).not.toHaveBeenCalled();
	});

	it('hands back the draft saved first, with its text made safe to draw', async () => {
		const theirs = {
			body: 'Theirs **now**',
			revision: 6,
			updatedAt: '2026-09-27T10:00:00Z',
			updatedById: 'member-2',
			updatedByName: 'Rachel Morgan'
		};
		vi.mocked(savePaperDraft).mockResolvedValue({ kind: 'conflict', revision: 6, theirs });

		const form = readWrittenForm(formOf({ body: 'Mine', revision: '4' }));
		const result = await saveDraftFromForm(SUPABASE, 'seat-1', form);

		expect(result.refusal).toMatchObject({
			status: 409,
			data: { draftText: 'Mine', draftConflict: { revision: 6, theirs: { ...theirs } } }
		});
		expect(result.refusal?.data.draftConflict?.theirs?.bodyHtml).toContain('<strong>now</strong>');
	});

	it('answers a database failure with a 500 that keeps the text', async () => {
		vi.mocked(savePaperDraft).mockRejectedValue(new Error('down'));

		const form = readWrittenForm(formOf({ body: 'Mine', revision: '4' }));
		const result = await saveDraftFromForm(SUPABASE, 'seat-1', form);

		expect(result.refusal).toMatchObject({ status: 500, data: { draftText: 'Mine' } });
	});

	it('saves no plain text over suggestions still to decide, and says how many', async () => {
		const stored = new Uint8Array([1, 2]);
		vi.mocked(readLiveDocumentState).mockResolvedValue(stored);
		vi.mocked(storedSuggestionCount).mockReturnValue(2);

		const form = readWrittenForm(formOf({ body: 'Mine', revision: '4' }));
		const result = await saveDraftFromForm(SUPABASE, 'seat-1', form);

		expect(readLiveDocumentState).toHaveBeenCalledWith(SUPABASE, 'seat-1');
		expect(storedSuggestionCount).toHaveBeenCalledWith(stored);
		expect(result.refusal).toMatchObject({
			status: 409,
			data: {
				flash: { message: expect.stringMatching(/^2 suggestions are still to be decided/) },
				draftText: 'Mine'
			}
		});
		expect(savePaperDraft).not.toHaveBeenCalled();
	});

	it('merges a live document instead, and answers with what the page lacks (T148)', async () => {
		vi.mocked(saveLivePaper).mockResolvedValue({
			kind: 'saved',
			revision: 9,
			missing: new Uint8Array([0, 1])
		});

		const form = readWrittenForm(formOf({ body: 'Mine', revision: '4', document: 'AAEC' }));
		const result = await saveDraftFromForm(SUPABASE, 'seat-1', form);

		expect(positionPaperDraftStore).toHaveBeenCalledWith(SUPABASE, 'seat-1');
		expect(saveLivePaper).toHaveBeenCalledWith(STORE, {
			document: new Uint8Array([0, 1, 2]),
			lastRevision: 4
		});
		expect(savePaperDraft).not.toHaveBeenCalled();
		expect(result).toEqual({ refusal: null, revision: 9, missing: 'AAE=' });
	});

	it('tells a live page its document is no longer the draft, so it stops saving', async () => {
		vi.mocked(saveLivePaper).mockResolvedValue({ kind: 'replaced' });

		const form = readWrittenForm(formOf({ body: 'Mine', revision: '4', document: 'AAEC' }));
		const result = await saveDraftFromForm(SUPABASE, 'seat-1', form);

		expect(result.refusal).toMatchObject({
			status: 409,
			data: { isDraftReplaced: true, flash: { message: PAPER_WRITING_MESSAGES.replaced } }
		});
	});

	it('refuses a live document that is too big or not base64, saving nothing', async () => {
		const tooBig = readWrittenForm(formOf({ revision: '4', document: 'A'.repeat(41) }));
		const unreadable = readWrittenForm(formOf({ revision: '4', document: '!!' }));

		expect((await saveDraftFromForm(SUPABASE, 'seat-1', tooBig)).refusal).toMatchObject({
			status: 400,
			data: { flash: { message: PAPER_WRITING_MESSAGES.tooLong } }
		});
		expect((await saveDraftFromForm(SUPABASE, 'seat-1', unreadable)).refusal).toMatchObject({
			status: 400,
			data: { flash: { message: PAPER_WRITING_MESSAGES.revision } }
		});
		expect(saveLivePaper).not.toHaveBeenCalled();
	});

	it('refuses a live paper the merge made too long', async () => {
		vi.mocked(saveLivePaper).mockResolvedValue({ kind: 'tooLong' });

		const form = readWrittenForm(formOf({ revision: '4', document: 'AAEC' }));
		const result = await saveDraftFromForm(SUPABASE, 'seat-1', form);

		expect(result.refusal).toMatchObject({ status: 400 });
	});
});

describe('saveLivePaperFromForm', () => {
	/** A committee paper's words for the two refusals that are the paper's own. */
	const MESSAGES = { replaced: 'You left this paper.', tooLong: 'Shorten this paper.' };

	it('merges the document into whichever paper it is handed', async () => {
		vi.mocked(saveLivePaper).mockResolvedValue({
			kind: 'saved',
			revision: 3,
			missing: new Uint8Array()
		});

		const form = readWrittenForm(formOf({ revision: '2', document: 'AAEC' }));
		const result = await saveLivePaperFromForm(STORE, form, MESSAGES);

		expect(saveLivePaper).toHaveBeenCalledWith(STORE, {
			document: new Uint8Array([0, 1, 2]),
			lastRevision: 2
		});
		expect(result).toEqual({ refusal: null, revision: 3, missing: '' });
	});

	it("tells the writer the paper's own words once their page can no longer save it", async () => {
		vi.mocked(saveLivePaper).mockResolvedValue({ kind: 'replaced' });

		const form = readWrittenForm(formOf({ revision: '2', document: 'AAEC' }));
		const result = await saveLivePaperFromForm(STORE, form, MESSAGES);

		expect(result.refusal).toMatchObject({
			status: 409,
			data: { isDraftReplaced: true, flash: { message: 'You left this paper.' } }
		});
	});

	it("refuses a paper the merge made too long in the paper's own words", async () => {
		vi.mocked(saveLivePaper).mockResolvedValue({ kind: 'tooLong' });

		const form = readWrittenForm(formOf({ body: 'Mine', revision: '2', document: 'AAEC' }));
		const result = await saveLivePaperFromForm(STORE, form, MESSAGES);

		expect(result.refusal).toMatchObject({
			status: 400,
			data: { draftText: 'Mine', flash: { message: 'Shorten this paper.' } }
		});
	});

	it('refuses a form that brought no document, saving nothing', async () => {
		const form = readWrittenForm(formOf({ body: 'Mine', revision: '2' }));
		const result = await saveLivePaperFromForm(STORE, form, MESSAGES);

		expect(result.refusal).toMatchObject({ status: 400, data: { draftText: 'Mine' } });
		expect(saveLivePaper).not.toHaveBeenCalled();
	});

	it('answers a database failure with a 500 that keeps the text', async () => {
		vi.mocked(saveLivePaper).mockRejectedValue(new Error('down'));

		const form = readWrittenForm(formOf({ body: 'Mine', revision: '2', document: 'AAEC' }));
		const result = await saveLivePaperFromForm(STORE, form, MESSAGES);

		expect(result.refusal).toMatchObject({ status: 500, data: { draftText: 'Mine' } });
	});
});
