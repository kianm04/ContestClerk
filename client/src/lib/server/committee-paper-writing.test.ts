import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Y from 'yjs';
import { COMMITTEE_PAPER_MESSAGES, type CommitteePaper } from '$lib/committee-papers';
import {
	bytesToBase64,
	openPaperDocument,
	paperDocumentLineage,
	paperDocumentMarkdown,
	paperDocumentState,
	seedPaperDocument,
	writeMarkdownIntoPaperDocument
} from '$lib/paper-document';
import { PAPER_WRITING_MESSAGES, WRITTEN_PAPER_MAX_LENGTH } from '$lib/paper-writing';
import {
	deleted,
	inserted,
	paper,
	paragraph,
	sharedDocumentHolding,
	suggestion
} from '../../../tests/paper-suggestion-fixtures';
import {
	committeePaperStore,
	readCommitteePaperDraft,
	readCommitteePaperForm,
	readCommitteePaperSetup,
	saveCommitteePaperFromForm
} from './committee-paper-writing';
import { SERVER_PROBLEM_MESSAGE, readWrittenForm } from './paper-draft-form';

// These tests are about the decisions this module makes: what a read finds,
// when a save merges, writes Markdown in or meets a clash, and what the writer
// is told. Who may write a paper at all is Row Level Security's decision,
// tested with a real database in `tests/db/committee-papers.test.ts`.

const PAPER_ID = 'paper-1';
const WORKING_PAPER = { id: PAPER_ID, kind: 'working_paper' } as const;
const DRAFT_RESOLUTION = { id: PAPER_ID, kind: 'draft_resolution' } as const;

/**
 * The paper as the stand-in database holds it: its text, in two parts for a
 * draft resolution, on `committee_papers`, and its live document, which is a
 * row of `committee_paper_documents` or none (`null`).
 */
type StoredRow = {
	body_markdown: string | null;
	preamble_markdown?: string | null;
	operative_markdown?: string | null;
	revision: number;
	live_epoch?: number;
	document_state: string | null;
};

/** What the stand-in answers with. */
type StandInOptions = {
	/** What `may_write_paper` says: false once the reader has left or the paper went to the dais. */
	mayWrite?: boolean;
	/** The name on the profile of whoever saved last, or nothing when the account is gone. */
	editorName?: string;
	/** Every query fails, as when the database is down. */
	isDown?: boolean;
	/** Runs once, just before the first update, to play another author's save landing in between. */
	beforeUpdate?: (row: StoredRow) => void;
};

/** Bytes as PostgREST sends a `bytea` column. */
function asBytea(bytes: Uint8Array): string {
	return `\\x${Buffer.from(bytes).toString('hex')}`;
}

/** A `bytea` column's text as a document. */
function openBytea(text: string): Y.Doc {
	return openPaperDocument(new Uint8Array(Buffer.from(text.slice(2), 'hex')));
}

/** What a save hands `save_committee_paper_text`. */
type SaveArguments = {
	paper_id: string;
	expected_revision: number;
	document_state: string;
	body_markdown?: string;
	preamble_markdown?: string;
	operative_markdown?: string;
};

/**
 * A stand-in Supabase client holding one paper, or none: its row of
 * `committee_papers` and its row of `committee_paper_documents`. A save goes
 * through `save_committee_paper_text`, which only changes the paper while its
 * revision is the one named, as the real function does, and moves the
 * revision on by one.
 */
