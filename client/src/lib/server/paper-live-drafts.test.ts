import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Y from 'yjs';
import type { PaperSharing } from '$lib/delegation-papers';
import {
	openPaperDocument,
	paperDocumentLineage,
	paperDocumentMarkdown,
	paperDocumentState,
	seedPaperDocument,
	writeMarkdownIntoPaperDocument
} from '$lib/paper-document';
import {
	deleted,
	inserted,
	paper,
	paragraph,
	sharedDocumentHolding,
	suggestion
} from '../../../tests/paper-suggestion-fixtures';
import {
	decodeStoredDocument,
	documentWithMarkdown,
	livePaperWithMarkdown,
	positionPaperDraftStore,
	readLiveDocumentState,
	readLivePaperSetup,
	readLivePaperState,
	readLivePaperWithSuggestions,
	saveLivePaper,
	seededDocumentColumn,
	storedSuggestionCount,
	type LivePaperStore,
	type StoredLivePaper
} from './paper-live-drafts';

// These tests are about the decisions this module makes: when a save inserts,
// merges, goes round again or is told the paper was replaced. Who may reach a
// paper at all is Row Level Security's decision, tested with a real database
// in `tests/db/paper-live-drafts.test.ts` and `tests/db/committee-paper-writing.test.ts`.

const SEAT_ID = 'seat-1';

/** The draft row as the stand-in database holds it. */
type StoredRow = { body_markdown: string; revision: number; document_state: string | null };

/** Bytes as PostgREST sends a `bytea` column. */
function asBytea(bytes: Uint8Array): string {
	return `\\x${Buffer.from(bytes).toString('hex')}`;
}

/** A `bytea` column's text as a document. */
function openBytea(text: string): Y.Doc {
	return openPaperDocument(new Uint8Array(Buffer.from(text.slice(2), 'hex')));
}

/**
 * A stand-in Supabase client for `position_paper_drafts` holding one row, or
 * none. An update only changes the row while its revision is the one named,
 * as the real update does. `beforeUpdate` runs once, just before the first
 * update, to play another member's save landing in between.
 */
function createStandIn(start: StoredRow | null, beforeUpdate?: (row: StoredRow) => void) {
	const state = { row: start, updates: 0, inserts: 0 };
	let hasRunBeforeUpdate = false;

	function from() {
		let inserted: Partial<StoredRow> | null = null;
		let updated: Partial<StoredRow> | null = null;
		let revisionAsked: number | null = null;

		function answer() {
			if (inserted) {
				state.inserts += 1;
				if (state.row) return { data: null, error: { code: '23505', message: 'exists' } };

				state.row = { body_markdown: '', revision: 1, document_state: null, ...inserted };
				return { data: { revision: 1 }, error: null };
			}

			if (updated) {
				state.updates += 1;
				if (state.row && !hasRunBeforeUpdate && beforeUpdate) beforeUpdate(state.row);
				hasRunBeforeUpdate = true;
				if (!state.row || state.row.revision !== revisionAsked) return { data: [], error: null };

				state.row = { ...state.row, ...updated, revision: state.row.revision + 1 };
				return { data: [{ revision: state.row.revision }], error: null };
			}

			return { data: state.row ? { ...state.row } : null, error: null };
		}

		// Every step hands the builder back, which is what lets the module chain them.
		const builder = {
			select: () => builder,
			insert: (row: Partial<StoredRow>) => {
				inserted = row;
				return builder;
			},
			update: (row: Partial<StoredRow>) => {
				updated = row;
				return builder;
			},
			eq: (column: string, value: unknown) => {
				if (column === 'revision') revisionAsked = value as number;
				return builder;
			},
			single: () => builder,
			maybeSingle: () => builder,
			overrideTypes: () => Promise.resolve(answer())
		};

		return builder;
	}

	return { supabase: { from } as unknown as SupabaseClient, state };
}

/** A page's document: the stored one, or a seed of `markdown`, with `typed` added at the end. */
function pageDocument(start: Uint8Array, typed: string): Uint8Array {
	const document = openPaperDocument(start);
	writeMarkdownIntoPaperDocument(document, `${paperDocumentMarkdown(document)}${typed}`);

	return paperDocumentState(document);
}

