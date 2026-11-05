/**
 * Saving a paper that several people write together live: a position paper
 * draft its delegation shares (T148), or a paper written in committee.
 *
 * The browsers send each other their changes over Realtime
 * (`$lib/paper-live-channel.ts`), and each one also posts its whole Yjs
 * document here a moment after its writer stops typing. The document stored
 * beside the paper's text (`document_state`) is merged with the one posted,
 * never replaced by it, so a save cannot take away what somebody else wrote,
 * even a save from a writer who was offline for an hour. The Markdown the rest
 * of MUNMeet reads is then written out from the merged document.
 *
 * Where a paper is kept is not this file's concern: each kind hands over a
 * `LivePaperStore` that reads and writes its own row. A position paper's is
 * `positionPaperDraftStore` below; a committee paper's is in
 * `$lib/server/committee-paper-writing.ts`.
 *
 * Files under `$lib/server` only ever run on the server. Row Level Security
 * decides who may read and save a paper, as for T147's saves.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Y from 'yjs';
import { sharedWithText, type PaperSharing } from '$lib/delegation-papers';
import type { LiveWriter } from '$lib/live-writers';
import { LIVE_DOCUMENT_FIELD } from '$lib/markdown-editor-live';
import {
	bytesToBase64,
	openPaperDocument,
	paperDocumentLineage,
	paperDocumentMarkdown,
	paperDocumentState,
	paperDocumentSuggestionCount,
	seedPaperDocument,
	writeMarkdownIntoPaperDocument
} from '$lib/paper-document';
import { paperChannelTopic } from '$lib/paper-live-channel';
import type { LivePaperSetup } from '$lib/paper-live.svelte';
import { WRITTEN_PAPER_MAX_LENGTH } from '$lib/paper-writing';
import { UNKNOWN_MEMBER_NAME } from '$lib/server/delegations';

/** The code Postgres answers with when a row with that key already exists. */
const UNIQUE_VIOLATION_CODE = '23505';

/** The largest stored document, the same limit as the columns' checks in the migrations. */
export const LIVE_DOCUMENT_MAX_BYTES = 1_000_000;

/**
 * How many times a save reads, merges and writes before it gives up. Another
 * writer's save landing between the read and the write sends it round again.
 */
const SAVE_ATTEMPTS = 5;

/** A paper's text as a live save reads it. */
export type StoredLivePaper = {
	markdown: string;
	revision: number;
	/** Postgres `bytea`, which PostgREST sends as text: `\x` and two hex digits a byte. */
	documentState: string | null;
};

/** What a save stores: the Markdown the rest of MUNMeet reads, and the document as `bytea` text. */
export type LivePaperColumns = { markdown: string; documentState: string };

/** Where one paper is kept, read and written for the saves below. */
export type LivePaperStore = {
	/** The paper as stored now, or `null` when there is none the reader may save into. */
	read: () => Promise<StoredLivePaper | null>;
	/**
	 * Store a paper's first text, answering its revision, or `null` when
	 * another save stored one first. A committee paper's row exists from the
	 * moment it is started, so its store has no `insert`, and a paper it
	 * cannot read is one the writer may no longer save into.
	 */
	insert: ((columns: LivePaperColumns) => Promise<number | null>) | null;
	/** Store over `revision` only, answering the new one, or `null` when another save landed first. */
	update: (revision: number, columns: LivePaperColumns) => Promise<number | null>;
};

/** Bytes as PostgREST reads and writes a `bytea` column. */
function toBytea(bytes: Uint8Array): string {
	return `\\x${Buffer.from(bytes).toString('hex')}`;
}

/** The shape of a `bytea` column's text: `\\x` and two hex digits a byte. */
const BYTEA_TEXT = /^\\x(?:[0-9a-f]{2})*$/i;

/** A `bytea` column's text back as bytes. */
function fromBytea(text: string): Uint8Array {
	return new Uint8Array(Buffer.from(text.slice(2), 'hex'));
}

/**
 * The stored bytes, or `null` when they are not a paper's document: not the
 * text of a `bytea`, not a Yjs update, or a document with no text in the
 * editor's part of it. Every document the editor stores holds its text there,
 * and that text reads as Markdown; anything else was written round the editor.
 * The dais's review page reads a submitted paper's document through this too
 * (`./chair-resolutions.ts`), so broken bytes cannot stop it opening either.
 */
