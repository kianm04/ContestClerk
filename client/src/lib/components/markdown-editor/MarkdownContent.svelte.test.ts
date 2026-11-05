import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import MarkdownContent from './MarkdownContent.svelte';

describe('MarkdownContent', () => {
	it('draws the HTML the server made from Markdown, in the notes typography', () => {
		const { container } = render(MarkdownContent, {
			props: { html: '<h2>Agenda</h2><ul><li>One</li></ul>' }
		});

		const content = container.firstElementChild;
		expect(content?.querySelector('h2')?.textContent).toBe('Agenda');
		expect(content?.querySelector('li')?.textContent).toBe('One');
		expect(content?.className).toContain('[&_h2]:');
	});
});
