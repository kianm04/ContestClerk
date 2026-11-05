// @vitest-environment jsdom
// The editor draws into a page, so this file runs in jsdom's pretend browser.

import { Extension, type Editor } from '@tiptap/core';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { editorMarkdown } from './markdown-editor';
import { openPaperDocument, seedPaperDocument } from './paper-document';
import { createPaperReadingEditor, readingAreaAttributes } from './paper-reading-editor';

let editor: Editor | null = null;

afterEach(() => {
	editor?.destroy();
	editor = null;
});

function startReading(markdown: string, extensions = [] as Extension[]) {
	const document = openPaperDocument(seedPaperDocument(markdown));
	editor = createPaperReadingEditor({
		element: window.document.body.appendChild(window.document.createElement('div')),
		document,
		id: 'paper-text',
		labelledBy: 'paper-title',
		extensions
	});

	return { editor, document };
}

describe('readingAreaAttributes', () => {
	it('names the text by the title and says it cannot be changed', () => {
		const attributes = readingAreaAttributes({ id: 'paper-text', labelledBy: 'paper-title' });

		expect(attributes).toMatchObject({
			id: 'paper-text',
			role: 'textbox',
			'aria-readonly': 'true',
			'aria-labelledby': 'paper-title'
		});
		expect(attributes.class).toContain('text-body');
	});
});

describe('createPaperReadingEditor', () => {
	it("draws the paper's document, takes no typing and leaves the document as it was", () => {
		const { editor, document } = startReading('Recalling its resolution 78/241,');
		const before = Y.encodeStateVector(document);

		expect(editorMarkdown(editor)).toBe('Recalling its resolution 78/241,');
		expect(editor.isEditable).toBe(false);
		expect(Y.encodeStateVector(document)).toEqual(before);
	});

	it("is bound to the Yjs document, so a note's ends can be encoded", () => {
		const { editor } = startReading('Recalling its resolution 78/241,');

		expect(ySyncPluginKey.getState(editor.state)?.binding).toBeTruthy();
	});

	it('adds the extensions the page brings, such as the notes beside the text', () => {
		const notes = Extension.create({ name: 'notes' });
		const { editor } = startReading('Recalling', [notes]);

		expect(editor.extensionManager.extensions.map((extension) => extension.name)).toContain(
			'notes'
		);
	});
});