export function decodeStoredDocument(text: string): Uint8Array | null {
	if (!BYTEA_TEXT.test(text)) return null;

	try {
		const bytes = fromBytea(text);
		const document = openPaperDocument(bytes);

		if (document.getXmlFragment(LIVE_DOCUMENT_FIELD).length === 0) return null;

		paperDocumentMarkdown(document);

		return bytes;
	} catch {
		return null;
	}
}

/**
 * The stored document as one Yjs update, or `null` when there is no paper. A
 * paper saved only as Markdown, before T148 or from a page without
 * JavaScript, is seeded from its text, the same way every browser seeds it.
 *
 * A stored value that does not open as a paper is treated as no document at
 * all, rather than failing every page open on the paper: the page seeds its
 * document from the Markdown, as it does for a paper only ever saved as
 * Markdown, and the next save stores a sound document over the broken one.
 */
async function readStoredDocument(
	store: LivePaperStore
): Promise<{ paper: StoredLivePaper; state: Uint8Array } | null> {
	const paper = await store.read();

	if (paper === null) return null;

	const stored = paper.documentState === null ? null : decodeStoredDocument(paper.documentState);

	if (stored === null) {
		return { paper: { ...paper, documentState: null }, state: seedPaperDocument(paper.markdown) };
	}

	return { paper, state: stored };
}

/**
 * The `document_state` a paper first saved as Markdown starts with: its text
 * seeded the way every browser seeds it. With the document stored from the
 * start, a later Markdown save is written into it (`livePaperWithMarkdown`)
 * instead of leaving pages that opened the old text unable to save.
 */
export function seededDocumentColumn(markdown: string): string {
	return toBytea(seedPaperDocument(markdown));
}

/**
 * The document a page starts from, as one Yjs update, or `null` when there
 * is no paper yet or it has only ever been Markdown. The page then seeds it
 * from the paper's text itself.
 */
export async function readLivePaperState(store: LivePaperStore): Promise<Uint8Array | null> {
	const stored = await readStoredDocument(store);

	if (stored === null || stored.paper.documentState === null) return null;

	return stored.state;
}

/**
 * How many suggestions in a stored document are still to be decided
 * (`docs/committee-papers.md`, section 7), from `readLivePaperState`. A paper
 * that has only ever been Markdown has none: suggestions are made only in the
 * live editor, and only its document holds them.
 */
export function storedSuggestionCount(state: Uint8Array | null): number {
	return state === null ? 0 : paperDocumentSuggestionCount(openPaperDocument(state));
}

/**
 * The stored paper and how many of its suggestions are still to be decided,
 * from one read, so the count is of the very revision it comes with. Sending
 * a paper to the dais submits that revision, and only while the count is 0
 * (`$lib/server/committee-paper-submitting.ts`). `null` once the reader may
 * no longer write the paper.
 */
export async function readLivePaperWithSuggestions(
	store: LivePaperStore
): Promise<{ paper: StoredLivePaper; openSuggestions: number } | null> {
	const stored = await readStoredDocument(store);

	if (stored === null) return null;

	return { paper: stored.paper, openSuggestions: storedSuggestionCount(stored.state) };
}

/** One live save: the writer's whole document, and the last revision their page heard of. */
export type LivePaperSave = {
	document: Uint8Array;
	/** 0 when the page has never seen a stored paper. */
	lastRevision: number;
};

/**
 * What a live save came to:
 * - `saved`, with the new revision and the changes the writer's page is
 *   missing, which it applies so that others' saved work reaches it even
 *   while Realtime is down;
 * - `replaced`, when the document the page holds can no longer be saved: a
 *   position paper submitted and started again, or a committee paper the
 *   writer left or that is no longer being written;
 * - `tooLong`, when the merged paper is over the limit and nothing was stored.
 */
export type LivePaperSaveResult =
	| { kind: 'saved'; revision: number; missing: Uint8Array }
	| { kind: 'replaced' }
	| { kind: 'tooLong' };

