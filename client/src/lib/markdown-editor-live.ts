/**
 * The Markdown editor when several people write in it at once.
 *
 * The text lives in a Yjs document instead of in the editor. Yjs is a
 * library whose documents can take changes from several people in any order
 * and still come out the same everywhere, so two people typing in one
 * paragraph never overwrite each other. Tiptap's Collaboration extension
 * keeps the editor and the document in step; its CollaborationCaret extension
 * draws everybody else's cursor, from the document's "awareness" (see
 * `$lib/live-writers.ts`).
 *
 * Whatever carries the changes between browsers is not this file's concern:
 * `$lib/paper-live-channel.ts` does that for every paper.
 */

import type { AnyExtension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import type { DecorationAttrs } from '@tiptap/pm/view';
import type { Awareness } from 'y-protocols/awareness';
import type { Doc } from 'yjs';
import { resolveLiveWriter, type LiveWriter } from '$lib/live-writers';
import { firstName } from '$lib/profiles';

/** The name of the part of a Yjs document the editor's text is kept in. */
export const LIVE_DOCUMENT_FIELD = 'default';

/** What an editor needs to write in a shared document. */
export type LiveDocument = {
	/** The Yjs document the text lives in. */
	document: Doc;
	/** Who is in the document and where their cursor is. */
	awareness: Awareness;
	/** The person at this editor, as the others will see them. */
	writer: LiveWriter;
	/**
	 * Everybody who may write in the document, as the server knows them. A
	 * cursor is named from this list, never from what its own browser sent
	 * (`$lib/live-writers.ts`). It is read each time a cursor is drawn, so it
	 * may grow while the editor is open.
	 */
	writers: LiveWriter[];
};

/**
 * Somebody else's cursor: a thin light-blue line with their first name on a
 * pale label above it. Every writer's cursor looks the same, because the name
 * is what tells them apart. A cursor whose entry names nobody the server
 * knows is not drawn at all.
 */
function drawCaret(user: Record<string, unknown>, knownWriters: LiveWriter[]): HTMLElement {
	const writer = resolveLiveWriter({ user }, knownWriters);

	const caret = document.createElement('span');

	if (writer === null) {
		caret.hidden = true;
		return caret;
	}

	caret.className = 'pointer-events-none relative -mx-px border-x border-ring';
	// A screen reader hears who is here from the list beside the editor, not in the middle of the text.
	caret.setAttribute('aria-hidden', 'true');

	const label = document.createElement('span');
	label.className =
		'absolute bottom-full -left-px rounded-[3px] bg-selected px-1 text-[0.6875rem] leading-[0.875rem] font-medium whitespace-nowrap text-primary select-none';
	label.textContent = firstName(writer.name);
	caret.append(label);

	return caret;
}

/**
 * Somebody else's selected text, which is drawn as nothing at all: the pale
 * blue a selection would need already marks text with a comment on it, and
 * the caret is enough to show where somebody is working.
 */
function drawSelection(): DecorationAttrs {
	return {};
}

/** The extensions that make an editor write in `live.document` and show the others' cursors. */
export function liveEditingExtensions(live: LiveDocument): AnyExtension[] {
	const collaboration = Collaboration.configure({
		document: live.document,
		field: LIVE_DOCUMENT_FIELD
	});

	/*
		The extension was written for Tiptap's own server, whose "provider"
		carries the awareness. It only ever reads `provider.awareness`, so an
		object holding just that stands in for one.
	*/
	const carets = CollaborationCaret.configure({
		provider: { awareness: live.awareness },
		user: live.writer,
		render: (user) => drawCaret(user, live.writers),
		selectionRender: drawSelection
	});

	return [collaboration, carets];
}
