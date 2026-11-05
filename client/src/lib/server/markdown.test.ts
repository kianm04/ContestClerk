import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
	it('draws every mark the editor writes', () => {
		expect(renderMarkdown('**bold**')).toBe('<p><strong>bold</strong></p>\n');
		expect(renderMarkdown('*italic*')).toBe('<p><em>italic</em></p>\n');
		expect(renderMarkdown('_italic_')).toBe('<p><em>italic</em></p>\n');
		expect(renderMarkdown('++underlined++')).toBe('<p><u>underlined</u></p>\n');
		expect(renderMarkdown('## Heading')).toBe('<h2>Heading</h2>\n');
	});

	it('draws both kinds of list', () => {
		expect(renderMarkdown('- one\n- two')).toBe('<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n');
		expect(renderMarkdown('3. three\n4. four')).toBe(
			'<ol start="3">\n<li>three</li>\n<li>four</li>\n</ol>\n'
		);
	});

	it('opens a web link in a new tab that is told nothing about the page', () => {
		expect(renderMarkdown('[UN](https://www.un.org)')).toBe(
			'<p><a href="https://www.un.org" target="_blank" rel="noopener noreferrer">UN</a></p>\n'
		);
	});

	it('keeps a mail link', () => {
		expect(renderMarkdown('[Write](mailto:chair@example.org)')).toContain(
			'href="mailto:chair@example.org"'
		);
	});

	it('shows a script tag as text, never as a script', () => {
		const html = renderMarkdown('<script>alert(1)</script>');

		expect(html).not.toContain('<script');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
	});

	it('shows raw HTML inside a line as the characters typed', () => {
		const html = renderMarkdown('Hello <b onclick="steal()">there</b>');

		expect(html).toBe('<p>Hello &lt;b onclick="steal()"&gt;there&lt;/b&gt;</p>\n');
	});

	it('shows an image with an onerror handler as text', () => {
		const html = renderMarkdown('<img src=x onerror="alert(1)">');

		expect(html).not.toContain('<img');
		expect(html).toContain('&lt;img src=x onerror=');
	});

	it('draws no Markdown image, only its description', () => {
		const html = renderMarkdown('![A flag](https://example.org/flag.png)');

		expect(html).toBe('<p>A flag</p>\n');
	});

	it('keeps the words of a javascript: link and drops the link', () => {
		const html = renderMarkdown('[click me](javascript:alert(1))');

		expect(html).not.toContain('<a');
		expect(html).not.toContain('javascript:');
		expect(html).toContain('click me');
	});

	it('drops a data: link and an address with no scheme', () => {
		expect(renderMarkdown('[x](data:text/html,hi)')).toBe('<p>x</p>\n');
		expect(renderMarkdown('[x](/conferences)')).toBe('<p>x</p>\n');
	});

	it('does not let a quote in a link address break out of the attribute', () => {
		const html = renderMarkdown('[x](https://example.org/"onmouseover="alert(1))');

		expect(html).not.toContain('onmouseover="');
	});

	it('shows the entities the editor writes for < and & as those characters', () => {
		expect(renderMarkdown('x &lt; y &amp; z')).toBe('<p>x &lt; y &amp; z</p>\n');
	});

	it('gives back nothing for empty text', () => {
		expect(renderMarkdown('')).toBe('');
	});

	// What T144's migration wrote for old Chair Notes, as in tests/db/committee-session-notes.test.ts.
	it('shows the Markdown converted from the old Chair Notes HTML formatted again', () => {
		const converted = [
			'### Opening',
			'',
			'Ghana **yields** to *France* & ++Chile++, not a\\*b',
			'',
			'1. first',
			'1. second',
			'',
			'line\\',
			'next',
			'',
			"[UN site](<https://www.un.org/en/>) 1 \\< 2  it's"
		].join('\n');

		const html = renderMarkdown(converted);

		expect(html).toContain('<h3>Opening</h3>');
		expect(html).toContain(
			'<strong>yields</strong> to <em>France</em> &amp; <u>Chile</u>, not a*b'
		);
		expect(html).toContain('<ol>\n<li>first</li>\n<li>second</li>\n</ol>');
		expect(html).toContain('<p>line<br />next</p>');
		expect(html).toContain('<a href="https://www.un.org/en/"');
		expect(html).toContain('1 &lt; 2');
	});
});
