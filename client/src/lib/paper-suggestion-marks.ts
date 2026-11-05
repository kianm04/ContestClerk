/*
	The two marks a suggestion leaves in a paper's text (docs/committee-papers.md,
	section 7). Words someone proposes to add carry `suggestedInsertion` and are
	underlined; words someone proposes to take out carry `suggestedDeletion` and
	are struck through. Both stay in the shared document until another author
	accepts or rejects them, so everyone writing sees them at once.

	A mark is a span of formatting, like bold, so it cannot stand for a paragraph
	break, which is the edge between two blocks rather than text. A suggested new
	paragraph, or a suggested join of two, is therefore one invisible character,
	`BREAK_MARKER`, at the start of the paragraph after the break, carrying the
	mark. `paper-suggestions.ts` reads and decides them.
*/

import { Mark, mergeAttributes, type AnyExtension } from '@tiptap/core';

export const SUGGESTED_INSERTION = 'suggestedInsertion';
export const SUGGESTED_DELETION = 'suggestedDeletion';

/** A zero-width space: it takes no room on the page and is never read out. */
export const BREAK_MARKER = '\u200B';

/** What each suggestion mark carries, the same on every piece of one suggestion. */
export type SuggestionMarkAttributes = {
	/** Which suggestion the piece belongs to, so all its pieces are decided together. */
	id: string;
	/** The user who suggested it. */
	userId: string;
	/** When it was suggested, as an ISO date. */
	at: string;
};

/*
	Each attribute is written into the page as a `data-` attribute and read back
	from it. ProseMirror re-reads the page whenever the browser changes it on its
	own (a spell checker's correction, say), and an attribute it could not read
	back would be lost from the mark.
*/
function pageAttribute(name: keyof SuggestionMarkAttributes, attribute: string) {
	return {
		default: '',
		parseHTML: (element: HTMLElement) => element.getAttribute(attribute) ?? '',
		renderHTML: (attributes: Record<string, string>) => ({ [attribute]: attributes[name] })
	};
}

function suggestionMark(name: string, tag: 'ins' | 'del', classes: string): AnyExtension {
	return Mark.create({
		name,
		// Text typed just after a suggestion is not part of it unless it is typed as one.
		inclusive: false,
		addAttributes() {
			return {
				id: pageAttribute('id', 'data-suggestion'),
				userId: pageAttribute('userId', 'data-suggestion-by'),
				at: pageAttribute('at', 'data-suggestion-at')
			};
		},
		parseHTML() {
			// Above the 50 of the strike-through mark, which also reads `<del>`.
			return [{ tag: `${tag}[data-suggestion]`, priority: 60 }];
		},
		renderHTML({ HTMLAttributes }) {
			return [tag, mergeAttributes(HTMLAttributes, { class: classes }), 0];
		}
	});
}

/** How suggested words look: added ones underlined in light blue, taken-out ones struck through. */
export const INSERTION_LOOK =
	'text-primary underline decoration-ring decoration-2 underline-offset-3';
export const DELETION_LOOK =
	'text-muted-foreground line-through decoration-foreground decoration-[1.5px]';

/**
 * The marks every live paper's schema needs, the server's included: the shared
 * document drops anything its schema does not know, which would turn a
 * suggestion into plain text for everyone.
 */
export function suggestionMarkExtensions(): AnyExtension[] {
	return [
		suggestionMark(SUGGESTED_INSERTION, 'ins', INSERTION_LOOK),
		suggestionMark(SUGGESTED_DELETION, 'del', DELETION_LOOK)
	];
}
