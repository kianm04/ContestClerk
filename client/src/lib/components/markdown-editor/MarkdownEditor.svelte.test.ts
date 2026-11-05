import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import MarkdownEditor from './MarkdownEditor.svelte';

const props = { name: 'body', initialMarkdown: 'Some **bold** words', labelledBy: 'body-label' };

describe('MarkdownEditor', () => {
	it('shows the Markdown formatted in a labelled writing area', async () => {
		render(MarkdownEditor, { props });
		await tick();

		const writingArea = document.querySelector('[role="textbox"][contenteditable="true"]');
		expect(writingArea?.getAttribute('aria-labelledby')).toBe('body-label');
		expect(writingArea?.getAttribute('aria-multiline')).toBe('true');
		expect(writingArea?.querySelector('strong')?.textContent).toBe('bold');
		expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeTruthy();
	});

	it('keeps the named Markdown box in the form, hidden behind the formatted text', async () => {
		const { container } = render(MarkdownEditor, { props });
		await tick();

		const box = container.querySelector('textarea');
		expect(box?.name).toBe('body');
		expect(box?.value).toBe('Some **bold** words');
		expect(box?.hidden).toBe(true);
	});

	it('switches to the Markdown and back without losing what was typed there', async () => {
		const onChange = vi.fn();
		const { container } = render(MarkdownEditor, { props: { ...props, onChange } });
		await tick();

		await fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));
		const box = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(box.hidden).toBe(false);

		await fireEvent.input(box, { target: { value: 'Some _new_ words' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Markdown' }));

		const writingArea = document.querySelector('[role="textbox"][contenteditable="true"]');
		expect(onChange).toHaveBeenCalledWith('Some _new_ words');
		expect(writingArea?.querySelector('em')?.textContent).toBe('new');
		expect(box.hidden).toBe(true);
	});

	it('leaves the heading menu out of a compact toolbar', async () => {
		render(MarkdownEditor, { props: { ...props, isCompact: true } });
		await tick();

		expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy();
		expect(screen.queryByRole('combobox', { name: 'Text style' })).toBeNull();
	});

	it('puts the cursor in the writing area when asked to', async () => {
		render(MarkdownEditor, { props: { ...props, hasAutofocus: true } });
		await tick();

		const writingArea = document.querySelector('[role="textbox"][contenteditable="true"]');
		expect(document.activeElement).toBe(writingArea);
	});
});
