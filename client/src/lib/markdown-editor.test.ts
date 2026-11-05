// @vitest-environment jsdom
// The editor draws into a page, so this file runs in jsdom's pretend browser
// rather than in plain Node like the other tests beside it.

import { Extension, type Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	activeFormatting,
	applyMarkdownCommand,
	applyMarkdownTextStyle,
	createMarkdownEditor,
	currentLinkAddress,
	editorMarkdown,
	focusMarkdownEditor,
	markdownDocumentExtensions,
	removeMarkdownLink,
	setMarkdownLink,
	writingAreaClasses
} from './markdown-editor';
import { SUGGESTED_DELETION, SUGGESTED_INSERTION } from './paper-suggestion-marks';

/*
	jsdom lays nothing out, so a text range in it has no size, and it lacks the
	methods that ask for one. ProseMirror asks when it scrolls the cursor into
	view, which it does once the editor has the focus. These stand-ins say
	"no size" instead of throwing.
*/
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let editor: Editor | null = null;

/** A fresh editor holding `markdown`, with every callback a spy. */
function startEditor(markdown: string) {
	const onChange = vi.fn();
	const onLinkShortcut = vi.fn();

	editor = createMarkdownEditor({
		element: document.body.appendChild(document.createElement('div')),
		markdown,
		id: 'editor',
		labelledBy: 'editor-label',
		placeholder: 'Write here…',
		onChange,
		onFormattingChange: vi.fn(),
		onLinkShortcut
	});

	return { editor, onChange, onLinkShortcut };
}

afterEach(() => {
	editor?.destroy();
	editor = null;
	document.body.innerHTML = '';
});

describe('the Markdown round trip', () => {
	// What the editor writes for each supported mark. Each one read in and
	// written back out must come back exactly as it went in.
	const SUPPORTED = [
		['bold', 'Some **bold** words'],
		['italic', 'Some *italic* words'],
		['underline', 'Some ++underlined++ words'],
		['heading', '## A heading'],
		['bulleted list', '- one\n- two'],
		['numbered list', '1. one\n2. two'],
		['link', 'See [the UN](https://www.un.org) today'],
		['mail link', '[Write to us](mailto:chair@example.org)'],
		['paragraphs', 'First paragraph\n\nSecond paragraph'],
		['everything at once', '# Notes\n\n**France** said *no* to ++this++.\n\n- a\n- b']
	];

	it.each(SUPPORTED)('keeps %s unchanged', (_name, markdown) => {
		const { editor } = startEditor(markdown);

		expect(editorMarkdown(editor)).toBe(markdown);
	});

	it('reads underscores as italic', () => {
		const { editor } = startEditor('_italic_');

		expect(editor.getHTML()).toBe('<p><em>italic</em></p>');
	});

	it('shows raw HTML as the characters typed, as the server does', () => {
		const { editor } = startEditor('Hi <b>there</b> <script>alert(1)</script>');

		expect(editor.getHTML()).not.toContain('<script');
		expect(editor.getHTML()).not.toContain('<strong>');
		expect(editor.getText()).toBe('Hi <b>there</b> <script>alert(1)</script>');
	});

	it('writes < and > as HTML entities, which read back as the characters', () => {
		const { editor } = startEditor('x < y');

		expect(editorMarkdown(editor)).toBe('x &lt; y');
		editor.commands.setContent(editorMarkdown(editor), { contentType: 'markdown' });
		expect(editor.getText()).toBe('x < y');
	});

	it('drops a javascript: link but keeps its words', () => {
		const { editor } = startEditor('[click](javascript:alert(1))');

		expect(editor.getHTML()).not.toContain('javascript:');
		expect(editor.getText()).toContain('click');
	});
});