describe('seededDocumentColumn', () => {
	it('stores the same document every browser seeds from the text', () => {
		const column = seededDocumentColumn('France supports the treaty.');

		expect(column).toMatch(/^\\x[0-9a-f]+$/);
		expect(column).toBe(asBytea(seedPaperDocument('France supports the treaty.')));
	});
});

describe('readLiveDocumentState', () => {
	it('is null without a draft, and for a draft that was only ever Markdown', async () => {
		const empty = createStandIn(null);
		const markdownOnly = createStandIn({ body_markdown: 'Hi', revision: 1, document_state: null });

		expect(await readLiveDocumentState(empty.supabase, SEAT_ID)).toBeNull();
		expect(await readLiveDocumentState(markdownOnly.supabase, SEAT_ID)).toBeNull();
	});

	it('reads the stored document back as bytes', async () => {
		const seed = seedPaperDocument('Stored words.');
		const stored = createStandIn({
			body_markdown: 'Stored words.',
			revision: 3,
			document_state: asBytea(seed)
		});

		expect(await readLiveDocumentState(stored.supabase, SEAT_ID)).toEqual(seed);
	});

	it('treats a stored value that is not a paper as no document, so the page seeds from the text', async () => {
		// Anybody in the delegation may write the column, so it may hold anything
		// (security review, L52): bytes that are not a Yjs update, a Yjs
		// document that never held a paper, or text that is not a bytea at all.
		const notAnUpdate = createStandIn({
			body_markdown: 'Words.',
			revision: 2,
			document_state: '\\xdeadbeef'
		});
		const emptyDocument = createStandIn({
			body_markdown: 'Words.',
			revision: 2,
			document_state: asBytea(Y.encodeStateAsUpdate(new Y.Doc()))
		});
		const notBytea = createStandIn({
			body_markdown: 'Words.',
			revision: 2,
			document_state: 'hello'
		});

		expect(await readLiveDocumentState(notAnUpdate.supabase, SEAT_ID)).toBeNull();
		expect(await readLiveDocumentState(emptyDocument.supabase, SEAT_ID)).toBeNull();
		expect(await readLiveDocumentState(notBytea.supabase, SEAT_ID)).toBeNull();
	});
});

describe('decodeStoredDocument', () => {
	it('reads a stored paper back as its bytes', () => {
		const seed = seedPaperDocument('Stored words.');

		expect(decodeStoredDocument(asBytea(seed))).toEqual(seed);
	});

	it('is null for text that is not a bytea, bytes that are not a Yjs update, and a document with no paper', () => {
		expect(decodeStoredDocument('hello')).toBeNull();
		expect(decodeStoredDocument('\\xdeadbeef')).toBeNull();
		expect(decodeStoredDocument(asBytea(Y.encodeStateAsUpdate(new Y.Doc())))).toBeNull();
	});
});

