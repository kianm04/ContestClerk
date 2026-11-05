import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
	openPaperDocument,
	paperDocumentMarkdown,
	paperDocumentState,
	seedPaperDocument,
	writeMarkdownIntoPaperDocument
} from '$lib/paper-document';
import {
	positionPaperDraftStore,
	readLiveDocumentState,
	saveLivePaper
} from '$lib/server/paper-live-drafts';
import {
	deletePaperDraft,
	readPaperDraft,
	savePaperDraft
} from '$lib/server/position-paper-drafts';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addCommittee,
	addDelegation,
	addSeat,
	createOpenConferenceOwnedByMe,
	giveSeatTo
} from './conference-fixtures';

// T148: while a delegation writes a paper together, each browser posts its
// whole Yjs document, and `saveLivePaper` merges it into the one stored beside
// the draft and writes the Markdown out from the merge. These run it against
// the real database, as the members themselves, so Row Level Security is the
// one deciding who may save.

/** A seated writer and a fellow member of their delegation, both able to save the seat's draft. */
type DraftFixture = { writer: SignedInClient; member: SignedInClient; seatId: string };

async function createDraftFixture(): Promise<DraftFixture> {
	const fixture = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(fixture.supabase, fixture.conferenceId);
	const seatId = await addSeat(fixture.supabase, committeeId, 'France', 'FR');
	const writer = await createSignedInClient('Tom Price');
	const member = await createSignedInClient('Rachel Morgan');

	const delegationId = await addDelegation(member.supabase, fixture.conferenceId, "St Aidan's");
	const { error } = await createServiceRoleClient()
		.from('delegation_members')
		.insert({ delegation_id: delegationId, user_id: writer.userId, role: 'member' });

	if (error) {
		throw new Error(`Could not add the fixture member: ${error.message}`);
	}

	await giveSeatTo(fixture.supabase, seatId, writer.userId);

	return { writer, member, seatId };
}

/** A browser's document for a paper with no draft yet, holding what its writer typed. */
function typedDocument(markdown: string): Y.Doc {
	const document = openPaperDocument(seedPaperDocument(''));
	writeMarkdownIntoPaperDocument(document, markdown);

	return document;
}

/** Post `document` into the seat's draft as `reader`'s page does, and answer how it went. */
function saveLive(reader: SignedInClient, seatId: string, document: Y.Doc, lastRevision: number) {
	return saveLivePaper(positionPaperDraftStore(reader.supabase, seatId), {
		document: paperDocumentState(document),
		lastRevision
	});
}

/** Save `document` as `reader`, failing the test unless it is stored. */
async function save(reader: SignedInClient, seatId: string, document: Y.Doc, lastRevision = 0) {
	const result = await saveLive(reader, seatId, document, lastRevision);

	if (result.kind !== 'saved') throw new Error(`The save came back ${result.kind}.`);

	return result;
}

