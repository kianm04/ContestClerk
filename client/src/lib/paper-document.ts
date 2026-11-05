/**
 * A position paper draft as a Yjs document (T148), read and written the same
 * way in the browser and on the server.
 *
 * While a delegation writes a paper together, its text lives in a Yjs
 * document (see `$lib/markdown-editor-live.ts`). Yjs sends a document around
 * as an "update": bytes holding everything written into it, and everything
 * deleted. Two updates can always be merged, in either order, into one that
 * holds both people's changes, which is how the server stores the document
 * without ever overwriting what somebody else wrote.
 *
 * The rest of MUNMeet reads the paper as Markdown, so the server writes the
 * Markdown from the merged document on every save (`paperDocumentMarkdown`),
 * with the same Tiptap extensions the editor runs with.
 */

import { getSchema, type JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
	prosemirrorJSONToYXmlFragment,
	updateYFragment,
	yXmlFragmentToProsemirrorJSON
} from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { markdownDocumentExtensions } from '$lib/markdown-editor';
import { LIVE_DOCUMENT_FIELD } from '$lib/markdown-editor-live';
import { agreedDocument, countSuggestions } from '$lib/paper-suggestions';

/**
 * The part of the document that says which start it grew from: see
 * `paperDocumentLineage`. It sits beside the text, which the editor never reads.
 */
const LINEAGE_MAP = 'paper';
const LINEAGE_KEY = 'seed';

/** The editor's extensions, read once: they decide what a paper may hold. */
const EXTENSIONS = markdownDocumentExtensions(true);
const SCHEMA = getSchema(EXTENSIONS);
const MARKDOWN = new MarkdownManager({ extensions: EXTENSIONS });

/** The editor's own tree for `markdown`, as plain data. */
function markdownToJson(markdown: string): JSONContent {
	return MARKDOWN.parse(markdown);
}

/**
 * A number worked out from the text, the same every time for the same text.
 * Yjs names every change by the "client" that made it; see `seedPaperDocument`.
 */
function seedClientId(markdown: string): number {
	// FNV-1a, a well-known short hash, kept to the 32 bits Yjs expects.
	let hash = 0x811c9dc5;

	for (let index = 0; index < markdown.length; index += 1) {
		hash ^= markdown.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}

	return hash;
}

/**
 * The document of a draft that has only ever been Markdown: saved before
 * T148, or started from the submitted paper for "Edit and resubmit".
 *
 * Two browsers that open such a draft at once each build its document on
 * their own. Yjs would normally see two different sets of changes and keep
 * both, doubling the text. Building it as one made-up client, numbered from
 * the text itself, gives both the very same changes, which Yjs then counts once.
 */
export function seedPaperDocument(markdown: string): Uint8Array {
	const document = new Y.Doc();
	document.clientID = seedClientId(markdown);
	document.getMap(LINEAGE_MAP).set(LINEAGE_KEY, document.clientID);

	const fragment = document.getXmlFragment(LIVE_DOCUMENT_FIELD);
	prosemirrorJSONToYXmlFragment(SCHEMA, markdownToJson(markdown), fragment);

	return Y.encodeStateAsUpdate(document);
}

/**
 * The number of the start a document grew from, the same in every copy of it.
 *
 * Submitting a paper drops its draft, and "Edit and resubmit" starts a new
 * one from the submitted text. A fellow member whose page still holds the
 * old document must not pour it into the new one, which would write the paper
 * out twice. Two documents with different lineages never mix: the channel
 * ignores the other's changes and the server refuses the other's save.
 * `null` for a document that is still empty, before any update reached it.
 */
export function paperDocumentLineage(document: Y.Doc): number | null {
	const lineage = document.getMap(LINEAGE_MAP).get(LINEAGE_KEY);

	return typeof lineage === 'number' ? lineage : null;
}

/** A Yjs document holding every one of `updates`. */
export function openPaperDocument(...updates: Uint8Array[]): Y.Doc {
	const document = new Y.Doc();

	for (const update of updates) {
		Y.applyUpdate(document, update);
	}

	return document;
}

/** The whole of `document` as one update, to store or to send. */
export function paperDocumentState(document: Y.Doc): Uint8Array {
	return Y.encodeStateAsUpdate(document);
}

/** The editor's tree of the document's text. */
function paperDocumentTree(document: Y.Doc): ProseMirrorNode {
	const fragment = document.getXmlFragment(LIVE_DOCUMENT_FIELD);

	return ProseMirrorNode.fromJSON(SCHEMA, yXmlFragmentToProsemirrorJSON(fragment));
}

/**
 * The document's agreed text as Markdown, without the blank lines Tiptap
 * leaves at the end: the suggestions in it wait for the other authors, so
 * they are left out, as if all were rejected.
 */
export function paperDocumentMarkdown(document: Y.Doc): string {
	const agreed = agreedDocument(paperDocumentTree(document));
	const markdown = MARKDOWN.serialize(agreed.toJSON());

	return markdown.replace(/\s+$/, '');
}

/** How many suggestions in the document are still to be accepted or rejected. */
export function paperDocumentSuggestionCount(document: Y.Doc): number {
	return countSuggestions(paperDocumentTree(document));
}

/**
 * Change `document` so it reads `markdown`, as one more writer's edit. Used
 * for a draft saved as plain Markdown, from the page without JavaScript: Yjs
 * works out the smallest change from the text there now, so the rest of the
 * document, and what others are typing into it, is kept.
 */
export function writeMarkdownIntoPaperDocument(document: Y.Doc, markdown: string): void {
	const fragment = document.getXmlFragment(LIVE_DOCUMENT_FIELD);
	const paper = ProseMirrorNode.fromJSON(SCHEMA, markdownToJson(markdown));

	updateYFragment(document, fragment, paper, { mapping: new Map(), isOMark: new Map() });
}

/** Bytes as base64 text, the way they travel in a form or a Realtime message. */
export function bytesToBase64(bytes: Uint8Array): string {
	// `btoa` takes a string with one character per byte, built in pieces
	// because one call with a very long list of arguments can fail.
	const PIECE_LENGTH = 0x8000;
	let binary = '';

	for (let start = 0; start < bytes.length; start += PIECE_LENGTH) {
		const piece = bytes.subarray(start, start + PIECE_LENGTH);
		binary += String.fromCharCode(...piece);
	}

	return btoa(binary);
}

/** Base64 text back as bytes. Throws on text that is not base64. */
export function base64ToBytes(text: string): Uint8Array {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}
