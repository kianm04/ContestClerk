// @vitest-environment jsdom
// The editor draws into a page, so this file runs in jsdom's pretend browser
// rather than in plain Node like the other tests beside it.

import type { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { createMarkdownEditor, editorMarkdown } from './markdown-editor';
import {
	LIVE_DOCUMENT_FIELD,
	liveEditingExtensions,
	type LiveDocument
} from './markdown-editor-live';
import {
	openPaperDocument,
	paperDocumentMarkdown,
	seedPaperDocument,
	writeMarkdownIntoPaperDocument
} from './paper-document';

// See `markdown-editor.test.ts`: jsdom lays nothing out, and ProseMirror asks.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let editor: Editor | null = null;
const openAwareness: Awareness[] = [];

const TOM = { id: 'tom', name: 'Tom Price' };
const RACHEL = { id: 'rachel', name: 'Rachel Morgan' };

/** A shared document holding `markdown`, with Tom at this editor and Rachel the other writer the server knows. */
function liveDocument(markdown: string): LiveDocument {
	const document = openPaperDocument(seedPaperDocument(markdown));
	const awareness = new Awareness(document);
	openAwareness.push(awareness);

	return { document, awareness, writer: TOM, writers: [TOM, RACHEL] };
}

/** An editor writing in `live`, the way `MarkdownEditor` starts one. */
function startLiveEditor(live: LiveDocument): Editor {
	editor = createMarkdownEditor({
		element: document.body.appendChild(document.createElement('div')),
		markdown: 'Ignored: the text comes from the shared document.',
		id: 'editor',
		labelledBy: 'editor-label',
		placeholder: 'Write here…',
		onChange: vi.fn(),
		onFormattingChange: vi.fn(),
		onLinkShortcut: vi.fn(),
		live
	});

	return editor;
}

/**
 * Put another writer in the document, with their cursor after the first
 * `offset` characters of the first paragraph, the way their page announces it.
 */
function addWriter(live: LiveDocument, user: { id: string; name: string }, offset: number) {
	const otherDocument = new Y.Doc();
	Y.applyUpdate(otherDocument, Y.encodeStateAsUpdate(live.document));
	const other = new Awareness(otherDocument);
	openAwareness.push(other);

	const firstParagraph = otherDocument.getXmlFragment(LIVE_DOCUMENT_FIELD).get(0) as Y.XmlElement;
	const text = firstParagraph.get(0) as Y.XmlText;
	const position = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, offset));
	other.setLocalState({ user, cursor: { anchor: position, head: position } });

	// Hand their announcement to this editor's awareness, as the channel does.
	const announcement = encodeAwarenessUpdate(other, [otherDocument.clientID]);
	applyAwarenessUpdate(live.awareness, announcement, 'test');
}

afterEach(() => {
	editor?.destroy();
	editor = null;
	for (const awareness of openAwareness.splice(0)) awareness.destroy();
	document.body.innerHTML = '';
});

describe('liveEditingExtensions', () => {
	it('gives the collaboration extension the document and the carets the writer', () => {
		const live = liveDocument('Words.');

		const [collaboration, carets] = liveEditingExtensions(live);

		expect(collaboration.options.document).toBe(live.document);
		expect(collaboration.options.field).toBe(LIVE_DOCUMENT_FIELD);
		expect(carets.options.user).toMatchObject({ id: 'tom', name: 'Tom Price' });
		expect(carets.options.provider.awareness).toBe(live.awareness);
	});

	it('shows the shared document, and writes what is typed into it', () => {
		const live = liveDocument('France supports the treaty.');
		const liveEditor = startLiveEditor(live);

		expect(editorMarkdown(liveEditor)).toBe('France supports the treaty.');

		liveEditor.commands.insertContentAt(liveEditor.state.doc.content.size - 1, ' Tom agrees.');

		expect(paperDocumentMarkdown(live.document)).toBe('France supports the treaty. Tom agrees.');
	});

	it("shows another writer's words as soon as they reach the document", () => {
		const live = liveDocument('France supports the treaty.');
		const liveEditor = startLiveEditor(live);
		const rachels = openPaperDocument(Y.encodeStateAsUpdate(live.document));

		writeMarkdownIntoPaperDocument(rachels, 'France supports the treaty. Rachel agrees.');
		Y.applyUpdate(
			live.document,
			Y.encodeStateAsUpdate(rachels, Y.encodeStateVector(live.document))
		);

		expect(editorMarkdown(liveEditor)).toBe('France supports the treaty. Rachel agrees.');
	});

	it("draws another writer's cursor with their first name, hidden from screen readers", async () => {
		const live = liveDocument('France supports the treaty.');
		const liveEditor = startLiveEditor(live);
		// The collaboration extension links the editor to the document a tick after it starts.
		await new Promise((resolve) => setTimeout(resolve, 0));

		// The entry's own name is a claim; the label is the server's name for the id.
		addWriter(live, { id: 'rachel', name: 'Somebody Else' }, 6);
		// The extension gathers cursor news and redraws on the next tick.
		await new Promise((resolve) => setTimeout(resolve, 0));

		const caret = liveEditor.view.dom.querySelector('[aria-hidden="true"]');
		expect(caret?.textContent).toBe('Rachel');
		// The name is not part of the text itself.
		expect(editorMarkdown(liveEditor)).toBe('France supports the treaty.');
	});

	it('draws no cursor for an id the server does not know', async () => {
		const live = liveDocument('France supports the treaty.');
		const liveEditor = startLiveEditor(live);
		await new Promise((resolve) => setTimeout(resolve, 0));

		addWriter(live, { id: 'stranger', name: 'Rachel Morgan' }, 6);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(liveEditor.view.dom.querySelector('[aria-hidden="true"]')).toBeNull();
		const hiddenCaret = liveEditor.view.dom.querySelector('span[hidden]');
		expect(hiddenCaret?.textContent).toBe('');
	});
});