function createStandIn(start: StoredRow | null, options: StandInOptions = {}) {
	const state = { row: start, updates: 0 };
	let hasRunBeforeUpdate = false;
	const failure = { data: null, error: { code: 'XX000', message: 'down' } };

	function from(table: string) {
		function answer() {
			if (options.isDown) return failure;

			if (table === 'profiles') {
				const profile = options.editorName ? { full_name: options.editorName } : null;
				return { data: profile, error: null };
			}

			if (table === 'committee_paper_documents') {
				const document = state.row?.document_state;
				return { data: document == null ? null : { document_state: document }, error: null };
			}

			if (!state.row) return { data: null, error: null };

			// The paper's own row: its text and its epoch, never its document.
			const {
				body_markdown,
				preamble_markdown = null,
				operative_markdown = null,
				revision,
				live_epoch = 1
			} = state.row;
			return {
				data: { body_markdown, preamble_markdown, operative_markdown, revision, live_epoch },
				error: null
			};
		}

		// Every step hands the builder back, which is what lets the module chain them.
		const builder = {
			select: () => builder,
			eq: () => builder,
			single: () => builder,
			maybeSingle: () => builder,
			overrideTypes: () => Promise.resolve(answer())
		};

		return builder;
	}

	function save(saved: SaveArguments) {
		state.updates += 1;
		if (state.row && !hasRunBeforeUpdate && options.beforeUpdate) {
			options.beforeUpdate(state.row);
		}
		hasRunBeforeUpdate = true;

		if (
			!state.row ||
			options.mayWrite === false ||
			state.row.revision !== saved.expected_revision
		) {
			return { data: null, error: null };
		}

		state.row = {
			...state.row,
			body_markdown: saved.body_markdown ?? null,
			preamble_markdown: saved.preamble_markdown ?? null,
			operative_markdown: saved.operative_markdown ?? null,
			document_state: saved.document_state,
			revision: state.row.revision + 1
		};

		return { data: state.row.revision, error: null };
	}

	function rpc(name: string, parameters: unknown) {
		if (options.isDown) return Promise.resolve(failure);

		if (name === 'save_committee_paper_text') {
			return Promise.resolve(save(parameters as SaveArguments));
		}

		return Promise.resolve({
			data: name === 'may_write_paper' && options.mayWrite !== false,
			error: null
		});
	}

	return { supabase: { from, rpc } as unknown as SupabaseClient, state };
}

/** A posted form with these fields. */
function formOf(fields: Record<string, string>): FormData {
	const formData = new FormData();
	for (const [name, value] of Object.entries(fields)) formData.set(name, value);

	return formData;
}

/** A page's document: the stored one, or a seed of the text, with `typed` added at the end. */
function pageDocument(start: Uint8Array, typed: string): Uint8Array {
	const document = openPaperDocument(start);
	writeMarkdownIntoPaperDocument(document, `${paperDocumentMarkdown(document)}${typed}`);

	return paperDocumentState(document);
}

/** A working paper as `start_paper` leaves it: no text yet, and no document. */
const STARTED: StoredRow = { body_markdown: '', revision: 1, document_state: null };

/** A paper saved by a live page while Ben suggests "supports" for "backs", still to decide. */
const SUGGESTED: StoredRow = {
	body_markdown: 'France backs a treaty.',
	revision: 5,
	document_state: asBytea(
		paperDocumentState(
			sharedDocumentHolding(
				paper(
					paragraph(
						'France ',
						deleted('backs', suggestion('b1', 'ben')),
						inserted('supports', suggestion('b1', 'ben')),
						' a treaty.'
					)
				)
			)
		)
	)
};

