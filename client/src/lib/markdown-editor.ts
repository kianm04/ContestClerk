/**
 * The Markdown editor's workings (T143), kept apart from its components so
 * they can be read and tested without Svelte.
 *
 * The editor is Tiptap, a library built on ProseMirror. ProseMirror keeps the
 * text as a tree of paragraphs, headings and lists with marks (bold, a link)
 * on stretches of text, and draws that tree into an element on the page. The
 * `Markdown` extension reads Markdown into the tree and writes it back out, so
 * MUNMeet only ever stores and sends Markdown.
 *
 * Only pages with an editor import this file, so only they download Tiptap.
 */

import { Editor, Extension, type AnyExtension } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { Marked, type marked } from 'marked';
import { MARKDOWN_CONTENT_CLASSES, RAW_HTML_AS_TEXT, isAllowedLinkAddress } from '$lib/markdown';
import { liveEditingExtensions, type LiveDocument } from '$lib/markdown-editor-live';
import { COMMITTEE_PAPER_TEXT_CLASSES, PAPER_SHEET_CLASSES } from '$lib/paper-sheet';
import { paperSuggesting } from '$lib/paper-suggesting';
import { suggestionMarkExtensions } from '$lib/paper-suggestion-marks';
import { agreedDocument } from '$lib/paper-suggestions';

/**
 * How the editor looks: a bordered form field (`box`), or the text of a paper
 * on the sheet `PaperEditor` draws around it. A position paper reads like a
 * printed paper (Trello S6HLyL5Y); a paper written in committee keeps the
 * site's own type (docs/committee-papers.md, section 6).
 */
export type EditorLook = 'box' | 'position-paper' | 'committee-paper';

/**
 * The classes of the writing area itself, which Tiptap draws the text into.
 * On a sheet the sheet's border shows the focus, so the area draws no ring.
 */
export function writingAreaClasses(look: EditorLook): string {
	if (look === 'position-paper')
		return `min-h-96 outline-hidden ${MARKDOWN_CONTENT_CLASSES} ${PAPER_SHEET_CLASSES}`;
	/*
		On a phone the screen is the sheet, so a new paper's empty text is kept
		short enough for its authors, drawn under it, to show without scrolling.
	*/
	if (look === 'committee-paper')
		return `min-h-48 sm:min-h-96 outline-hidden ${COMMITTEE_PAPER_TEXT_CLASSES}`;

	return `min-h-48 rounded-control px-3 py-2 ${MARKDOWN_CONTENT_CLASSES}`;
}

/** The toolbar's one-press formatting buttons. */
export type MarkdownCommand = 'bold' | 'italic' | 'underline' | 'bulletList' | 'orderedList';

/** The two text styles in the toolbar's menu: normal text or a heading. */
export type MarkdownTextStyle = 'paragraph' | 'heading';

/** Which formatting the text at the cursor has, so its button can show as pressed. */
export type MarkdownFormatting = Record<MarkdownCommand | 'link', boolean> & {
	textStyle: MarkdownTextStyle;
};

/** What the toolbar shows before the editor has started: nothing pressed. */
export const NO_FORMATTING: MarkdownFormatting = {
	bold: false,
	italic: false,
	underline: false,
	bulletList: false,
	orderedList: false,
	link: false,
	textStyle: 'paragraph'
};

/** The heading level the toolbar's "Heading" makes: `## ` in Markdown. */
const TOOLBAR_HEADING_LEVEL = 2;

/** Which formatting the text at the editor's cursor has. */
export function activeFormatting(editor: Editor): MarkdownFormatting {
	return {
		bold: editor.isActive('bold'),
		italic: editor.isActive('italic'),
		underline: editor.isActive('underline'),
		bulletList: editor.isActive('bulletList'),
		orderedList: editor.isActive('orderedList'),
		link: editor.isActive('link'),
		textStyle: editor.isActive('heading') ? 'heading' : 'paragraph'
	};
}

/**
 * Put the cursor back in the editor, where it was, straight away. Pressing a
 * toolbar button or the link box took it out. Tiptap's own `focus()` command
 * waits for the browser's next frame, so keys typed straight after a click
 * would land nowhere; ProseMirror's `view.focus()` moves it now.
 */
export function focusMarkdownEditor(editor: Editor): void {
	editor.view.focus();
}

/** Bold, italic, underline or a list, switched on or off for the selected text. */
export function applyMarkdownCommand(editor: Editor, command: MarkdownCommand): void {
	focusMarkdownEditor(editor);
	const chain = editor.chain();

	if (command === 'bold') chain.toggleBold().run();
	if (command === 'italic') chain.toggleItalic().run();
	if (command === 'underline') chain.toggleUnderline().run();
	if (command === 'bulletList') chain.toggleBulletList().run();
	if (command === 'orderedList') chain.toggleOrderedList().run();
}

