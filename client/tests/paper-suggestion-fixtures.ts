/*
	Papers with suggestions in them, for the tests of `$lib/paper-suggestions.ts`
	and `$lib/paper-suggesting.ts`. `paper()` builds one from paragraphs, and
	`shown()` writes one back as a single line a test can compare, so a test
	reads like the page does:

	  "The {-old-}{+new+} plan | {+¶+}Next"

	Words added are in {+ +}, words taken out in {- -}, a break marker is ¶,
	bold is ** **, and " | " is where one paragraph ends and the next starts.

	`sharedDocumentHolding()` puts one into a Yjs document, as the server
	stores a paper written live, for the tests of the saves.
*/

import { getSchema, type JSONContent } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { markdownDocumentExtensions } from '$lib/markdown-editor';
import { LIVE_DOCUMENT_FIELD } from '$lib/markdown-editor-live';
import {
	BREAK_MARKER,
	SUGGESTED_DELETION,
	SUGGESTED_INSERTION,
	type SuggestionMarkAttributes
} from '$lib/paper-suggestion-marks';

/** The schema of a paper written live, the one every editor and the server use. */
export const PAPER_SCHEMA = getSchema(markdownDocumentExtensions(true));

/** The time every suggestion in these tests was made, unless a test says otherwise. */
export const SUGGESTED_AT = '2026-10-09T09:00:00.000Z';

/** One suggestion's attributes: `suggestion('b1', 'ben')` is Ben's first. */
export function suggestion(
	id: string,
	userId: string,
	at = SUGGESTED_AT
): SuggestionMarkAttributes {
	return { id, userId, at };
}

type Inline = string | JSONContent;

function textNode(content: Inline): JSONContent {
	return typeof content === 'string' ? { type: 'text', text: content } : content;
}

function marked(content: Inline, type: string, attributes: SuggestionMarkAttributes): JSONContent {
	const text = textNode(content);

	return { ...text, marks: [...(text.marks ?? []), { type, attrs: attributes }] };
}

/** Words added by `by`'s suggestion: `inserted('new', ben)`, or `inserted(bold('new'), ben)`. */
export function inserted(content: Inline, by: SuggestionMarkAttributes): JSONContent {
	return marked(content, SUGGESTED_INSERTION, by);
}

/** Words `by`'s suggestion takes out. */
export function deleted(content: Inline, by: SuggestionMarkAttributes): JSONContent {
	return marked(content, SUGGESTED_DELETION, by);
}

/** The marker of a suggested break before a paragraph, added (`inserted`) or taken out (`deleted`). */
export function breakMarker(
	kind: 'inserted' | 'deleted',
	by: SuggestionMarkAttributes
): JSONContent {
	return kind === 'inserted' ? inserted(BREAK_MARKER, by) : deleted(BREAK_MARKER, by);
}

export function bold(text: string): JSONContent {
	return { type: 'text', text, marks: [{ type: 'bold' }] };
}

/** A paragraph; plain strings in it are plain words. */
export function paragraph(...content: Inline[]): JSONContent {
	return content.length > 0
		? { type: 'paragraph', content: content.map(textNode) }
		: { type: 'paragraph' };
}

/** A paper holding `blocks`. */
export function paper(...blocks: JSONContent[]): ProseMirrorNode {
	return ProseMirrorNode.fromJSON(PAPER_SCHEMA, { type: 'doc', content: blocks });
}

/** A shared document holding `content`, as an editor leaves one that has suggestions in it. */
export function sharedDocumentHolding(content: ProseMirrorNode): Y.Doc {
	const document = new Y.Doc();
	prosemirrorJSONToYXmlFragment(
		PAPER_SCHEMA,
		content.toJSON(),
		document.getXmlFragment(LIVE_DOCUMENT_FIELD)
	);

	return document;
}

function shownText(node: ProseMirrorNode): string {
	let text = (node.text ?? '').replaceAll(BREAK_MARKER, '¶');
	const has = (name: string) => node.marks.some((mark) => mark.type.name === name);

	if (has('bold')) text = `**${text}**`;
	if (has(SUGGESTED_INSERTION)) text = `{+${text}+}`;
	if (has(SUGGESTED_DELETION)) text = `{-${text}-}`;

	return text;
}

/** The paper as one line: see the top of this file. A heading starts with "## ", a list item with "- ". */
export function shown(document: ProseMirrorNode): string {
	const lines: string[] = [];

	document.descendants((node, _position, parent) => {
		if (!node.isTextblock) return true;

		let line = node.type.name === 'heading' ? '## ' : '';
		if (parent?.type.name === 'listItem') line = '- ';
		node.forEach((child) => {
			line += shownText(child);
		});
		lines.push(line);

		return false;
	});

	return lines.join(' | ');
}
