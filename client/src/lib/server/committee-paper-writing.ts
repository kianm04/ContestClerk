/**
 * Writing a committee paper's text (`docs/committee-papers.md`, section 7):
 * where its document is kept, what its page needs to write it live, and its
 * saves, from the live editor and from a page without JavaScript.
 *
 * The merging is `./paper-live-drafts.ts`'s, the same as a position paper's;
 * this file only says where a committee paper is kept. Row Level Security
 * lets the text change only while the paper is being written and only by its
 * authors, and lets a save change nothing but the text and the title
 * (`protect_committee_papers_columns` in the migrations).
 *
 * Files under `$lib/server` only ever run on the server.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	COMMITTEE_PAPER_MESSAGES,
	type CommitteePaper,
	type PaperKind
} from '$lib/committee-papers';
import type { LiveWriter } from '$lib/live-writers';
import { plainFormSuggestionsMessage } from '$lib/paper-comments';
import { bytesToBase64 } from '$lib/paper-document';
import { committeePaperChannelTopic } from '$lib/paper-live-channel';
import type { LivePaperSetup } from '$lib/paper-live.svelte';
import {
	PAPER_WRITING_MESSAGES,
	WRITTEN_PAPER_MAX_LENGTH,
	normaliseLineEnds,
	type PaperDraft
} from '$lib/paper-writing';
import {
	joinResolutionMarkdown,
	paperTextColumns,
	paperTextFromColumns,
	type PaperTextColumns
} from '$lib/resolution-text';
import {
	SERVER_PROBLEM_MESSAGE,
	readWrittenForm,
	refuseWriting,
	saveLivePaperFromForm,
	type WrittenForm
} from './paper-draft-form';
import {
	livePaperWithMarkdown,
	readLivePaperState,
	storedSuggestionCount,
	type LivePaperColumns,
	type LivePaperStore,
	type StoredLivePaper
} from './paper-live-drafts';
import { readEditorName } from './position-paper-drafts';

/** A paper's text as a save reads it. */
type PaperTextRow = PaperTextColumns & { revision: number };

/** The paper's live document, a row of `committee_paper_documents`, as PostgREST sends `bytea`. */
type PaperDocumentRow = { document_state: string };

/** The paper a store keeps: its kind says which Markdown columns hold its text. */
export type StoredPaperName = { id: string; kind: PaperKind };

/**
 * Where a committee paper's text is kept: its own row of `committee_papers`,
 * which exists from the moment the paper is started, so there is never a
 * first text to insert, and its live document in `committee_paper_documents`,
 * a table only the paper's authors read (the document holds every open
 * suggestion and everything ever typed, which the paper's other readers have
 * no business with). A read finds nothing once the reader may no longer write
 * the paper, as when they have left it or it has gone to the dais, which
 * tells their page it can no longer save.
 *
 * The store reads and writes the paper's text as the one Markdown text its
 * editor shows; `$lib/resolution-text.ts` splits a draft resolution's into
 * its two parts and joins them again.
 */
export function committeePaperStore(
	supabase: SupabaseClient,
	paper: StoredPaperName
): LivePaperStore {
	const paperId = paper.id;

	async function read(): Promise<StoredLivePaper | null> {
		const [stored, document, mayWrite] = await Promise.all([
			supabase
				.from('committee_papers')
				.select('body_markdown, preamble_markdown, operative_markdown, revision')
				.eq('id', paperId)
				.maybeSingle()
				// Replaces Supabase's guess at the row's shape with ours. It has to come last.
				.overrideTypes<PaperTextRow, { merge: false }>(),
			supabase
				.from('committee_paper_documents')
				.select('document_state')
				.eq('paper_id', paperId)
				.maybeSingle()
				.overrideTypes<PaperDocumentRow, { merge: false }>(),
			supabase.rpc('may_write_paper', { paper_id: paperId })
		]);

		if (stored.error) {
			throw new Error(`Could not read the paper: ${stored.error.message}`);
		}

		if (document.error) {
			throw new Error(`Could not read the paper's document: ${document.error.message}`);
		}

		if (mayWrite.error) {
			throw new Error(`Could not check who may write the paper: ${mayWrite.error.message}`);
		}

		if (!stored.data || mayWrite.data !== true) return null;

		return {
			markdown: paperTextFromColumns(stored.data),
			revision: stored.data.revision,
			// No row yet for a paper saved only as Markdown, which the page seeds from its text.
			documentState: document.data?.document_state ?? null
		};
	}

	async function update(revision: number, columns: LivePaperColumns): Promise<number | null> {
		const text = paperTextColumns(paper.kind, columns.markdown);

		// One database function stores the text and the document together, in
		// one transaction, over `revision` and no other (`save_committee_paper_text`
		// in the migrations). The columns a kind does not use are left out and stay null.
		const { data, error } = await supabase.rpc('save_committee_paper_text', {
			paper_id: paperId,
			expected_revision: revision,
			document_state: columns.documentState,
			body_markdown: text.body_markdown ?? undefined,
			preamble_markdown: text.preamble_markdown ?? undefined,
			operative_markdown: text.operative_markdown ?? undefined
		});

		if (error) {
			throw new Error(`Could not save the paper: ${error.message}`);
		}

		// Nothing back: another save landed first, or the reader may no longer write the paper.
		return data ?? null;
	}

	return { read, insert: null, update };
}

/**
 * The epoch of the paper's authors (`committee_papers.live_epoch`), which
 * names the writing channel: it moves on whenever an author joins or leaves
 * or a seat changes hands, so a writer who lost access is left behind on the
 * old channel ($lib/paper-live-channel.ts).
 */