/** True when the paper would be over either limit: its Markdown or its stored document. */
function isTooLong(markdown: string, state: Uint8Array): boolean {
	return markdown.length > WRITTEN_PAPER_MAX_LENGTH || state.length > LIVE_DOCUMENT_MAX_BYTES;
}

/** What the writer's page lacks: everything in `merged` its posted document did not hold. */
function missingFor(save: LivePaperSave, merged: Y.Doc): Uint8Array {
	return Y.encodeStateAsUpdate(merged, Y.encodeStateVectorFromUpdate(save.document));
}

/** True when two documents, each as one update, hold exactly the same. */
function isSameState(first: Uint8Array, second: Uint8Array): boolean {
	return Buffer.from(first).equals(Buffer.from(second));
}

/** The document's Markdown and its state, as a save stores them. */
function columnsOf(document: Y.Doc): { columns: LivePaperColumns; isTooLong: boolean } {
	const markdown = paperDocumentMarkdown(document);
	const state = paperDocumentState(document);

	return {
		columns: { markdown, documentState: toBytea(state) },
		isTooLong: isTooLong(markdown, state)
	};
}

/** The paper's first text, holding the writer's document. `null` when another save won. */
async function insertLivePaper(
	insert: NonNullable<LivePaperStore['insert']>,
	document: Y.Doc
): Promise<LivePaperSaveResult | null> {
	const { columns, isTooLong } = columnsOf(document);

	if (isTooLong) return { kind: 'tooLong' };

	const revision = await insert(columns);

	return revision === null ? null : { kind: 'saved', revision, missing: new Uint8Array() };
}

/**
 * Store the merged document over the revision read, only while nobody saved
 * in between. `null` when somebody did, so the save starts again from theirs.
 */
async function updateLivePaper(
	store: LivePaperStore,
	save: LivePaperSave,
	stored: StoredLivePaper,
	merged: Y.Doc
): Promise<LivePaperSaveResult | null> {
	const { columns, isTooLong } = columnsOf(merged);

	if (isTooLong) return { kind: 'tooLong' };

	const revision = await store.update(stored.revision, columns);

	return revision === null ? null : { kind: 'saved', revision, missing: missingFor(save, merged) };
}

/** One read, merge and write. `null` when another save landed first and it must go round again. */
async function trySaveLivePaper(
	store: LivePaperStore,
	save: LivePaperSave
): Promise<LivePaperSaveResult | null> {
	const posted = openPaperDocument(save.document);
	const stored = await readStoredDocument(store);

	if (stored === null) {
		// The page saw a paper that has gone since, or may no longer save into it.
		if (save.lastRevision > 0 || store.insert === null) return { kind: 'replaced' };

		return insertLivePaper(store.insert, posted);
	}

	const merged = openPaperDocument(stored.state);

	if (paperDocumentLineage(merged) !== paperDocumentLineage(posted)) return { kind: 'replaced' };

	const before = paperDocumentState(merged);
	Y.applyUpdate(merged, save.document);

	/*
		Nothing new came with the save, as when a page whose Realtime is down
		asks every little while what the others wrote. It is answered without
		writing, so asking costs no new revision.
	*/
	if (stored.paper.documentState !== null && isSameState(before, paperDocumentState(merged))) {
		return { kind: 'saved', revision: stored.paper.revision, missing: missingFor(save, merged) };
	}

	return updateLivePaper(store, save, stored.paper, merged);
}

/** Merge the writer's document into the stored paper and write its Markdown out. */
export async function saveLivePaper(
	store: LivePaperStore,
	save: LivePaperSave
): Promise<LivePaperSaveResult> {
	for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt += 1) {
		const result = await trySaveLivePaper(store, save);

		if (result !== null) return result;
	}

	throw new Error('Could not save the paper: it kept changing underneath the save.');
}

/**
 * The stored document once `markdown` is written into it, for a paper saved
 * as plain Markdown over `baseRevision`, from a page without JavaScript. A
 * paper with no stored document yet is written into the seed of its text,
 * the document every page open on it started from, so those pages can carry
 * on. `null` when there is no paper, or it is no longer that revision: the
 * Markdown save then meets its clash.
 */
