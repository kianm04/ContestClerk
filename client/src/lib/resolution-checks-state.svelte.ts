/*
	The format checks of the paper being written, kept in step with the
	editor (docs/committee-papers.md, section 4). The list beside the paper
	reads `warnings`; the editor underlines, dotted, the last word of each
	clause a warning is about; and a click on a warning puts the cursor there.

	A `.svelte.ts` file may use runes outside a component. `createResolutionChecks`
	must still be called while a component is being set up, because its
	`$effect` belongs to that component and stops when it goes.
*/

import type { Editor } from '@tiptap/core';
import type { PaperKind } from '$lib/committee-papers';
import { editorMarkdown } from '$lib/markdown-editor';
import { formatWarnings, type FormatWarning } from '$lib/resolution-checks';
import { focusClause, resolutionClauses, showFormatWarnings } from '$lib/resolution-editor';
import { splitResolutionMarkdown } from '$lib/resolution-text';

export type ResolutionChecksSetup = {
	/** The paper's kind: a directive has no preamble. */
	kind: Extract<PaperKind, 'draft_resolution' | 'committee_directive'>;
	/** Whether the committee checks the format at all (`checks_format`). */
	isOn: boolean;
	/** The text when the page loaded, checked before the editor starts. */
	initialMarkdown: string;
};

/** What a paper's text breaks of the format, or nothing for a committee that does not check it. */
export function warningsOf(
	setup: Omit<ResolutionChecksSetup, 'initialMarkdown'>,
	markdown: string
) {
	if (!setup.isOn) return [];
	if (setup.kind === 'committee_directive') return formatWarnings('', markdown);

	const { preamble, operative } = splitResolutionMarkdown(markdown);

	return formatWarnings(preamble, operative);
}

export type ResolutionChecks = ReturnType<typeof createResolutionChecks>;

export function createResolutionChecks(setup: ResolutionChecksSetup) {
	let editor = $state.raw<Editor | null>(null);
	let markdown = $state(setup.initialMarkdown);

	const warnings: FormatWarning[] = $derived(warningsOf(setup, markdown));

	// Underlines the clauses the warnings are about whenever either changes.
	$effect(() => {
		const clauseNames = warnings.map((warning) => warning.clauseName);
		// After this transaction, which is still being applied when the editor says it changed.
		if (editor !== null) {
			const started = editor;
			queueMicrotask(() => {
				if (!started.isDestroyed) showFormatWarnings(started, clauseNames);
			});
		}
	});

	function handleUpdate() {
		if (editor !== null) markdown = editorMarkdown(editor);
	}

	return {
		/** The editor's own part: styling the opening phrases and drawing the warnings. */
		extensions: [resolutionClauses],
		get warnings() {
			return warnings;
		},
		/** Follow a started editor. The function it returns lets go of it. */
		attach(started: Editor) {
			editor = started;
			markdown = editorMarkdown(started);
			started.on('update', handleUpdate);

			return () => {
				started.off('update', handleUpdate);
				editor = null;
			};
		},
		/** Puts the cursor at the end of the clause a warning is about. */
		focus(clauseName: string) {
			if (editor !== null) focusClause(editor, clauseName);
		}
	};
}

/**
 * The format checks for a paper of any kind: a working paper, a position
 * paper and the rest have no clauses, so they have none.
 */
export function createPaperChecks(
	setup: Omit<ResolutionChecksSetup, 'kind'> & { kind: PaperKind }
): ResolutionChecks | null {
	const { kind } = setup;
	if (kind !== 'draft_resolution' && kind !== 'committee_directive') return null;

	return createResolutionChecks({ ...setup, kind });
}
