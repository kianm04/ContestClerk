/**
 * Turning Markdown into HTML that is safe to draw (T143).
 *
 * Files under `$lib/server` only ever run on the server. Markdown is written by
 * people, and Markdown may hold raw HTML, which could carry a script, an
 * `onerror` or a `javascript:` link. Every page that shows somebody's Markdown
 * draws it through `renderMarkdown`, so `MarkdownContent` only ever draws what
 * this file allows:
 *
 * - raw HTML in the text is shown as the characters that were typed, never run;
 * - a link goes only to a web or mail address and tells the site nothing;
 * - there are no images: an image's description is shown as text instead.
 *
 * `marked` reads the Markdown (the same library the editor uses to read it),
 * and `sanitize-html` then checks the result once more, so a mistake in the
 * rules below still cannot let anything else through.
 */

import { Marked, type Tokens, type TokenizerAndRendererExtension } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { RAW_HTML_AS_TEXT, isAllowedLinkAddress } from '$lib/markdown';

/** The characters that mean something in HTML, and how to write them as text. */
const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/** `text` with every character that means something in HTML written as text. */
function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

/**
 * `++underlined++`, MUNMeet's way of writing underline, which Markdown lacks.
 * The pattern is the one the editor's underline extension reads, so the
 * editor and this renderer agree on what is underlined.
 */
const UNDERLINE: TokenizerAndRendererExtension = {
	name: 'underline',
	level: 'inline',
	start(source: string) {
		return source.indexOf('++');
	},
	tokenizer(source: string) {
		const match = /^\+\+([\s\S]+?)\+\+/.exec(source);
		if (!match) return undefined;

		const inner = match[1].trim();

		return { type: 'underline', raw: match[0], tokens: this.lexer.inlineTokens(inner) };
	},
	renderer(token) {
		return `<u>${this.parser.parseInline(token.tokens ?? [])}</u>`;
	}
};

// `RAW_HTML_AS_TEXT` makes `<script>` or `<img onerror=…>` ordinary text, as in the editor.
const markdownReader = new Marked(RAW_HTML_AS_TEXT, {
	extensions: [UNDERLINE],
	renderer: {
		// A link to anything but a web or mail address keeps its words and loses its address.
		link({ href, tokens }: Tokens.Link) {
			const words = this.parser.parseInline(tokens);
			if (!isAllowedLinkAddress(href)) return words;

			return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${words}</a>`;
		},
		// No images: their description is shown in their place.
		image({ text }: Tokens.Image) {
			return escapeHtml(text);
		}
	}
});

/** Everything the rules above can write, and nothing else. */
const FINAL_CHECK: sanitizeHtml.IOptions = {
	allowedTags: [
		'p',
		'br',
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'strong',
		'em',
		'u',
		'del',
		'code',
		'pre',
		'blockquote',
		'hr',
		'ul',
		'ol',
		'li',
		'a'
	],
	// `start` keeps a numbered list that begins at 3 starting at 3.
	allowedAttributes: { a: ['href', 'target', 'rel'], ol: ['start'] },
	allowedSchemes: ['http', 'https', 'mailto'],
	allowProtocolRelative: false
};

/**
 * `markdown` as HTML that is safe to draw with `{@html}` in `MarkdownContent`.
 * CommonMark with lists and links, `++underline++`, and GitHub's `~~struck~~`.
 */
export function renderMarkdown(markdown: string): string {
	const html = markdownReader.parse(markdown, { async: false });

	return sanitizeHtml(html, FINAL_CHECK);
}
