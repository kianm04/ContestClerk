/**
 * A committee paper's text drawn by the editor but closed to typing, for the
 * dais reviewing a submitted paper (`docs/committee-papers.md`, step 5).
 *
 * The dais's notes are anchored to words the way the authors' comments are:
 * with Yjs relative positions, which only an editor bound to the paper's Yjs
 * document can encode (`paper-threads.ts`). So the page opens the document as
 * it was submitted and draws it here, without joining the authors' channel
 * and without ever saving: nothing typed here could reach the paper.
 *
 * A reader can still select words in a view that cannot be typed in, which is
 * all a note on a passage needs.
 */

import { Editor, type AnyExtension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import type { Doc } from 'yjs';
import { markdownDocumentExtensions, writingAreaClasses } from '$lib/markdown-editor';
import { LIVE_DOCUMENT_FIELD } from '$lib/markdown-editor-live';

/** What `createPaperReadingEditor` needs to know. */
export type PaperReadingSetup = {
	/** The element the editor draws the text into. */
	element: HTMLElement;
	/** The paper's Yjs document, opened from what was stored and never sent anywhere. */
	document: Doc;
	/** The id the text gets, which the Comment button points at. */
	id: string;
	/** The id of the element that names the text: the paper's title. */
	labelledBy: string;
	/** The page's own extensions: the notes beside the text and the clauses' styling. */
	extensions: AnyExtension[];
};

/**
 * The editor's attributes for a screen reader: a text box, as the authors'
 * editor is, that says it cannot be changed.
 */
export function readingAreaAttributes(setup: Pick<PaperReadingSetup, 'id' | 'labelledBy'>) {
	return {
		id: setup.id,
		role: 'textbox',
		'aria-multiline': 'true',
		'aria-readonly': 'true',
		'aria-labelledby': setup.labelledBy,
		class: writingAreaClasses('committee-paper')
	};
}

/** Start an editor in `setup.element` that shows `setup.document` and takes no typing. */
export function createPaperReadingEditor(setup: PaperReadingSetup): Editor {
	// `Collaboration` draws the text from the Yjs document and binds the two,
	// which is what lets a note's ends be encoded as relative positions.
	const collaboration = Collaboration.configure({
		document: setup.document,
		field: LIVE_DOCUMENT_FIELD
	});

	return new Editor({
		element: setup.element,
		// The document may hold the marks of suggestions, so it reads them as the authors' editor does.
		extensions: [...markdownDocumentExtensions(true), collaboration, ...setup.extensions],
		editable: false,
		editorProps: { attributes: readingAreaAttributes(setup) }
	});
}