async function readLiveEpoch(supabase: SupabaseClient, paperId: string): Promise<number> {
	const { data, error } = await supabase
		.from('committee_papers')
		.select('live_epoch')
		.eq('id', paperId)
		.single()
		.overrideTypes<{ live_epoch: number }, { merge: false }>();

	if (error) {
		throw new Error(`Could not read the paper's channel: ${error.message}`);
	}

	return data.live_epoch;
}

/**
 * The paper as its live editor starts from it: the stored text, and who saved
 * it last. A paper is stored from the moment it is started, so there is always
 * one, which the editor seeds its document from exactly as the server does.
 */
export async function readCommitteePaperDraft(
	supabase: SupabaseClient,
	paper: CommitteePaper
): Promise<PaperDraft> {
	return {
		body: paper.body,
		revision: paper.revision,
		updatedAt: paper.updatedAt,
		updatedById: paper.updatedById,
		updatedByName: await readEditorName(supabase, paper.updatedById)
	};
}

/**
 * What the page needs to write the paper live with its other authors.
 * `writers` is everybody who may write the paper as the server knows them;
 * the page names a cursor only from that list ($lib/live-writers.ts).
 */
export async function readCommitteePaperSetup(
	supabase: SupabaseClient,
	paper: StoredPaperName,
	writer: LiveWriter,
	writers: LiveWriter[]
): Promise<LivePaperSetup> {
	const [state, epoch] = await Promise.all([
		readLivePaperState(committeePaperStore(supabase, paper)),
		readLiveEpoch(supabase, paper.id)
	]);

	return {
		topic: committeePaperChannelTopic(paper.id, epoch),
		epoch: { paperId: paper.id, epoch },
		documentState: state === null ? null : bytesToBase64(state),
		openSuggestions: storedSuggestionCount(state),
		writer,
		writers
	};
}

/**
 * Read the writing form a paper's page posted. Without JavaScript a draft
 * resolution is written in two plain boxes, the preambulatory clauses and the
 * operative ones (section 6), which are joined here into the one text the
 * live editor would have sent.
 */
export function readCommitteePaperForm(formData: FormData): WrittenForm {
	const form = readWrittenForm(formData);
	const preamble = formData.get('preamble');
	const operative = formData.get('operative');

	if (typeof preamble !== 'string' && typeof operative !== 'string') return form;

	const body = joinResolutionMarkdown(String(preamble ?? ''), String(operative ?? ''));

	return { ...form, body: normaliseLineEnds(body) };
}

/**
 * Refuse a Markdown save that did not start from the paper as it is stored
 * now. The text comes back in the box with the revision saved in between, so
 * pressing "Save changes" again keeps this version, as a position paper's
 * draft does without JavaScript.
 */
async function refuseStaleMarkdown(store: LivePaperStore, body: string) {
	const current = await store.read();

	// Nothing to save into: the reader has left the paper, or it has gone to the dais.
	if (current === null) {
		return { refusal: refuseWriting(409, COMMITTEE_PAPER_MESSAGES.replaced, body) };
	}

	const conflict = { revision: current.revision, theirs: null };

	return { refusal: refuseWriting(409, COMMITTEE_PAPER_MESSAGES.conflict, body, conflict) };
}

/**
 * Save the paper's text as a page without JavaScript posted it: the Markdown
 * is written into the stored document as one more edit, so the other
 * authors' live pages carry on, but only over the revision the page started
 * from.
 *
 * The plain box holds the agreed text, without the suggestions still open
 * (section 7), so saving it would throw them all away. While there are any it
 * saves nothing and says how many; a suggestion made after the count changes
 * the revision, and the save then meets its clash instead.
 */
async function saveMarkdown(store: LivePaperStore, form: WrittenForm, baseRevision: number) {
	const openSuggestions = storedSuggestionCount(await readLivePaperState(store));

	if (openSuggestions > 0) {
		const message = plainFormSuggestionsMessage(openSuggestions);

		return { refusal: refuseWriting(409, message, form.body) };
	}

	const documentState = await livePaperWithMarkdown(store, baseRevision, form.body);

	if (documentState === null) return refuseStaleMarkdown(store, form.body);

	const revision = await store.update(baseRevision, { markdown: form.body, documentState });

	// Another author's save landed between the read and this write.
	if (revision === null) return refuseStaleMarkdown(store, form.body);

	return { refusal: null, revision, missing: null };
}

/**
 * Save what the paper's page posted (`readWrittenForm`): the live editor's
 * whole document, merged into the stored one, or the Markdown of a page
 * without JavaScript. Answers the refusal the action returns, or the revision
 * now stored and, for the live editor, what its page is missing.
 */
export async function saveCommitteePaperFromForm(
	supabase: SupabaseClient,
	paper: StoredPaperName,
	form: WrittenForm
) {
	const store = committeePaperStore(supabase, paper);

	if (form.document !== null) {
		return saveLivePaperFromForm(store, form, COMMITTEE_PAPER_MESSAGES);
	}

	if (form.baseRevision === null) {
		return { refusal: refuseWriting(400, PAPER_WRITING_MESSAGES.revision, form.body) };
	}

	if (form.body.length > WRITTEN_PAPER_MAX_LENGTH) {
		return { refusal: refuseWriting(400, COMMITTEE_PAPER_MESSAGES.tooLong, form.body) };
	}

	try {
		return await saveMarkdown(store, form, form.baseRevision);
	} catch {
		return { refusal: refuseWriting(500, SERVER_PROBLEM_MESSAGE, form.body) };
	}
}
