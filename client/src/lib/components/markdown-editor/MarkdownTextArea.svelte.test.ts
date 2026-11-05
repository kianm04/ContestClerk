import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import MarkdownTextArea from './MarkdownTextArea.svelte';

const props = {
	name: 'body',
	value: 'Some **bold** words',
	labelledBy: 'body-label',
	placeholder: 'Write here…'
};

describe('MarkdownTextArea', () => {
	it('is a plain named box holding the Markdown, which is the editor without JavaScript', () => {
		render(MarkdownTextArea, { props });

		const box = screen.getByRole('textbox') as HTMLTextAreaElement;
		expect(box.tagName).toBe('TEXTAREA');
		expect(box.name).toBe('body');
		expect(box.value).toBe('Some **bold** words');
		expect(box.getAttribute('aria-labelledby')).toBe('body-label');
		expect(box.placeholder).toBe('Write here…');
		expect(box.hidden).toBe(false);
	});

	it('stays in the form while hidden, so its Markdown is still sent', () => {
		const { container } = render(MarkdownTextArea, { props: { ...props, isHidden: true } });

		const box = container.querySelector('textarea');
		expect(box?.hidden).toBe(true);
		expect(box?.name).toBe('body');
		expect(box?.value).toBe('Some **bold** words');
	});

	it('reports what is typed into it', async () => {
		const onInput = vi.fn();
		render(MarkdownTextArea, { props: { ...props, onInput } });

		const box = screen.getByRole('textbox');
		await fireEvent.input(box, { target: { value: '- one' } });

		expect(onInput).toHaveBeenCalledWith('- one');
	});
});
