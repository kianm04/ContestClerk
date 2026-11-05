import type { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { createMarkdownEditor, editorMarkdown } from '$lib/markdown-editor';
import LinkPopover from './LinkPopover.svelte';

let editor: Editor | null = null;

/** A real editor holding `markdown`, with its first word selected. */
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
	editor.commands.setTextSelection({ from: 1, to: 7 });
	return editor;
}

afterEach(() => {
	editor?.destroy();
	editor = null;
	document.body.innerHTML = '';
});

describe('LinkPopover', () => {
	it('links the selected words to a typed web address', async () => {
		const started = startEditor('France agrees');
		const onClose = vi.fn();
		render(LinkPopover, { props: { editor: started, onClose } });

		expect(screen.getByRole('group', { name: 'Link' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull();

		const address = screen.getByLabelText('Link address');
		await fireEvent.input(address, { target: { value: 'www.un.org' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

		expect(editorMarkdown(started)).toBe('[France](https://www.un.org) agrees');
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('refuses an address that is not http, https or mailto, and says why', async () => {
		const started = startEditor('France agrees');
		const onClose = vi.fn();
		render(LinkPopover, { props: { editor: started, onClose } });

		const address = screen.getByLabelText('Link address');
		await fireEvent.input(address, { target: { value: 'javascript:alert(1)' } });
		await fireEvent.keyDown(address, { key: 'Enter' });

		expect(editorMarkdown(started)).toBe('France agrees');
		expect(address.getAttribute('aria-invalid')).toBe('true');
		expect(screen.getByText(/Enter a web address/)).toBeTruthy();
		expect(onClose).not.toHaveBeenCalled();
	});

	it('starts from the link at the cursor and can remove it', async () => {
		const started = startEditor('[France](https://www.un.org) agrees');
		render(LinkPopover, { props: { editor: started, onClose: vi.fn() } });

		const address = screen.getByLabelText('Link address') as HTMLInputElement;
		expect(address.value).toBe('https://www.un.org');

		await fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
		expect(editorMarkdown(started)).toBe('France agrees');
	});

	it('closes on Escape without changing anything', async () => {
		const started = startEditor('France agrees');
		const onClose = vi.fn();
		render(LinkPopover, { props: { editor: started, onClose } });

		await fireEvent.keyDown(screen.getByLabelText('Link address'), { key: 'Escape' });

		expect(onClose).toHaveBeenCalledOnce();
		expect(editorMarkdown(started)).toBe('France agrees');
	});
});