describe('saveLivePaper, on a position paper draft', () => {
	it('starts the draft with the document and its Markdown when there is none', async () => {
		const { supabase, state } = createStandIn(null);
		const document = pageDocument(seedPaperDocument(''), 'First words.');

		const result = await saveLivePaper(positionPaperDraftStore(supabase, SEAT_ID), {
			document,
			lastRevision: 0
		});

		expect(result).toEqual({ kind: 'saved', revision: 1, missing: new Uint8Array() });
		expect(state.row?.body_markdown).toBe('First words.');
		expect(paperDocumentMarkdown(openBytea(state.row?.document_state ?? ''))).toBe('First words.');
	});

	it('merges with the stored document, keeping both writers, and hands back what the page lacks', async () => {
		const seed = seedPaperDocument('France supports the treaty.');
		const stored = pageDocument(seed, ' Rachel agrees.');
		const { supabase, state } = createStandIn({
			body_markdown: 'France supports the treaty. Rachel agrees.',
			revision: 4,
			document_state: asBytea(stored)
		});
		const tomsPage = openPaperDocument(seed);
		writeMarkdownIntoPaperDocument(tomsPage, 'Tom says: France supports the treaty.');

		const result = await saveLivePaper(positionPaperDraftStore(supabase, SEAT_ID), {
			document: paperDocumentState(tomsPage),
			lastRevision: 4
		});

		expect(state.row?.body_markdown).toBe('Tom says: France supports the treaty. Rachel agrees.');
		expect(state.row?.revision).toBe(5);
		if (result.kind !== 'saved') throw new Error(`Expected a save, got ${result.kind}`);
		Y.applyUpdate(tomsPage, result.missing);
		expect(paperDocumentMarkdown(tomsPage)).toBe(state.row?.body_markdown);
	});

	it('goes round again when another save lands between its read and its write', async () => {
		const seed = seedPaperDocument('One.');
		const { supabase, state } = createStandIn(
			{ body_markdown: 'One.', revision: 1, document_state: asBytea(seed) },
			(row) => {
				// Rachel's save lands first, with words of her own.
				const rachels = asBytea(pageDocument(seed, ' Two.'));
				Object.assign(row, { body_markdown: 'One. Two.', revision: 2, document_state: rachels });
			}
		);

		const result = await saveLivePaper(positionPaperDraftStore(supabase, SEAT_ID), {
			document: pageDocument(seed, ' Three.'),
			lastRevision: 1
		});

		expect(result.kind).toBe('saved');
		expect(state.updates).toBe(2);
		expect(state.row?.revision).toBe(3);
		expect(state.row?.body_markdown).toContain('Two.');
		expect(state.row?.body_markdown).toContain('Three.');
	});

	it('writes nothing when the save brings nothing new, as a paused page asking for news', async () => {
		const seed = seedPaperDocument('Nothing new.');
		const { supabase, state } = createStandIn({
			body_markdown: 'Nothing new.',
			revision: 7,
			document_state: asBytea(seed)
		});

		const result = await saveLivePaper(positionPaperDraftStore(supabase, SEAT_ID), {
			document: seed,
			lastRevision: 7
		});

		expect(result).toEqual({ kind: 'saved', revision: 7, missing: expect.any(Uint8Array) });
		expect(state.updates).toBe(0);
	});

	it('says the draft was replaced when it has gone, or is a new draft since', async () => {
		const gone = createStandIn(null);
		const startedAgain = createStandIn({
			body_markdown: 'A new draft.',
			revision: 1,
			document_state: seededDocumentColumn('A new draft.')
		});
		const oldPage = seedPaperDocument('The paper as it was submitted.');

		const fromGone = await saveLivePaper(positionPaperDraftStore(gone.supabase, SEAT_ID), {
			document: oldPage,
			lastRevision: 3
		});
		const fromNew = await saveLivePaper(positionPaperDraftStore(startedAgain.supabase, SEAT_ID), {
			document: oldPage,
			lastRevision: 3
		});

		expect(fromGone).toEqual({ kind: 'replaced' });
		expect(fromNew).toEqual({ kind: 'replaced' });
		expect(startedAgain.state.row?.body_markdown).toBe('A new draft.');
	});

	it('saves a sound document over a stored value that is not a paper', async () => {
		const { supabase, state } = createStandIn({
			body_markdown: 'Words.',
			revision: 2,
			document_state: '\\xdeadbeef'
		});
		// The page seeded its document from the text, as it does for a paper only ever saved as Markdown.
		const document = pageDocument(seedPaperDocument('Words.'), ' More words.');

		const result = await saveLivePaper(positionPaperDraftStore(supabase, SEAT_ID), {
			document,
			lastRevision: 2
		});

		expect(result).toMatchObject({ kind: 'saved', revision: 3 });
		expect(state.row?.body_markdown).toBe('Words. More words.');
		expect(paperDocumentMarkdown(openBytea(state.row?.document_state ?? ''))).toBe(
			'Words. More words.'
		);
	});

	it('stores nothing when the merged paper is over the length limit', async () => {
		const { supabase, state } = createStandIn(null);
		const document = pageDocument(seedPaperDocument(''), 'x'.repeat(100_001));

		const result = await saveLivePaper(positionPaperDraftStore(supabase, SEAT_ID), {
			document,
			lastRevision: 0
		});

		expect(result).toEqual({ kind: 'tooLong' });
		expect(state.row).toBeNull();
	});
});

