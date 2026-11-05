import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
	base64ToBytes,
	openPaperDocument,
	paperDocumentMarkdown,
	paperDocumentState,
	seedPaperDocument,
	writeMarkdownIntoPaperDocument
} from '$lib/paper-document';
import {
	committeePaperStore,
	readCommitteePaperForm,
	readCommitteePaperSetup,
	saveCommitteePaperFromForm
} from '$lib/server/committee-paper-writing';
import { readWrittenForm } from '$lib/server/paper-draft-form';
import { readLivePaperState, saveLivePaper } from '$lib/server/paper-live-drafts';
import type { SignedInClient } from './supabase-test-client';
import {
	createPaperCommittee,
	startPaper,
	storedPaper,
	type PaperCommittee
} from './committee-paper-fixtures';

/** The fixtures start working papers, which keep their text in one part. */
function workingPaper(id: string) {
	return { id, kind: 'working_paper' as const };
}

// docs/committee-papers.md, section 7: a paper's authors write it together
// live. Each browser posts its whole Yjs document, which `saveLivePaper`
// merges into the one stored on the paper's own row, and a page without
// JavaScript posts Markdown, which is written into that document. These run
// the saves the paper's page makes against the real database, as the
// delegates themselves, so Row Level Security is the one deciding who may
// save.

/** The revision a paper is started at, and so the one a page opened on it first holds. */
const STARTED_REVISION = 1;

/** A working paper France started, with Germany added as its second author. */
async function createSharedPaper(): Promise<PaperCommittee & { paperId: string }> {
	const committee = await createPaperCommittee();
	const paperId = await startPaper(committee.france, committee.committeeId, 'working_paper');
	const { error } = await committee.france.supabase.rpc('add_paper_author', {
		paper_id: paperId,
		seat_id: committee.germany.seatId
	});

	if (error) throw new Error(`Could not add the fixture author: ${error.message}`);

	return { ...committee, paperId };
}

/** A page's document for a paper started empty, holding what its author typed. */
function typedDocument(markdown: string): Y.Doc {
	const document = openPaperDocument(seedPaperDocument(''));
	writeMarkdownIntoPaperDocument(document, markdown);

	return document;
}

/** Post `document` into the paper as `author`'s page does, and answer how it went. */
function saveLive(author: SignedInClient, paperId: string, document: Y.Doc, lastRevision: number) {
	return saveLivePaper(committeePaperStore(author.supabase, workingPaper(paperId)), {
		document: paperDocumentState(document),
		lastRevision
	});
}

/** Save `document` as `author`, failing the test unless it is stored. */
async function save(
	author: SignedInClient,
	paperId: string,
	document: Y.Doc,
	lastRevision = STARTED_REVISION
) {
	const result = await saveLive(author, paperId, document, lastRevision);

	if (result.kind !== 'saved') throw new Error(`The save came back ${result.kind}.`);

	return result;
}

/** What "Save changes" posts from a page without JavaScript. */
function markdownForm(body: string, revision: number) {
	const formData = new FormData();
	formData.set('body', body);
	formData.set('revision', String(revision));

	return readWrittenForm(formData);
}

describe('saveLivePaper, into a committee paper', () => {
	it("merges two authors' documents, and the stored Markdown matches the merge", async () => {
		const { france, germany, paperId } = await createSharedPaper();
		const fromFrance = typedDocument('France wrote this.');
		const fromGermany = typedDocument('Germany wrote that.');

		await save(france, paperId, fromFrance);
		const answer = await save(germany, paperId, fromGermany);
		Y.applyUpdate(fromGermany, answer.missing);

		const stored = await storedPaper(paperId);
		const storedState = await readLivePaperState(
			committeePaperStore(germany.supabase, workingPaper(paperId))
		);

		expect(paperDocumentMarkdown(fromGermany)).toContain('France wrote this.');
		expect(paperDocumentMarkdown(fromGermany)).toContain('Germany wrote that.');
		expect(stored.body_markdown).toBe(paperDocumentMarkdown(fromGermany));
		expect(storedState && paperDocumentMarkdown(openPaperDocument(storedState))).toBe(
			stored.body_markdown
		);
		expect(stored.updated_by).toBe(germany.userId);
	});

	it('tells the page of an author who left that it can no longer save, and stores nothing', async () => {
		const { germany, paperId } = await createSharedPaper();
		const saved = await save(germany, paperId, typedDocument('Before leaving.'));
		const { error } = await germany.supabase.rpc('leave_paper', { paper_id: paperId });

		if (error) throw new Error(`Could not leave the fixture paper: ${error.message}`);

		const afterLeaving = await saveLive(
			germany,
			paperId,
			typedDocument('After leaving.'),
			saved.revision
		);

		expect(afterLeaving).toEqual({ kind: 'replaced' });
		expect((await storedPaper(paperId)).body_markdown).toBe('Before leaving.');
	});

	it('lets no delegate who does not write the paper save into it', async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId, 'working_paper');

		const fromGermany = await saveLive(
			committee.germany,
			paperId,
			typedDocument('Not mine.'),
			STARTED_REVISION
		);

		expect(fromGermany).toEqual({ kind: 'replaced' });
		expect((await storedPaper(paperId)).body_markdown).toBe('');
	});
});

