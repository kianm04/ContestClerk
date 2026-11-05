/**
 * Markdown in MUNMeet (T143): the rules the editor in the browser and the
 * renderer on the server (`$lib/server/markdown.ts`) share, so both agree on
 * which links a text may hold and how formatted text looks.
 *
 * Markdown has no way to write underline, so MUNMeet writes it as
 * `++underlined++`, the way Tiptap's underline extension does.
 */

import type { MarkedExtension } from 'marked';

/**
 * A setting for `marked`, the library that reads Markdown both in the editor
 * and on the server: raw HTML such as `<b>` or `<script>` is read as the
 * characters typed, so it is shown as text everywhere and never runs.
 * Returning `undefined` from a tokenizer tells `marked` "this is not HTML".
 */
export const RAW_HTML_AS_TEXT: MarkedExtension = {
	tokenizer: {
		html: () => undefined,
		tag: () => undefined
	}
};

/** The start of every address a link may go to: a web page or an email address. */
const ALLOWED_LINK_START = /^(https?:\/\/|mailto:)/i;

/** True when a link may go to this address. `javascript:` and `data:` never may. */
export function isAllowedLinkAddress(address: string): boolean {
	return ALLOWED_LINK_START.test(address.trim());
}

/**
 * The address a link typed into the link box goes to, or null for one that is
 * not allowed. A bare "www.un.org" becomes "https://www.un.org"; anything
 * naming another scheme, such as `javascript:alert(1)`, is refused.
 */
export function linkAddressFromTyped(typed: string): string | null {
	const address = typed.trim();

	if (address === '') return null;
	if (isAllowedLinkAddress(address)) return address;
	if (address.includes(':')) return null;

	return `https://${address}`;
}

/*
	How formatted text looks, in the editor and wherever Markdown is shown.
	Tailwind takes the default look off every heading and list, so it is put
	back here. `[&_ul]:list-disc` is Tailwind for "every `ul` inside this
	element gets bullets". Written out in full so Tailwind can find the class
	names in this file.
*/
export const MARKDOWN_CONTENT_CLASSES = [
	'text-body text-ink-900 break-words',
	'[&_h1]:font-display [&_h1]:text-h2 [&_h1]:mt-3',
	'[&_h2]:font-display [&_h2]:text-h3 [&_h2]:mt-2',
	'[&_h3]:font-display [&_h3]:text-h3 [&_h3]:mt-2',
	'[&_p]:my-1 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6',
	'[&_a]:text-brand-700 [&_a]:underline',
	'[&_blockquote]:border-l-4 [&_blockquote]:border-line [&_blockquote]:pl-3',
	'[&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1'
].join(' ');