describe('documentWithMarkdown', () => {
	it('writes a Markdown save into the stored document of that revision', async () => {
		const { supabase } = createStandIn({
			body_markdown: 'Before.',
			revision: 2,
			document_state: seededDocumentColumn('Before.')
		});

		const column = await documentWithMarkdown(supabase, SEAT_ID, 2, 'After.');

		expect(paperDocumentMarkdown(openBytea(column ?? ''))).toBe('After.');
	});

	it('is null for another revision, or when there is no draft', async () => {
		const newer = createStandIn({
			body_markdown: 'Before.',
			revision: 3,
			document_state: seededDocumentColumn('Before.')
		});
		const none = createStandIn(null);

		expect(await documentWithMarkdown(newer.supabase, SEAT_ID, 2, 'After.')).toBeNull();
		expect(await documentWithMarkdown(none.supabase, SEAT_ID, 0, 'After.')).toBeNull();
	});
});

describe('livePaperWithMarkdown', () => {
	it('writes into the seed of a paper that was only ever Markdown, which open pages share', async () => {
		const store = createMemoryStore({ markdown: 'Old.', revision: 2, documentState: null });

		const column = await livePaperWithMarkdown(store.store, 2, 'Old. New.');
		const written = openBytea(column ?? '');

		expect(paperDocumentMarkdown(written)).toBe('Old. New.');
		// A page that opened the paper seeded it from "Old." and must still be able to save.
		const openPage = openPaperDocument(seedPaperDocument('Old.'));
		expect(paperDocumentLineage(written)).toBe(paperDocumentLineage(openPage));
	});
});

describe('positionPaperDraftStore', () => {
	it("reads, starts and updates the seat's draft row", async () => {
		const { supabase, state } = createStandIn(null);
		const store = positionPaperDraftStore(supabase, SEAT_ID);

		expect(await store.read()).toBeNull();
		expect(await store.insert?.({ markdown: 'First.', documentState: '\\x00' })).toBe(1);
		expect(await store.read()).toEqual({ markdown: 'First.', revision: 1, documentState: '\\x00' });
		expect(await store.update(3, { markdown: 'Stale.', documentState: '\\x01' })).toBeNull();
		expect(await store.update(1, { markdown: 'Second.', documentState: '\\x01' })).toBe(2);
		expect(state.row?.body_markdown).toBe('Second.');
	});

	it('answers null when another save started the draft first', async () => {
		const { supabase } = createStandIn({
			body_markdown: 'Theirs.',
			revision: 1,
			document_state: null
		});

		const store = positionPaperDraftStore(supabase, SEAT_ID);

		expect(await store.insert?.({ markdown: 'Mine.', documentState: '\\x00' })).toBeNull();
	});
});

/**
 * A store kept in memory, the way a committee paper's is shaped: its row
 * exists from the start, so there is no insert, and `read` answers `null`
 * once the writer may no longer save into it.
 */
function createMemoryStore(start: StoredLivePaper | null) {
	const state = { paper: start, updates: 0 };

	const store: LivePaperStore = {
		read: () => Promise.resolve(state.paper ? { ...state.paper } : null),
		insert: null,
		update: (revision, columns) => {
			state.updates += 1;
			if (!state.paper || state.paper.revision !== revision) return Promise.resolve(null);

			state.paper = { ...columns, revision: revision + 1 };
			return Promise.resolve(state.paper.revision);
		}
	};

	return { store, state };
}

describe('readLivePaperState', () => {
	it('is the stored document, or null when the paper has only been Markdown', async () => {
		const seed = seedPaperDocument('Words.');
		const stored = createMemoryStore({
			markdown: 'Words.',
			revision: 1,
			documentState: asBytea(seed)
		});
		const markdownOnly = createMemoryStore({
			markdown: 'Words.',
			revision: 1,
			documentState: null
		});

		expect(await readLivePaperState(stored.store)).toEqual(seed);
		expect(await readLivePaperState(markdownOnly.store)).toBeNull();
	});
});