describe('saveLivePaper, into a position paper draft', () => {
	it("merges two members' documents, and the stored Markdown matches the merge", async () => {
		const { writer, member, seatId } = await createDraftFixture();
		const tom = typedDocument('Tom wrote this.');
		const rachel = typedDocument('Rachel wrote that.');

		await save(writer, seatId, tom);
		const answer = await save(member, seatId, rachel);
		Y.applyUpdate(rachel, answer.missing);

		const stored = await readPaperDraft(member.supabase, seatId);
		const storedState = await readLiveDocumentState(member.supabase, seatId);

		expect(paperDocumentMarkdown(rachel)).toContain('Tom wrote this.');
		expect(paperDocumentMarkdown(rachel)).toContain('Rachel wrote that.');
		expect(stored?.body).toBe(paperDocumentMarkdown(rachel));
		expect(storedState && paperDocumentMarkdown(openPaperDocument(storedState))).toBe(stored?.body);
		expect(stored?.updatedByName).toBe('Rachel Morgan');
	});

	it('keeps edits made offline from a stale copy when it is saved later', async () => {
		const { writer, member, seatId } = await createDraftFixture();
		const tom = typedDocument('First.\n\nSecond.');
		const first = await save(writer, seatId, tom);

		// Rachel's page opened the stored draft, then lost its connection.
		const offline = openPaperDocument(paperDocumentState(tom));
		writeMarkdownIntoPaperDocument(tom, 'First.\n\nSecond, by Tom.');
		await save(writer, seatId, tom, first.revision);
		writeMarkdownIntoPaperDocument(offline, 'First, by Rachel.\n\nSecond.');
		await save(member, seatId, offline, first.revision);

		const stored = await readPaperDraft(writer.supabase, seatId);

		expect(stored?.body).toBe('First, by Rachel.\n\nSecond, by Tom.');
	});

	it('stores nothing new, and moves no revision, when the save brings nothing new', async () => {
		const { writer, member, seatId } = await createDraftFixture();
		const tom = typedDocument('Only Tom.');
		const saved = await save(writer, seatId, tom);

		const rachel = openPaperDocument(paperDocumentState(tom));
		const asked = await save(member, seatId, rachel, saved.revision);

		expect(asked.revision).toBe(saved.revision);
	});

	it('refuses a document the draft has moved on from, as after a submit', async () => {
		const { writer, member, seatId } = await createDraftFixture();
		const old = typedDocument('The first draft.');
		const saved = await save(writer, seatId, old);
		await deletePaperDraft(writer.supabase, seatId);

		const afterSubmit = await saveLive(member, seatId, old, saved.revision);
		// "Edit and resubmit" started the draft again from the submitted text.
		const restarted = openPaperDocument(seedPaperDocument('The first draft.'));
		await save(writer, seatId, restarted);
		const otherStart = await saveLive(member, seatId, old, 0);

		expect(afterSubmit).toEqual({ kind: 'replaced' });
		expect(otherStart).toEqual({ kind: 'replaced' });
	});

	it("keeps a live page's edits after a Markdown save, when the draft began as Markdown", async () => {
		const { writer, member, seatId } = await createDraftFixture();
		const first = await savePaperDraft(writer.supabase, {
			seatId,
			body: 'First words.',
			baseRevision: 0
		});
		if (first.kind !== 'saved') throw new Error('The first save did not store.');

		// Rachel's page opens the draft, seeded from its text, and she adds a paragraph.
		const rachel = openPaperDocument(seedPaperDocument('First words.'));
		writeMarkdownIntoPaperDocument(rachel, 'First words.\n\nRachel adds this.');
		// Meanwhile Tom saves from a page without JavaScript.
		await savePaperDraft(writer.supabase, {
			seatId,
			body: 'First words, by Tom.',
			baseRevision: first.revision
		});
		await save(member, seatId, rachel, first.revision);

		const stored = await readPaperDraft(writer.supabase, seatId);

		expect(stored?.body).toBe('First words, by Tom.\n\nRachel adds this.');
	});

	it('lets nobody outside the delegation save', async () => {
		const { seatId } = await createDraftFixture();
		const stranger = await createSignedInClient('Aisha Bello');

		const saving = saveLive(stranger, seatId, typedDocument('Not mine.'), 0);

		await expect(saving).rejects.toThrow();
	});
});

describe('savePaperDraft on a draft written live', () => {
	it('writes the Markdown into the stored document too, so the two agree', async () => {
		const { writer, member, seatId } = await createDraftFixture();
		const saved = await save(writer, seatId, typedDocument('Written live.'));

		// A member without JavaScript saves plain Markdown over it.
		const result = await savePaperDraft(member.supabase, {
			seatId,
			body: 'Written live, then saved without JavaScript.',
			baseRevision: saved.revision
		});
		const storedState = await readLiveDocumentState(member.supabase, seatId);

		expect(result.kind).toBe('saved');
		expect(storedState && paperDocumentMarkdown(openPaperDocument(storedState))).toBe(
			'Written live, then saved without JavaScript.'
		);
	});
});