export async function livePaperWithMarkdown(
	store: LivePaperStore,
	baseRevision: number,
	markdown: string
): Promise<string | null> {
	const stored = await readStoredDocument(store);

	if (stored === null || stored.paper.revision !== baseRevision) return null;

	const document = openPaperDocument(stored.state);
	writeMarkdownIntoPaperDocument(document, markdown);

	return toBytea(paperDocumentState(document));
}

/** The draft row of `position_paper_drafts`, as the store below reads it. */
type PositionPaperDraftRow = {
	body_markdown: string;
	revision: number;
	document_state: string | null;
};

/** Where a seat's position paper draft is kept: its row of `position_paper_drafts`. */
export function positionPaperDraftStore(supabase: SupabaseClient, seatId: string): LivePaperStore {
	async function read(): Promise<StoredLivePaper | null> {
		const { data, error } = await supabase
			.from('position_paper_drafts')
			.select('body_markdown, revision, document_state')
			.eq('seat_id', seatId)
			.maybeSingle()
			// Replaces Supabase's guess at the row's shape with ours. It has to come last.
			.overrideTypes<PositionPaperDraftRow, { merge: false }>();

		if (error) {
			throw new Error(`Could not read the draft: ${error.message}`);
		}

		if (!data) return null;

		return {
			markdown: data.body_markdown,
			revision: data.revision,
			documentState: data.document_state
		};
	}

	async function insert(columns: LivePaperColumns): Promise<number | null> {
		const { data, error } = await supabase
			.from('position_paper_drafts')
			.insert({
				seat_id: seatId,
				body_markdown: columns.markdown,
				document_state: columns.documentState
			})
			.select('revision')
			.single()
			.overrideTypes<{ revision: number }, { merge: false }>();

		if (error?.code === UNIQUE_VIOLATION_CODE) return null;

		if (error || !data) {
			throw new Error(`Could not save the draft: ${error?.message}`);
		}

		return data.revision;
	}

	async function update(revision: number, columns: LivePaperColumns): Promise<number | null> {
		const { data, error } = await supabase
			.from('position_paper_drafts')
			.update({ body_markdown: columns.markdown, document_state: columns.documentState })
			.eq('seat_id', seatId)
			.eq('revision', revision)
			.select('revision')
			.overrideTypes<{ revision: number }[], { merge: false }>();

		if (error) {
			throw new Error(`Could not save the draft: ${error.message}`);
		}

		return data?.[0]?.revision ?? null;
	}

	return { read, insert, update };
}

/** The seat's draft document, as `readLivePaperState` reads it. */
export async function readLiveDocumentState(
	supabase: SupabaseClient,
	seatId: string
): Promise<Uint8Array | null> {
	return readLivePaperState(positionPaperDraftStore(supabase, seatId));
}

/** The seat's draft document with `markdown` written in, as `livePaperWithMarkdown` makes it. */
export async function documentWithMarkdown(
	supabase: SupabaseClient,
	seatId: string,
	baseRevision: number,
	markdown: string
): Promise<string | null> {
	return livePaperWithMarkdown(positionPaperDraftStore(supabase, seatId), baseRevision, markdown);
}

/**
 * What the page needs to write the paper live (T148), or `null` when the
 * reader writes it alone: a delegate with no delegation, or none but them in
 * it. Their page saves the Markdown as before, which keeps the stored
 * document in step (`documentWithMarkdown`). The delegation's members are the
 * writers the page may name beside a cursor ($lib/live-writers.ts).
 */
export async function readLivePaperSetup(
	supabase: SupabaseClient,
	seatId: string,
	sharing: PaperSharing | null,
	readerId: string
): Promise<LivePaperSetup | null> {
	if (sharedWithText(sharing, readerId) === null) return null;

	const writers: LiveWriter[] = sharing?.members ?? [];
	const reader = writers.find((member) => member.id === readerId);
	const state = await readLiveDocumentState(supabase, seatId);

	return {
		topic: paperChannelTopic(seatId),
		documentState: state === null ? null : bytesToBase64(state),
		openSuggestions: storedSuggestionCount(state),
		writer: { id: readerId, name: reader?.name ?? UNKNOWN_MEMBER_NAME },
		writers
	};
}
