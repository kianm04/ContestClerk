import type { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { NO_FORMATTING, createMarkdownEditor, editorMarkdown } from '$lib/markdown-editor';
import MarkdownToolbar from './MarkdownToolbar.svelte';

/*
	jsdom lays nothing out, so a text range in it has no size, and it lacks the
	methods that ask for one. ProseMirror asks when it scrolls the cursor into
	view, which it does once a button has put the focus back in the editor.
	These stand-ins say "no size" instead of throwing.
*/
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let editor: Editor | null = null;

/** A real editor holding `markdown`, with the cursor inside its first word. */
function startEditor(markdown: string): Editor {
	editor = createMarkdownEditor({
		element: document.body.appendChild(document.createElement('div')),
		markdown,
		id: 'editor',
		labelledBy: 'editor-label',
		placeholder: 'Write here…',
		onChange: vi.fn(),
		onFormattingChange: vi.fn(),
		onLinkShortcut: vi.fn()
	});
	editor.commands.setTextSelection(3);
	return editor;
}

/** The toolbar's props, with nothing pressed and every callback a spy. */
function toolbarProps(started: Editor) {
	return {
		editor: started,
		controls: 'editor',
		formatting: NO_FORMATTING,
		isMarkdownShown: false,
		isLinkOpen: false,
		onLinkClick: vi.fn(),
		onLinkClose: vi.fn(),
		onMarkdownToggle: vi.fn()
	};
}

afterEach(() => {
	editor?.destroy();
	editor = null;
	document.body.innerHTML = '';
});

describe('MarkdownToolbar', () => {
	it('is one labelled toolbar for the writing area, with every tool of the mockup', () => {
		render(MarkdownToolbar, { props: toolbarProps(startEditor('France')) });

		const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
		expect(toolbar.getAttribute('aria-controls')).toBe('editor');
		expect(screen.getByRole('combobox', { name: 'Text style' })).toBeTruthy();

		for (const name of ['Bold', 'Italic', 'Underline', 'Bulleted list', 'Numbered list', 'Link']) {
			expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false');
		}
	});

	it('shows the formatting at the cursor as pressed', () => {
		const formatting = { ...NO_FORMATTING, bold: true, bulletList: true, link: true };
		render(MarkdownToolbar, { props: { ...toolbarProps(startEditor('France')), formatting } });

		expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('button', { name: 'Italic' }).getAttribute('aria-pressed')).toBe(
			'false'
		);
		expect(screen.getByRole('button', { name: 'Bulleted list' }).getAttribute('aria-pressed')).toBe(
			'true'
		);
		expect(screen.getByRole('button', { name: 'Link' }).getAttribute('aria-pressed')).toBe('true');
	});

	it('shows a heading at the cursor in the text style menu', () => {
		const formatting = { ...NO_FORMATTING, textStyle: 'heading' as const };
		render(MarkdownToolbar, { props: { ...toolbarProps(startEditor('France')), formatting } });

		const menu = screen.getByRole('combobox', { name: 'Text style' }) as HTMLSelectElement;
		expect(menu.value).toBe('heading');
	});

	it('formats the text at the cursor when a tool is pressed', async () => {
		const started = startEditor('France');
		render(MarkdownToolbar, { props: toolbarProps(started) });

		const menu = screen.getByRole('combobox', { name: 'Text style' });
		await fireEvent.change(menu, { target: { value: 'heading' } });
		expect(editorMarkdown(started)).toBe('## France');

		await fireEvent.change(menu, { target: { value: 'paragraph' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Numbered list' }));
		expect(editorMarkdown(started)).toBe('1. France');
	});

	it('hands the link and Markdown buttons up to the editor around it', async () => {
		const props = toolbarProps(startEditor('France'));
		render(MarkdownToolbar, { props });

		await fireEvent.click(screen.getByRole('button', { name: 'Link' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));

		expect(props.onLinkClick).toHaveBeenCalledOnce();
		expect(props.onMarkdownToggle).toHaveBeenCalledOnce();
	});

	it('turns the formatting tools off while the Markdown is shown', () => {
		render(MarkdownToolbar, {
			props: { ...toolbarProps(startEditor('France')), isMarkdownShown: true }
		});

		const bold = screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement;
		const markdown = screen.getByRole('button', { name: 'Markdown' });
		expect(bold.disabled).toBe(true);
		expect(markdown.getAttribute('aria-pressed')).toBe('true');
	});
});
