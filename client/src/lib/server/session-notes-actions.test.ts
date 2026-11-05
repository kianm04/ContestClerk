import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChairCommittee, ChairRoomFrame, CommitteeSession } from '$lib/chair-room';
import { NOTES_SAVED_MESSAGE, SESSION_NOTES_REFUSALS, type SessionNotes } from '$lib/session-notes';
import type { ChairRequestEvent } from './chair-floor-actions';
import { sessionNotesActions } from './session-notes-actions';

// The save action with the database and the chair gate stood in for: what it
// refuses, what it hands `saveSessionNotes`, and how it answers the editor's
// background save and the plain form's Save. The rows themselves are tested
// in `tests/db/committee-session-notes.test.ts`.
vi.mock('./access', () => ({ requireCommitteePermission: vi.fn() }));
vi.mock('./committee-room', () => ({ getChairRoomFrame: vi.fn() }));
vi.mock('./flash', () => ({ setFlash: vi.fn() }));
vi.mock('./session-notes', () => ({ saveSessionNotes: vi.fn() }));

import { requireCommitteePermission } from './access';
import { getChairRoomFrame } from './committee-room';
import { setFlash } from './flash';
import { saveSessionNotes } from './session-notes';

const SUPABASE = {};
const COOKIES = {};
const RETURN_ADDRESS = '/conferences/test-mun/committees/unsc/chair';

const COMMITTEE = { id: 'committee-1' } as ChairCommittee;

const ENDED_SESSION: CommitteeSession = {
	id: 'session-1',
	name: 'Session 1',
	status: 'ended',
	startedAt: '2026-09-26T08:00:00.000Z',
	endedAt: '2026-09-26T09:00:00.000Z'
};

const SARAS_NOTES: SessionNotes = {
	body: 'Hers',
	bodyHtml: '<p>Hers</p>',
	revision: 4,
	updatedById: 'sara-id',
	updatedByName: 'Sara Okafor',
	updatedAt: '2026-09-26T09:30:00.000Z'
};

/** A refused save, with what it hands back beside the flash. */
type NotesFailResult = {
	status: number;
	data: {
		flash?: { tone: string; message: string };
		sessionNotesConflict?: SessionNotes;
		sessionNotesDraft?: string;
	};
};

/** A save posted with `fields`, on top of a session of this committee at revision 3. */
function makeEvent(fields: Record<string, string>): ChairRequestEvent {
	const formData = new FormData();
	const allFields = { sessionId: ENDED_SESSION.id, revision: '3', ...fields };

	for (const [name, value] of Object.entries(allFields)) {
		formData.set(name, value);
	}

	return {
		params: { slug: 'test-mun', committeeSlug: 'unsc' },
		url: new URL(`http://localhost${RETURN_ADDRESS}?/saveSessionNotes`),
		locals: { supabase: SUPABASE, getVerifiedClaims: async () => ({ sub: 'reader-id' }) },
		cookies: COOKIES,
		request: { formData: async () => formData }
	} as unknown as ChairRequestEvent;
}

const { saveSessionNotes: saveAction } = sessionNotesActions(() => RETURN_ADDRESS);

/** Run a save that is expected to redirect, and give back where it sent the chair. */
async function catchRedirect(run: () => unknown): Promise<{ status: number; location: string }> {
	try {
		await run();
	} catch (thrown) {
		return thrown as { status: number; location: string };
	}

	throw new Error('Expected a redirect.');
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(requireCommitteePermission).mockResolvedValue({
		committee: COMMITTEE
	} as Awaited<ReturnType<typeof requireCommitteePermission>>);
	// Only an ended session: notes can still be finished after it is over.
	vi.mocked(getChairRoomFrame).mockResolvedValue({
		sessions: [ENDED_SESSION]
	} as ChairRoomFrame);
});

describe('saveSessionNotes', () => {
	it('refuses a session of another committee', async () => {
		const result = (await saveAction(
			makeEvent({ sessionId: 'session-elsewhere', body: 'a', background: '1' })
		)) as NotesFailResult;

		expect(result.status).toBe(400);
		expect(result.data.flash).toEqual({ tone: 'error', message: SESSION_NOTES_REFUSALS.session });
		expect(saveSessionNotes).not.toHaveBeenCalled();
	});

	it('refuses a save that does not say which revision it started from', async () => {
		const result = (await saveAction(
			makeEvent({ body: 'a', revision: 'latest' })
		)) as NotesFailResult;

		expect(result.data.flash?.message).toBe(SESSION_NOTES_REFUSALS.revision);
		expect(saveSessionNotes).not.toHaveBeenCalled();
	});

	it('refuses notes longer than the database keeps', async () => {
		const result = (await saveAction(
			makeEvent({ body: 'a'.repeat(100_001), background: '1' })
		)) as NotesFailResult;

		expect(result.data.flash?.message).toBe(SESSION_NOTES_REFUSALS.tooLong);
		expect(saveSessionNotes).not.toHaveBeenCalled();
	});

	it('answers a background save with the new revision, without leaving the page', async () => {
		vi.mocked(saveSessionNotes).mockResolvedValue({ kind: 'saved', revision: 4 });

		const result = await saveAction(makeEvent({ body: '**France**', background: '1' }));

		expect(saveSessionNotes).toHaveBeenCalledWith(SUPABASE, {
			sessionId: ENDED_SESSION.id,
			committeeId: COMMITTEE.id,
			body: '**France**',
			baseRevision: 3
		});
		expect(result).toEqual({ sessionNotesSaved: { revision: 4 } });
	});

	it("hands a background save the other chair's notes when they saved first", async () => {
		vi.mocked(saveSessionNotes).mockResolvedValue({ kind: 'conflict', current: SARAS_NOTES });

		const result = (await saveAction(
			makeEvent({ body: 'Mine', background: '1' })
		)) as NotesFailResult;

		expect(result.status).toBe(409);
		expect(result.data.sessionNotesConflict).toEqual(SARAS_NOTES);
	});

	it("saves the plain form's Markdown as typed and sends the chair back", async () => {
		vi.mocked(saveSessionNotes).mockResolvedValue({ kind: 'saved', revision: 4 });

		// A browser sends the box's line breaks as `\r\n`; they are stored as `\n`.
		const redirect = await catchRedirect(() =>
			saveAction(makeEvent({ body: 'One\r\n\r\n**Two** <b>' }))
		);

		expect(vi.mocked(saveSessionNotes).mock.calls[0][1].body).toBe('One\n\n**Two** <b>');
		expect(setFlash).toHaveBeenCalledWith(COOKIES, {
			tone: 'success',
			message: NOTES_SAVED_MESSAGE
		});
		expect(redirect).toMatchObject({ status: 303, location: RETURN_ADDRESS });
	});

	it('gives the plain form its text back when another chair saved first', async () => {
		vi.mocked(saveSessionNotes).mockResolvedValue({ kind: 'conflict', current: SARAS_NOTES });

		const result = (await saveAction(makeEvent({ body: 'Mine' }))) as NotesFailResult;

		expect(result.status).toBe(409);
		expect(result.data.sessionNotesDraft).toBe('Mine');
		expect(result.data.flash?.tone).toBe('error');
		expect(result.data.flash?.message).toContain('Sara changed these notes.');
	});
});