describe('readLivePaperWithSuggestions', () => {
	it('reads the paper and the suggestions still open in that same revision', async () => {
		const ben = suggestion('b1', 'ben');
		const suggested = sharedDocumentHolding(
			paper(paragraph('Ban ', inserted('all ', ben), 'mines.'))
		);
		const stored = createMemoryStore({
			markdown: 'Ban mines.',
			revision: 3,
			documentState: asBytea(paperDocumentState(suggested))
		});
		const markdownOnly = createMemoryStore({
			markdown: 'Ban mines.',
			revision: 1,
			documentState: null
		});

		expect(await readLivePaperWithSuggestions(stored.store)).toMatchObject({
			paper: { markdown: 'Ban mines.', revision: 3 },
			openSuggestions: 1
		});
		expect(await readLivePaperWithSuggestions(markdownOnly.store)).toMatchObject({
			openSuggestions: 0
		});
		expect(await readLivePaperWithSuggestions(createMemoryStore(null).store)).toBeNull();
	});
});

describe('saveLivePaper', () => {
	it("stores a committee paper's first save over the row it was started with", async () => {
		const { store, state } = createMemoryStore({ markdown: '', revision: 1, documentState: null });
		const document = pageDocument(seedPaperDocument(''), 'We propose a treaty.');

		const result = await saveLivePaper(store, { document, lastRevision: 1 });

		expect(result).toMatchObject({ kind: 'saved', revision: 2 });
		expect(state.paper?.markdown).toBe('We propose a treaty.');
	});

	it('says the paper was replaced when the writer may no longer save it, even from revision 0', async () => {
		const { store, state } = createMemoryStore(null);
		const document = pageDocument(seedPaperDocument(''), 'Late words.');

		expect(await saveLivePaper(store, { document, lastRevision: 0 })).toEqual({ kind: 'replaced' });
		expect(state.updates).toBe(0);
	});
});

describe('readLivePaperSetup', () => {
	const SHARING: PaperSharing = {
		delegationName: 'Delft Diplomats',
		members: [
			{ id: 'tom', name: 'Tom Price' },
			{ id: 'rachel', name: 'Rachel Morgan' }
		]
	};

	it('is null for a delegate writing alone', async () => {
		const { supabase } = createStandIn(null);
		const alone: PaperSharing = { ...SHARING, members: [{ id: 'tom', name: 'Tom Price' }] };

		expect(await readLivePaperSetup(supabase, SEAT_ID, null, 'tom')).toBeNull();
		expect(await readLivePaperSetup(supabase, SEAT_ID, alone, 'tom')).toBeNull();
	});

	it('names the reader and carries the stored document as base64', async () => {
		const seed = seedPaperDocument('Shared words.');
		const { supabase } = createStandIn({
			body_markdown: 'Shared words.',
			revision: 1,
			document_state: asBytea(seed)
		});

		const setup = await readLivePaperSetup(supabase, SEAT_ID, SHARING, 'rachel');

		expect(setup).toEqual({
			topic: `paper:${SEAT_ID}`,
			documentState: Buffer.from(seed).toString('base64'),
			openSuggestions: 0,
			writer: { id: 'rachel', name: 'Rachel Morgan' },
			// The delegation, the only writers the page may name beside a cursor.
			writers: SHARING.members
		});
	});

	it('counts the suggestions the delegation has still to decide', async () => {
		const tom = suggestion('t1', 'tom');
		const suggested = sharedDocumentHolding(
			paper(paragraph('France ', inserted('firmly ', tom), 'supports a treaty.'))
		);
		const { supabase } = createStandIn({
			body_markdown: 'France supports a treaty.',
			revision: 2,
			document_state: asBytea(paperDocumentState(suggested))
		});

		const setup = await readLivePaperSetup(supabase, SEAT_ID, SHARING, 'rachel');

		expect(setup?.openSuggestions).toBe(1);
	});
});

describe('storedSuggestionCount', () => {
	it('counts the suggestions in a stored document, and none in a paper never written live', () => {
		const ben = suggestion('b1', 'ben');
		const suggested = sharedDocumentHolding(
			paper(
				paragraph('Ban ', deleted('all', ben), inserted('most', ben), ' mines', inserted('.', ben))
			)
		);

		// Ben's one suggestion, though it is in three pieces.
		expect(storedSuggestionCount(paperDocumentState(suggested))).toBe(1);
		expect(storedSuggestionCount(seedPaperDocument('Ban all mines.'))).toBe(0);
		expect(storedSuggestionCount(null)).toBe(0);
	});
});