describe('committeePaperStore', () => {
	it("reads the paper's text while the reader may write it", async () => {
		const { supabase } = createStandIn({ ...STARTED, body_markdown: 'Words.', revision: 2 });

		expect(await committeePaperStore(supabase, WORKING_PAPER).read()).toEqual({
			markdown: 'Words.',
			revision: 2,
			documentState: null
		});
	});

	it('reads a paper of a kind with no text of its own as empty', async () => {
		const { supabase } = createStandIn({ ...STARTED, body_markdown: null });

		expect(await committeePaperStore(supabase, WORKING_PAPER).read()).toMatchObject({
			markdown: ''
		});
	});

	it('reads nothing once the reader may no longer write the paper, or there is none', async () => {
		const left = createStandIn(STARTED, { mayWrite: false });
		const missing = createStandIn(null);

		expect(await committeePaperStore(left.supabase, WORKING_PAPER).read()).toBeNull();
		expect(await committeePaperStore(missing.supabase, WORKING_PAPER).read()).toBeNull();
	});

	it('stores over the revision named and no other, through the database function, and never inserts', async () => {
		const { supabase, state } = createStandIn({ ...STARTED, revision: 2 });
		const store = committeePaperStore(supabase, WORKING_PAPER);

		expect(store.insert).toBeNull();
		expect(await store.update(1, { markdown: 'Stale.', documentState: '\\x00' })).toBeNull();
		expect(await store.update(2, { markdown: 'Fresh.', documentState: '\\x01' })).toBe(3);
		expect(state.row).toEqual({
			body_markdown: 'Fresh.',
			preamble_markdown: null,
			operative_markdown: null,
			revision: 3,
			document_state: '\\x01'
		});
	});

	it('reads the stored document from its own table', async () => {
		const seed = seedPaperDocument('Shared words.');
		const { supabase } = createStandIn({
			body_markdown: 'Shared words.',
			revision: 2,
			document_state: asBytea(seed)
		});

		expect(await committeePaperStore(supabase, WORKING_PAPER).read()).toEqual({
			markdown: 'Shared words.',
			revision: 2,
			documentState: asBytea(seed)
		});
	});

	it("reads and stores a draft resolution's text in its two parts", async () => {
		const { supabase, state } = createStandIn({
			body_markdown: null,
			preamble_markdown: 'Recalling its resolution 78/241,',
			operative_markdown: '1. Decides to remain seized.',
			revision: 2,
			document_state: null
		});
		const store = committeePaperStore(supabase, DRAFT_RESOLUTION);

		expect(await store.read()).toMatchObject({
			markdown: 'Recalling its resolution 78/241,\n\n1. Decides to remain seized.'
		});
		await store.update(2, {
			markdown: 'Alarmed by the speed of change,\n\n1. Urges restraint.',
			documentState: '\\x01'
		});
		expect(state.row).toMatchObject({
			body_markdown: null,
			preamble_markdown: 'Alarmed by the speed of change,',
			operative_markdown: '1. Urges restraint.'
		});
	});

	it('throws when the database fails, so a save can say so', async () => {
		const { supabase } = createStandIn(STARTED, { isDown: true });
		const store = committeePaperStore(supabase, WORKING_PAPER);

		await expect(store.read()).rejects.toThrow('Could not read the paper');
		await expect(store.update(1, { markdown: '', documentState: '\\x00' })).rejects.toThrow(
			'Could not save the paper'
		);
	});
});

describe('readCommitteePaperDraft', () => {
	const PAPER: CommitteePaper = {
		id: PAPER_ID,
		kind: 'working_paper',
		status: 'writing',
		title: 'Meaningful human control',
		topic: 'Lethal autonomous weapons systems',
		topicNumber: null,
		sequence: null,
		isOpenForSignatures: false,
		signaturesOpenedAt: null,
		submittedAt: null,
		leadSeatId: 'seat-austria',
		body: 'We propose a treaty.',
		revision: 4,
		updatedAt: '2099-03-01T09:00:00.000Z',
		updatedById: 'daniel'
	};

	it('starts the editor from the stored text, naming who saved it last', async () => {
		const { supabase } = createStandIn(null, { editorName: 'Daniel Okafor' });

		expect(await readCommitteePaperDraft(supabase, PAPER)).toEqual({
			body: 'We propose a treaty.',
			revision: 4,
			updatedAt: '2099-03-01T09:00:00.000Z',
			updatedById: 'daniel',
			updatedByName: 'Daniel Okafor'
		});
	});
});

