import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ParagraphText from './ParagraphText.svelte';

describe('ParagraphText', () => {
	it('makes a paragraph of each block separated by a blank line', () => {
		const { container } = render(ParagraphText, {
			props: { text: 'First paragraph.\n\nSecond paragraph.' }
		});

		const paragraphs = container.querySelectorAll('p');

		expect(paragraphs).toHaveLength(2);
		expect(paragraphs[0].textContent).toBe('First paragraph.');
		expect(paragraphs[1].textContent).toBe('Second paragraph.');
	});

	it('keeps a single line break inside one paragraph', () => {
		const { container } = render(ParagraphText, { props: { text: 'One line\nand another' } });

		expect(container.querySelectorAll('p')).toHaveLength(1);
		expect(container.querySelector('p')?.textContent).toBe('One line\nand another');
	});

	it('shows nothing for text that is only blank lines', () => {
		const { container } = render(ParagraphText, { props: { text: '\n\n  \n' } });

		expect(container.querySelectorAll('p')).toHaveLength(0);
	});

	it('puts tags on the screen as text rather than running them', () => {
		render(ParagraphText, { props: { text: 'Bring <script>alert(1)</script> a passport.' } });

		expect(screen.getByText('Bring <script>alert(1)</script> a passport.')).toBeTruthy();
	});
});
