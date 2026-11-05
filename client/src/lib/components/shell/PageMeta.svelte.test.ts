import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import PageMeta from './PageMeta.svelte';

/** Read one `<meta>` tag out of the document's head. */
function metaContent(selector: string): string | null {
	return document.head.querySelector(selector)?.getAttribute('content') ?? null;
}

describe('PageMeta', () => {
	it('ends every page title with the product name', () => {
		render(PageMeta, { props: { title: 'Conferences', description: 'Find a conference.' } });

		expect(document.title).toBe('Conferences · MUNMeet');
	});

	it('writes the description for search results and for shared links', () => {
		render(PageMeta, { props: { title: 'Conferences', description: 'Find a conference.' } });

		expect(metaContent('meta[name="description"]')).toBe('Find a conference.');
		expect(metaContent('meta[property="og:title"]')).toBe('Conferences');
		expect(metaContent('meta[property="og:description"]')).toBe('Find a conference.');
	});

	it('names the shared picture when the page has one', () => {
		render(PageMeta, {
			props: {
				title: 'THIMUN',
				description: 'The Hague, January 2027.',
				imageUrl: 'https://example.test/banner.jpg'
			}
		});

		expect(metaContent('meta[property="og:image"]')).toBe('https://example.test/banner.jpg');
	});

	it('leaves the shared picture out when the page has none', () => {
		render(PageMeta, { props: { title: 'Conferences', description: 'Find a conference.' } });

		expect(metaContent('meta[property="og:image"]')).toBeNull();
	});
});