describe('formatting from the toolbar', () => {
	it('puts the cursor back in the writing area at once, not a frame later', () => {
		const { editor } = startEditor('text');
		const button = document.body.appendChild(document.createElement('button'));
		button.focus();

		focusMarkdownEditor(editor);

		expect(document.activeElement).toBe(editor.view.dom);
	});

	it('makes the selected text bold and reports it as pressed', () => {
		const { editor, onChange } = startEditor('Hello');
		editor.commands.selectAll();

		applyMarkdownCommand(editor, 'bold');

		expect(editorMarkdown(editor)).toBe('**Hello**');
		expect(onChange).toHaveBeenLastCalledWith('**Hello**');
		expect(activeFormatting(editor).bold).toBe(true);
		expect(activeFormatting(editor).italic).toBe(false);
	});

	it('writes each command as its Markdown', () => {
		const COMMANDS = [
			['italic', '*Hello*'],
			['underline', '++Hello++'],
			['bulletList', '- Hello'],
			['orderedList', '1. Hello']
		] as const;

		for (const [command, expected] of COMMANDS) {
			const { editor } = startEditor('Hello');
			editor.commands.selectAll();

			applyMarkdownCommand(editor, command);
			// The toolbar shows what the text at the cursor has, so put it inside the word.
			editor.commands.setTextSelection(3);

			expect(editorMarkdown(editor)).toBe(expected);
			expect(activeFormatting(editor)[command]).toBe(true);
			editor.destroy();
		}
	});

	it('turns a line into a heading and back', () => {
		const { editor } = startEditor('Hello');

		applyMarkdownTextStyle(editor, 'heading');
		expect(editorMarkdown(editor)).toBe('## Hello');
		expect(activeFormatting(editor).textStyle).toBe('heading');

		applyMarkdownTextStyle(editor, 'paragraph');
		expect(editorMarkdown(editor)).toBe('Hello');
	});
});

describe('links', () => {
	it('links the selected text, reads the address back and removes it', () => {
		const { editor } = startEditor('the UN');
		editor.commands.selectAll();

		setMarkdownLink(editor, 'https://www.un.org');

		expect(editorMarkdown(editor)).toBe('[the UN](https://www.un.org)');
		expect(currentLinkAddress(editor)).toBe('https://www.un.org');

		removeMarkdownLink(editor);
		expect(editorMarkdown(editor)).toBe('the UN');
	});

	it('writes the address as the link when nothing is selected', () => {
		const { editor } = startEditor('');

		setMarkdownLink(editor, 'https://www.un.org');

		expect(editorMarkdown(editor)).toBe('[https://www.un.org](https://www.un.org)');
	});

	it('refuses a javascript: address', () => {
		const { editor } = startEditor('text');
		editor.commands.selectAll();

		setMarkdownLink(editor, 'javascript:alert(1)');

		expect(editorMarkdown(editor)).toBe('text');
	});

	it('Ctrl+K takes the text selected on the page even before the editor has noticed it', () => {
		const { editor, onLinkShortcut } = startEditor('the UN');
		focusMarkdownEditor(editor);
		const text = editor.view.dom.querySelector('p')?.firstChild;
		if (!text) throw new Error('the paragraph has no text');

		// Shift+Home selects by moving the page's selection; ProseMirror hears of it a moment later.
		document.getSelection()?.setBaseAndExtent(text, 6, text, 0);
		const ctrlK = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
		editor.view.dom.dispatchEvent(ctrlK);

		expect(onLinkShortcut).toHaveBeenCalledOnce();
		expect(editor.state.selection.from).toBe(1);
		expect(editor.state.selection.to).toBe(7);
	});
});

/**
 * A paste of `text`, and of `html` when the copied thing had formatting of its
 * own. jsdom has no `ClipboardEvent`, so this plain event carries the clipboard.
 */
function pasteEvent(text: string, html = ''): ClipboardEvent {
	const event = new Event('paste') as ClipboardEvent;
	const clipboardData = { getData: (type: string) => (type === 'text/plain' ? text : html) };
	Object.defineProperty(event, 'clipboardData', { value: clipboardData });

	return event;
}

/** Pastes plain `text` into the editor through ProseMirror's own paste handling. */
function pastePlainText(editor: Editor, text: string) {
	editor.view.pasteText(text, pasteEvent(text));
}