/** Make the line the cursor is in normal text or a heading. */
export function applyMarkdownTextStyle(editor: Editor, style: MarkdownTextStyle): void {
	focusMarkdownEditor(editor);
	const chain = editor.chain();

	if (style === 'heading') chain.setHeading({ level: TOOLBAR_HEADING_LEVEL }).run();
	else chain.setParagraph().run();
}

/** The address of the link the cursor is in, or an empty string outside a link. */
export function currentLinkAddress(editor: Editor): string {
	const address: unknown = editor.getAttributes('link').href;

	return typeof address === 'string' ? address : '';
}

/**
 * Make the selected text, or the whole link the cursor is in, a link to
 * `address`. With nothing selected, the address itself is written as the link.
 */
export function setMarkdownLink(editor: Editor, address: string): void {
	focusMarkdownEditor(editor);
	const hasSelection = !editor.state.selection.empty;

	if (hasSelection || editor.isActive('link')) {
		editor.chain().extendMarkRange('link').setLink({ href: address }).run();
		return;
	}

	const linkedAddress = {
		type: 'text',
		text: address,
		marks: [{ type: 'link', attrs: { href: address } }]
	};
	editor.chain().insertContent(linkedAddress).run();
}

/** Turn the link the cursor is in back into plain text. */
export function removeMarkdownLink(editor: Editor): void {
	focusMarkdownEditor(editor);
	editor.chain().extendMarkRange('link').unsetLink().run();
}

/**
 * The editor's text as Markdown, without the blank lines Tiptap leaves at the
 * end. In a paper with suggestions it is the agreed text, without them: they
 * only become the paper's once another author accepts them.
 */
export function editorMarkdown(editor: Editor): string {
	const agreed = agreedDocument(editor.state.doc);
	const markdown = editor.markdown?.serialize(agreed.toJSON()) ?? editor.getMarkdown();

	return markdown.replace(/\s+$/, '');
}

/**
 * Pasted text arrives formatted when it is Markdown. Text copied from a web
 * page or a word processor also carries HTML, which ProseMirror already turns
 * into formatting, so only a paste with plain text alone is read as Markdown.
 */
function pasteMarkdown(): AnyExtension {
	return Extension.create({
		name: 'pasteMarkdown',
		addProseMirrorPlugins() {
			const editor = this.editor;

			const plugin = new Plugin({
				props: {
					handlePaste(_view, event) {
						const clipboard = event.clipboardData;
						const text = clipboard?.getData('text/plain') ?? '';
						const hasHtml = (clipboard?.getData('text/html') ?? '') !== '';

						if (text === '' || hasHtml || !editor.markdown) return false;
						if (editor.isActive('codeBlock')) return false;

						editor.commands.insertContent(editor.markdown.parse(text));
						return true;
					}
				}
			});

			return [plugin];
		}
	});
}

/**
 * Copy the text selected on the page into the editor's own selection. Keys
 * such as Shift+Home move the page's selection, and ProseMirror only hears of
 * that a moment later. Ctrl+K pressed straight after would open the link box,
 * which takes the focus, before then, and the link would lose its text.
 */
function readPageSelection(editor: Editor): void {
	const pageSelection = document.getSelection();
	const { anchorNode, focusNode } = pageSelection ?? {};

	if (!pageSelection || !anchorNode || !focusNode) return;
	if (!editor.view.dom.contains(anchorNode) || !editor.view.dom.contains(focusNode)) return;

	const from = editor.view.posAtDOM(anchorNode, pageSelection.anchorOffset);
	const to = editor.view.posAtDOM(focusNode, pageSelection.focusOffset);
	editor.commands.setTextSelection({ from, to });
}

/** Ctrl+K or Cmd+K asks for a link, as it does in most editors. */
function linkShortcut(onLinkShortcut: () => void): AnyExtension {
	return Extension.create({
		name: 'linkShortcut',
		addKeyboardShortcuts() {
			return {
				'Mod-k': () => {
					readPageSelection(this.editor);
					onLinkShortcut();
					return true;
				}
			};
		}
	});
}

