/**
 * Making what somebody typed into a search box safe to put inside a Supabase
 * `.or(...)` filter.
 *
 * Supabase does not escape the text of that filter for us. `.or(...)` takes one
 * piece of text in PostgREST's own filter language, so a visitor who types `,`
 * or `.` into the search box is writing filter language rather than searching
 * for it, and `%` or `_` would act as wildcards. One module holds the rule so
 * that the conference directory and the organiser's applications and
 * delegations tables cannot drift apart on it.
 *
 * Files under `$lib/server` only ever run on the server, and nothing but a
 * query needs this.
 */

/**
 * Characters a search may keep: letters in any language (`\p{L}`), digits (`\p{N}`),
 * spaces (`\s`), apostrophes and hyphens. Everything else is unsafe.
 */
const UNSAFE_SEARCH_CHARACTERS = /[^\p{L}\p{N}\s'-]/gu;

/**
 * Make visitor text safe to put inside a Supabase `.or(...)` filter.
 *
 * In that filter `,` `(` `)` `.` `:` and `"` would change the filter itself, and
 * `%` `_` `*` would act as wildcards. Every character outside the safe set
 * becomes a space, runs of spaces become one, and the ends are trimmed. Text
 * that was nothing but unsafe characters comes back as '', which every caller
 * reads as "no search at all".
 */
export function toSafeSearchText(text: string): string {
	const withoutUnsafeCharacters = text.replace(UNSAFE_SEARCH_CHARACTERS, ' ');
	const withSingleSpaces = withoutUnsafeCharacters.replace(/\s+/g, ' ');

	return withSingleSpaces.trim();
}

/**
 * The most words `toSafeSearchWords` keeps. Each word becomes one condition of
 * the request, so a pasted paragraph would otherwise make an address longer
 * than the server accepts. Eight is more than any conference name has.
 */
export const MAX_SEARCH_WORDS = 8;

/**
 * Make visitor text safe the same way `toSafeSearchText` does, then split it
 * into its words, for a search that matches each word on its own.
 *
 * The conference directory searches this way so that a name typed exactly as
 * the directory shows it, "Northbridge MUN (applications open)", still finds
 * the conference: the brackets become spaces, and "Northbridge MUN applications
 * open" as one piece of text is in no name, while each of its four words is
 * (T164). Text with nothing safe in it comes back as an empty list, and only the
 * first `MAX_SEARCH_WORDS` words are kept.
 */
export function toSafeSearchWords(text: string): string[] {
	const safeText = toSafeSearchText(text);

	if (safeText === '') {
		return [];
	}

	const words = safeText.split(' ');

	return words.slice(0, MAX_SEARCH_WORDS);
}