describe('readCommitteePaperSetup', () => {
	const WRITER = { id: 'clara', name: 'Clara Whitfield', seatName: 'Austria' };
	const WRITERS = [WRITER, { id: 'daniel', name: 'Daniel Osei', seatName: 'Mexico' }];

	it("carries the paper's channel at its epoch, the stored document as base64 and the writers", async () => {
		const seed = seedPaperDocument('Shared words.');
		const { supabase } = createStandIn({
			body_markdown: 'Shared words.',
			revision: 2,
			live_epoch: 4,
			document_state: asBytea(seed)
		});

		expect(await readCommitteePaperSetup(supabase, WORKING_PAPER, WRITER, WRITERS)).toEqual({
			topic: `committee-paper:${PAPER_ID}:4`,
			epoch: { paperId: PAPER_ID, epoch: 4 },
			documentState: bytesToBase64(seed),
			openSuggestions: 0,
			writer: WRITER,
			writers: WRITERS
		});
	});

	it('has no document for a paper only ever saved as Markdown, which the page seeds itself', async () => {
		const { supabase } = createStandIn(STARTED);

		const setup = await readCommitteePaperSetup(supabase, WORKING_PAPER, WRITER, WRITERS);

		expect(setup.documentState).toBeNull();
		expect(setup.openSuggestions).toBe(0);
	});

	it('counts the suggestions still to decide, for the page without JavaScript', async () => {
		const { supabase } = createStandIn(SUGGESTED);

		const setup = await readCommitteePaperSetup(supabase, WORKING_PAPER, WRITER, WRITERS);

		expect(setup.openSuggestions).toBe(1);
	});
});

describe('saveCommitteePaperFromForm, from the live editor', () => {
	it("merges the page's document into the paper and hands back what the page lacks", async () => {
		const { supabase, state } = createStandIn(STARTED);
		const document = pageDocument(seedPaperDocument(''), 'We propose a treaty.');
		const form = readWrittenForm(formOf({ revision: '1', document: bytesToBase64(document) }));

		const result = await saveCommitteePaperFromForm(supabase, WORKING_PAPER, form);

		expect(result).toMatchObject({ refusal: null, revision: 2 });
		// Only a stored save carries what the page lacks, so a refusal fails here.
		expect('missing' in result && typeof result.missing).toBe('string');
		expect(state.row?.body_markdown).toBe('We propose a treaty.');
	});

	it("tells an author who may no longer write the paper in the paper's own words", async () => {
		const { supabase } = createStandIn(STARTED, { mayWrite: false });
		const document = pageDocument(seedPaperDocument(''), 'Late words.');
		const form = readWrittenForm(formOf({ revision: '1', document: bytesToBase64(document) }));

		const result = await saveCommitteePaperFromForm(supabase, WORKING_PAPER, form);

		expect(result.refusal).toMatchObject({
			status: 409,
			data: { isDraftReplaced: true, flash: { message: COMMITTEE_PAPER_MESSAGES.replaced } }
		});
	});
});