/** What `createMarkdownEditor` needs to know. */
export type MarkdownEditorSetup = {
	/** The element the editor draws its writing area into. */
	element: HTMLElement;
	/** The Markdown it starts with. */
	markdown: string;
	/** The id the writing area gets, which the toolbar points at. */
	id: string;
	/** The id of the element that names the writing area. */
	labelledBy: string;
	/** What an empty writing area says, read out by a screen reader. */
	placeholder: string;
	/** Called with the Markdown after every change. */
	onChange: (markdown: string) => void;
	/** Called whenever the cursor moves or the text changes. */
	onFormattingChange: (formatting: MarkdownFormatting) => void;
	/** Called when Ctrl+K or Cmd+K is pressed in the writing area. */
	onLinkShortcut: () => void;
	/** A form field by default, or the text of a position paper or a committee's paper. */
	look?: EditorLook;
	/**
	 * The shared document the text lives in while several people write it at
	 * once (T148). The editor then starts from that document, not `markdown`.
	 */
	live?: LiveDocument;
	/**
	 * Extensions for this editor alone, added after all the others, such as
	 * the comments a live paper shows beside its words (`paper-threads.ts`).
	 */
	extensions?: AnyExtension[];
};

/**
 * The extensions that decide what a document may hold and how it is read from
 * and written to Markdown. StarterKit brings paragraphs, headings, bold,
 * italic, underline, both lists and links, with their keyboard shortcuts
 * (Ctrl or Cmd with B, I and U) and the Markdown that formats itself as it is
 * typed (`**bold**`, `# `, `- `, `1. `).
 *
 * `paper-document.ts` reads and writes a live paper with these same
 * extensions on the server (T148), so both sides agree on what the text is.
 * A live editor passes `hasSharedHistory`: undo then comes from the shared
 * document, which only undoes the writer's own typing, instead of StarterKit's.
 * Only papers are written live, so a shared document also holds the marks of
 * the suggestions its authors make (docs/committee-papers.md, section 7).
 */
export function markdownDocumentExtensions(hasSharedHistory = false): AnyExtension[] {
	const starterKit = StarterKit.configure({
		link: {
			// A click puts the cursor in the link to edit it rather than leaving the page.
			openOnClick: false,
			// `[text](https://…)` typed or pasted becomes a link.
			markdownLinks: true,
			defaultProtocol: 'https',
			isAllowedUri: (address: string) => isAllowedLinkAddress(address),
			HTMLAttributes: { rel: 'noopener noreferrer', target: null }
		},
		undoRedo: hasSharedHistory ? false : undefined
	});

	/*
		Raw HTML typed as Markdown stays text, as it does when the server shows it.
		Tiptap's type asks for the whole `marked` module, but it only calls the
		methods a `Marked` reader of its own also has (`use`, `lexer`, `Lexer`,
		`setOptions`, `defaults`), so a private reader stands in for it.
	*/
	const markdownReader = new Marked(RAW_HTML_AS_TEXT) as unknown as typeof marked;
	const markdown = Markdown.configure({ marked: markdownReader });

	return [starterKit, markdown, ...(hasSharedHistory ? suggestionMarkExtensions() : [])];
}

/** Suggesting for the person at a live editor, whose new suggestions get fresh ids. */
function suggesting(live: LiveDocument): AnyExtension {
	const author = {
		userId: live.writer.id,
		newId: () => crypto.randomUUID(),
		now: () => new Date().toISOString()
	};

	return paperSuggesting.configure({ author });
}

/** Start an editor in `setup.element`, holding `setup.markdown` or the live document. */
export function createMarkdownEditor(setup: MarkdownEditorSetup): Editor {
	const live = setup.live;
	const documentExtensions = markdownDocumentExtensions(live !== undefined);
	const typingExtensions = [pasteMarkdown(), linkShortcut(setup.onLinkShortcut)];
	const liveExtensions = live ? [...liveEditingExtensions(live), suggesting(live)] : [];
	const pageExtensions = setup.extensions ?? [];

	return new Editor({
		element: setup.element,
		extensions: [...documentExtensions, ...typingExtensions, ...liveExtensions, ...pageExtensions],
		// A live editor's text comes from the shared document, so it is given none here.
		content: live ? undefined : setup.markdown,
		contentType: 'markdown',
		editorProps: {
			// The writing area is not a form field, so these tell a screen reader what it is.
			attributes: {
				id: setup.id,
				role: 'textbox',
				'aria-multiline': 'true',
				'aria-labelledby': setup.labelledBy,
				'aria-placeholder': setup.placeholder,
				class: writingAreaClasses(setup.look ?? 'box')
			}
		},
		onUpdate: ({ editor }) => setup.onChange(editorMarkdown(editor)),
		onTransaction: ({ editor }) => setup.onFormattingChange(activeFormatting(editor))
	});
}