describe('pasting', () => {
	it('formats pasted Markdown as it arrives', () => {
		const { editor } = startEditor('');

		pastePlainText(editor, '## Agenda\n\n- **Roll call**\n- [Charter](https://www.un.org)');

		expect(editor.getHTML()).toContain('<h2>Agenda</h2>');
		expect(editor.getHTML()).toContain('<strong>Roll call</strong>');
		expect(editorMarkdown(editor)).toBe(
			'## Agenda\n\n- **Roll call**\n- [Charter](https://www.un.org)'
		);
	});

	it('keeps pasted raw HTML as the characters pasted', () => {
		const { editor } = startEditor('');

		pastePlainText(editor, '<img src=x onerror="alert(1)">');

		expect(editor.getText()).toBe('<img src=x onerror="alert(1)">');
		expect(editor.getHTML()).not.toContain('<img');
	});
});

describe('markdownDocumentExtensions', () => {
	it("keeps the editor's own undo unless the document's history is shared (T148)", () => {
		const [ownHistory] = markdownDocumentExtensions();
		const [sharedHistory] = markdownDocumentExtensions(true);

		// A live paper's undo comes from the shared document, so one person's
		// undo takes back only their own typing, never somebody else's.
		expect(ownHistory.options.undoRedo).not.toBe(false);
		expect(sharedHistory.options.undoRedo).toBe(false);
	});

	it('holds the marks of suggestions only in a shared document (docs/committee-papers.md, section 7)', () => {
		const shared = markdownDocumentExtensions(true).map((extension) => extension.name);
		const own = markdownDocumentExtensions().map((extension) => extension.name);

		expect(shared).toEqual(expect.arrayContaining([SUGGESTED_INSERTION, SUGGESTED_DELETION]));
		expect(own).not.toContain(SUGGESTED_INSERTION);
		expect(own).not.toContain(SUGGESTED_DELETION);
	});
});

describe('createMarkdownEditor', () => {
	it('adds the extensions a page brings for its editor alone, such as the comments on a paper', () => {
		const pageOwn = Extension.create({ name: 'pageOwn' });

		editor = createMarkdownEditor({
			element: document.body.appendChild(document.createElement('div')),
			markdown: 'Hello',
			id: 'editor',
			labelledBy: 'editor-label',
			placeholder: '',
			onChange: vi.fn(),
			onFormattingChange: vi.fn(),
			onLinkShortcut: vi.fn(),
			extensions: [pageOwn]
		});

		const names = editor.extensionManager.extensions.map((extension) => extension.name);
		expect(names).toContain('pageOwn');
	});
});

describe("the editor's look (Trello S6HLyL5Y)", () => {
	it('is a form field with room around the text by default', () => {
		expect(writingAreaClasses('box')).toContain('px-3');
		expect(writingAreaClasses('box')).not.toContain('[&_p]:text-justify');
	});

	it('sets a position paper in its printed typeface, justified', () => {
		expect(writingAreaClasses('position-paper')).toContain('font-display');
		expect(writingAreaClasses('position-paper')).toContain('[&_p]:text-justify');
	});

	it("keeps a committee's paper in the site's own type, ragged right (docs/committee-papers.md)", () => {
		const classes = writingAreaClasses('committee-paper');

		expect(classes).toContain('text-body');
		expect(classes).not.toContain('[&_p]:text-justify');
		expect(classes).not.toContain('px-3');
	});

	it("keeps a committee's new paper short on a phone, so the authors under it show", () => {
		const classes = writingAreaClasses('committee-paper').split(' ');

		expect(classes).toContain('min-h-48');
		expect(classes).toContain('sm:min-h-96');
	});

	it('draws no focus ring of its own on a sheet, whose border shows the focus instead', () => {
		expect(writingAreaClasses('position-paper')).toContain('outline-hidden');
		expect(writingAreaClasses('committee-paper')).toContain('outline-hidden');
		expect(writingAreaClasses('box')).not.toContain('outline-hidden');
	});

	it('gives the writing area the look the editor is started with', () => {
		const element = document.createElement('div');
		editor = createMarkdownEditor({
			element,
			markdown: 'Hello',
			id: 'sheet-editor',
			labelledBy: 'heading',
			placeholder: '',
			onChange: vi.fn(),
			onFormattingChange: vi.fn(),
			onLinkShortcut: vi.fn(),
			look: 'position-paper'
		});

		expect(element.querySelector('.ProseMirror')?.className).toContain('font-display');
	});
});