describe('saveCommitteePaperFromForm, from a page without JavaScript', () => {
	it("writes the Markdown into the stored document, so a live page's edits are kept", async () => {
		const { france, germany, paperId } = await createSharedPaper();
		const fromFrance = typedDocument('First words.');
		const first = await save(france, paperId, fromFrance);

		// France carries on typing while Germany saves from a page without JavaScript.
		writeMarkdownIntoPaperDocument(fromFrance, 'First words.\n\nFrance adds this.');
		const fromGermany = await saveCommitteePaperFromForm(
			germany.supabase,
			workingPaper(paperId),
			markdownForm('First words, by Germany.', first.revision)
		);
		await save(france, paperId, fromFrance, first.revision);

		expect(fromGermany.refusal).toBeNull();
		expect((await storedPaper(paperId)).body_markdown).toBe(
			'First words, by Germany.\n\nFrance adds this.'
		);
	});

	it('hands the text back with the revision saved in between, when another save came first', async () => {
		const { france, germany, paperId } = await createSharedPaper();
		const saved = await save(france, paperId, typedDocument('France saved first.'));

		const fromGermany = await saveCommitteePaperFromForm(
			germany.supabase,
			workingPaper(paperId),
			markdownForm('Germany started from the empty paper.', STARTED_REVISION)
		);

		expect(fromGermany.refusal?.status).toBe(409);
		expect(fromGermany.refusal?.data).toMatchObject({
			draftText: 'Germany started from the empty paper.',
			draftConflict: { revision: saved.revision }
		});
		expect((await storedPaper(paperId)).body_markdown).toBe('France saved first.');
	});
	it("keeps a draft resolution's two text areas in their own parts", async () => {
		const committee = await createPaperCommittee();
		const paperId = await startPaper(committee.france, committee.committeeId);
		const formData = new FormData();
		formData.set('preamble', 'Recalling its resolution 78/241,');
		formData.set('operative', '1. Calls upon all States to act;\n2. Decides to remain seized.');
		formData.set('revision', String(STARTED_REVISION));

		const saved = await saveCommitteePaperFromForm(
			committee.france.supabase,
			{ id: paperId, kind: 'draft_resolution' },
			readCommitteePaperForm(formData)
		);
		const stored = await storedPaper(paperId);

		expect(saved.refusal).toBeNull();
		expect(stored.preamble_markdown).toBe('Recalling its resolution 78/241,');
		expect(stored.operative_markdown).toBe(
			'1. Calls upon all States to act;\n2. Decides to remain seized.'
		);
	});
});

describe('readCommitteePaperSetup', () => {
	it("starts an author's page from the document stored on the paper, on the paper's channel", async () => {
		const { france, germany, paperId } = await createSharedPaper();
		await save(france, paperId, typedDocument('France wrote this.'));

		const germanyWriting = { id: germany.userId, name: 'Germany' };
		const setup = await readCommitteePaperSetup(
			germany.supabase,
			workingPaper(paperId),
			germanyWriting,
			[germanyWriting]
		);
		const startState = setup.documentState === null ? null : base64ToBytes(setup.documentState);
		const { live_epoch: epoch } = await storedPaper(paperId);

		expect(setup.topic).toBe(`committee-paper:${paperId}:${epoch}`);
		expect(setup.epoch).toEqual({ paperId, epoch });
		expect(setup.writers).toEqual([germanyWriting]);
		expect(startState && paperDocumentMarkdown(openPaperDocument(startState))).toBe(
			'France wrote this.'
		);
	});
});
