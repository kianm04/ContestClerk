/*
	What the editor does for a draft resolution alone (docs/committee-papers.md,
	section 4, "The draft resolution's text"):

	- it styles each clause's opening phrase as it is shown, never as it is
	  stored: italic in the preamble, underlined in the operative part, so the
	  authors never fight the formatting;
	- it underlines, dotted, the last word of each clause a format check is
	  about, so a warning beside the paper points at its spot;
	- "Opening phrase" styles a phrase that is on no list, and the indent
	  buttons move a clause in to a sub-clause and back out.

	The styling is ProseMirror "decorations": classes drawn over the text that
	are not part of the document, so they are never saved and never reach the
	other authors.
*/

import { Extension, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
	documentClauses,
	documentPartAt,
	lastWordRange,
	openingPhraseRange
} from '$lib/resolution-document';

/** The clauses a format check is about, by name: "clause 4", "preambulatory clause 2". */
type ClausesState = { warnedClauses: readonly string[] };

const RESOLUTION_CLAUSES = new PluginKey<ClausesState>('resolutionClauses');

/*
	Written out in full so Tailwind can find the class names in this file. The
	warning's dotted line is the warning colour and sits a little lower than an
	underlined phrase, so the two never run together.
*/
const PHRASE_CLASSES = { preamble: 'italic', operative: 'underline underline-offset-2' };
const WARNING_CLASSES =
	'underline decoration-dotted decoration-warning decoration-2 underline-offset-4';

function decorationsOf(document: ProseMirrorNode, state: ClausesState): DecorationSet {
	const decorations: Decoration[] = [];

	for (const clause of documentClauses(document)) {
		const phrase = openingPhraseRange(document, clause);
		if (phrase) {
			decorations.push(
				Decoration.inline(phrase.from, phrase.to, { class: PHRASE_CLASSES[clause.part] })
			);
		}

		const lastWord = lastWordRange(document, clause);
		if (state.warnedClauses.includes(clause.name) && lastWord.to > lastWord.from) {
			decorations.push(Decoration.inline(lastWord.from, lastWord.to, { class: WARNING_CLASSES }));
		}
	}

	return DecorationSet.create(document, decorations);
}

/**
 * The editor extension for a draft resolution. Its state is which clauses
 * the format checks are about, set with `showFormatWarnings`.
 */
export const resolutionClauses = Extension.create({
	name: 'resolutionClauses',

	addProseMirrorPlugins() {
		// The decorations are worked out again only when the text or the warnings change.
		let drawn: { document: ProseMirrorNode; state: ClausesState; set: DecorationSet } | null = null;

		const plugin = new Plugin<ClausesState>({
			key: RESOLUTION_CLAUSES,
			state: {
				init: () => ({ warnedClauses: [] }),
				apply: (transaction, state) => transaction.getMeta(RESOLUTION_CLAUSES) ?? state
			},
			props: {
				decorations(editorState) {
					const state = RESOLUTION_CLAUSES.getState(editorState) ?? { warnedClauses: [] };

					if (drawn?.document !== editorState.doc || drawn.state !== state) {
						drawn = {
							document: editorState.doc,
							state,
							set: decorationsOf(editorState.doc, state)
						};
					}

					return drawn.set;
				}
			}
		});

		return [plugin];
	}
});

/** Underlines, dotted, the last word of each clause named, and no other. */
export function showFormatWarnings(editor: Editor, clauseNames: readonly string[]): void {
	const state: ClausesState = { warnedClauses: clauseNames };
	// Changes nothing in the text, so the history and the other authors never see it.
	editor.view.dispatch(
		editor.state.tr.setMeta(RESOLUTION_CLAUSES, state).setMeta('addToHistory', false)
	);
}

/**
 * "Opening phrase": the selected words styled as the opening phrase of the
 * part they are in, italic in the preamble and underlined in the operative
 * part, or the style taken off again.
 */
export function markOpeningPhrase(editor: Editor): void {
	const part = documentPartAt(editor.state.doc, editor.state.selection.from);
	const chain = editor.chain().focus();

	if (part === 'preamble') chain.toggleItalic().run();
	else chain.toggleUnderline().run();
}

/** Moves the clause at the cursor one level in, making it a sub-clause of the one above. */
export function indentClause(editor: Editor): void {
	editor.chain().focus().sinkListItem('listItem').run();
}

/** Moves the sub-clause at the cursor one level out. */
export function outdentClause(editor: Editor): void {
	editor.chain().focus().liftListItem('listItem').run();
}

/** Puts the cursor at the end of the clause named, where a format check points, and shows it. */
export function focusClause(editor: Editor, clauseName: string): void {
	const clause = documentClauses(editor.state.doc).find(
		(candidate) => candidate.name === clauseName
	);
	if (!clause) return;

	const lastWord = lastWordRange(editor.state.doc, clause);
	editor.chain().focus().setTextSelection(lastWord.to).scrollIntoView().run();
}
