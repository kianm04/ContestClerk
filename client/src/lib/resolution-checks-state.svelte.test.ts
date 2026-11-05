// @vitest-environment jsdom
// The editor draws into a page, so this file runs in jsdom's pretend browser
// rather than in plain Node.

import type { Editor } from '@tiptap/core';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarkdownEditor } from './markdown-editor';
import {
	createPaperChecks,
	createResolutionChecks,
	warningsOf
} from './resolution-checks-state.svelte';

// See `markdown-editor.test.ts`: jsdom lays nothing out, and ProseMirror asks.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const RESOLUTION = 'Recalling its resolution 78/241,\n\n1. Calls upon all States;\n2. Decides';

let editor: Editor | null = null;
let stopRoot: (() => void) | null = null;

/** The place just after the words, where an author would carry on typing. */
function placeAfter(started: Editor, words: string): number {
	let place = -1;
	started.state.doc.descendants((node, position) => {
		const index = node.isText ? (node.text ?? '').indexOf(words) : -1;
		if (index !== -1) place = position + index + words.length;
	});
	return place;
}

afterEach(() => {
	stopRoot?.();
	editor?.destroy();
	editor = null;
	document.body.innerHTML = '';
});

describe('warningsOf', () => {
	it('checks a draft resolution in its two parts, and a directive as one', () => {
		expect(warningsOf({ kind: 'draft_resolution', isOn: true }, RESOLUTION)).toEqual([
			{ clauseName: 'clause 2', sentence: 'The last clause should end with a full stop.' }
		]);
		expect(
			warningsOf({ kind: 'committee_directive', isOn: true }, '1. Calls upon all States')
		).toEqual([
			{ clauseName: 'clause 1', sentence: 'The last clause should end with a full stop.' }
		]);
	});

	it('finds nothing for a committee that does not check the format', () => {
		expect(warningsOf({ kind: 'draft_resolution', isOn: false }, RESOLUTION)).toEqual([]);
	});
});

describe('createResolutionChecks', () => {
	it('follows the editor, underlines what it warns about and goes to it', async () => {
		// `$effect.root` gives the checks' `$effect` somewhere to live outside a component.
		let checks: ReturnType<typeof createResolutionChecks> | undefined;
		stopRoot = $effect.root(() => {
			checks = createResolutionChecks({
				kind: 'draft_resolution',
				isOn: true,
				initialMarkdown: RESOLUTION
			});
		});
		if (!checks) throw new Error('The checks were not made.');

		const started = createMarkdownEditor({
			element: document.body.appendChild(document.createElement('div')),
			markdown: RESOLUTION,
			id: 'editor',
			labelledBy: 'editor-label',
			placeholder: 'Write here…',
			onChange: vi.fn(),
			onFormattingChange: vi.fn(),
			onLinkShortcut: vi.fn(),
			extensions: checks.extensions
		});
		editor = started;
		checks.attach(started);

		started.commands.insertContentAt(placeAfter(started, 'Decides'), '.');
		flushSync();
		expect(checks.warnings).toEqual([]);

		started.commands.insertContentAt(placeAfter(started, 'Decides.'), ' and');
		flushSync();
		await Promise.resolve();
		expect(checks.warnings.map((warning) => warning.clauseName)).toEqual(['clause 2']);
		expect(started.view.dom.querySelector('.decoration-dotted')?.textContent).toBe('and');

		checks.focus('clause 1');
		const cursor = started.state.selection.from;
		expect(started.state.doc.textBetween(cursor - 7, cursor)).toBe('States;');
	});
});

describe('createPaperChecks', () => {
	it('has checks for the kinds with clauses and none for a working paper', () => {
		stopRoot = $effect.root(() => {
			const setup = { isOn: true, initialMarkdown: RESOLUTION };

			expect(createPaperChecks({ ...setup, kind: 'working_paper' })).toBeNull();
			expect(createPaperChecks({ ...setup, kind: 'draft_resolution' })?.warnings).toEqual(
				warningsOf({ kind: 'draft_resolution', isOn: true }, RESOLUTION)
			);
		});
	});
});