describe('saveCommitteePaperFromForm, without JavaScript', () => {
	const SEED = seedPaperDocument('Old words.');
	const STORED: StoredRow = {
		body_markdown: 'Old words.',
		revision: 3,
		document_state: asBytea(SEED)
	};

	it('writes the text into the stored document as one more edit, so live pages carry on', async () => {
		const { supabase, state } = createStandIn(STORED);
		const form = readWrittenForm(formOf({ body: 'New words.', revision: '3' }));

		const result = await saveCommitteePaperFromForm(supabase, WORKING_PAPER, form);

		expect(result).toEqual({ refusal: null, revision: 4, missing: null });
		expect(state.row?.body_markdown).toBe('New words.');

		const stored = openBytea(state.row?.document_state ?? '');
		expect(paperDocumentMarkdown(stored)).toBe('New words.');
		expect(paperDocumentLineage(stored)).toBe(paperDocumentLineage(openPaperDocument(SEED)));
	});

	it('saves nothing over suggestions still to decide, and says how many', async () => {
		const { supabase, state } = createStandIn(SUGGESTED);
		const form = readWrittenForm(formOf({ body: 'France backs a treaty now.', revision: '5' }));

		const result = await saveCommitteePaperFromForm(supabase, WORKING_PAPER, form);

		expect(result.refusal).toMatchObject({
			status: 409,
			data: {
				draftText: 'France backs a treaty now.',
				flash: { message: expect.stringMatching(/^1 suggestion is still to be decided/) }
			}
		});
		expect(state.updates).toBe(0);
	});

	it('hands the text back with the newer revision when another author saved first', async () => {
		const { supabase, state } = createStandIn({ ...STORED, revision: 4 });
		const form = readWrittenForm(formOf({ body: 'New words.', revision: '3' }));

		const result = await saveCommitteePaperFromForm(supabase, WORKING_PAPER, form);

		expect(result.refusal).toMatchObject({
			status: 409,
			data: {
				draftText: 'New words.',
				draftConflict: { revision: 4, theirs: null },
				flash: { message: COMMITTEE_PAPER_MESSAGES.conflict }
			}
		});
		expect(state.updates).toBe(0);
	});

	it('meets the same clash when another save lands between its read and its write', async () => {
		const { supabase } = createStandIn(STORED, {
			beforeUpdate: (row) => (row.revision = 4)
		});
		const form = readWrittenForm(formOf({ body: 'New words.', revision: '3' }));

		const result = await saveCommitteePaperFromForm(supabase, WORKING_PAPER, form);

		expect(result.refusal).toMatchObject({
			status: 409,
			data: { draftConflict: { revision: 4 } }
		});
	});

	it('tells an author who may no longer write the paper, saving nothing', async () => {
		const { supabase, state } = createStandIn(STORED, { mayWrite: false });
		const form = readWrittenForm(formOf({ body: 'New words.', revision: '3' }));

		const result = await saveCommitteePaperFromForm(supabase, WORKING_PAPER, form);

		expect(result.refusal).toMatchObject({
			status: 409,
			data: { draftConflict: null, flash: { message: COMMITTEE_PAPER_MESSAGES.replaced } }
		});
		expect(state.updates).toBe(0);
	});

	it('refuses a text that is too long, or a form with no revision, saving nothing', async () => {
		const { supabase, state } = createStandIn(STORED);
		const tooLong = readWrittenForm(
			formOf({ body: 'a'.repeat(WRITTEN_PAPER_MAX_LENGTH + 1), revision: '3' })
		);
		const noRevision = readWrittenForm(formOf({ body: 'New words.', revision: 'none' }));

		expect(
			(await saveCommitteePaperFromForm(supabase, WORKING_PAPER, tooLong)).refusal
		).toMatchObject({
			status: 400,
			data: { flash: { message: COMMITTEE_PAPER_MESSAGES.tooLong } }
		});
		expect(
			(await saveCommitteePaperFromForm(supabase, WORKING_PAPER, noRevision)).refusal
		).toMatchObject({ status: 400, data: { flash: { message: PAPER_WRITING_MESSAGES.revision } } });
		expect(state.updates).toBe(0);
	});

	it('answers a database failure with a 500 that keeps the text', async () => {
		const { supabase } = createStandIn(STORED, { isDown: true });
		const form = readWrittenForm(formOf({ body: 'New words.', revision: '3' }));

		const result = await saveCommitteePaperFromForm(supabase, WORKING_PAPER, form);

		expect(result.refusal).toMatchObject({
			status: 500,
			data: { draftText: 'New words.', flash: { message: SERVER_PROBLEM_MESSAGE } }
		});
	});
});

describe('readCommitteePaperForm', () => {
	it("joins a draft resolution's two plain boxes into the editor's one text", () => {
		const form = readCommitteePaperForm(
			formOf({
				preamble: 'Recalling its resolution 78/241,\r\n',
				operative: '1. Decides to remain seized.',
				revision: '3'
			})
		);

		expect(form).toMatchObject({
			body: 'Recalling its resolution 78/241,\n\n1. Decides to remain seized.',
			baseRevision: 3,
			document: null
		});
	});

	it('reads any other paper as its one box', () => {
		expect(readCommitteePaperForm(formOf({ body: 'Our ideas', revision: '3' })).body).toBe(
			'Our ideas'
		);
	});
});
