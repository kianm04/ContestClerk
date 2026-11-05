/**
 * Turning the plain text people type into the pieces a page can show.
 *
 * Descriptions, announcements and motivations are stored as plain text, with
 * paragraphs separated by a blank line. MVP has no markdown (see
 * `specs/02-architecture/stack.md`), so the only structure there is to find is
 * where one paragraph ends and the next begins.
 *
 * Nothing here talks to Supabase or to Svelte.
 */

/** A blank line, possibly with spaces or tabs on it, and possibly Windows line endings. */
const BLANK_LINE = /\r?\n[ \t]*\r?\n/;

/**
 * Split a block of text into its paragraphs, dropping the empty ones.
 *
 * Single line breaks inside a paragraph are left alone: the component keeps
 * them with the CSS class `whitespace-pre-line`, so the page never has to put
 * raw HTML on the screen.
 */
export function splitIntoParagraphs(text: string): string[] {
	const paragraphs = text.split(BLANK_LINE);

	return paragraphs.map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph !== '');
}

/** How many letters an avatar shows when there is no picture. */
const MAX_INITIALS = 2;

/**
 * The letters shown in place of a missing picture: "Daniel Perez" gives "DP",
 * "The Hague International MUN" gives "TH".
 *
 * The first letter of the first two words, in capitals. A name that is one word
 * gives one letter, and text with no letters in it at all gives '', which the
 * avatar shows as an empty circle rather than as a broken one.
 */
export function initials(name: string): string {
	const words = name.trim().split(/\s+/);
	const firstLetters = words.map((word) => word.charAt(0));

	return firstLetters.slice(0, MAX_INITIALS).join('').toUpperCase();
}
