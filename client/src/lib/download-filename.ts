/**
 * The `content-disposition` header of a download, which names the file the
 * browser saves.
 *
 * The CSV exports name their files after the conference's slug, which an
 * organiser typed. The header is `attachment; filename="..."`, and a quotation
 * mark inside the name would end it early, while a line break or another
 * control character makes the server refuse to send the header at all, which
 * the organiser sees as a failed download. So every export's name passes
 * through here once, rather than being trusted in each.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

/**
 * Everything the plain `filename` may carry as it is: lower-case letters,
 * digits, hyphens and the dot before the extension. A run of anything else
 * becomes one hyphen, the way a slug is made.
 */
const UNSAFE_RUN = /[^a-z0-9.-]+/g;

/**
 * The characters RFC 5987 does not allow bare in `filename*` but
 * `encodeURIComponent` leaves alone.
 */
const RFC_5987_ESCAPES = /['()*]/g;

/** `value` as a `filename*` parameter writes it: UTF-8, percent-encoded. */
function encodeRfc5987(value: string): string {
	return encodeURIComponent(value).replace(
		RFC_5987_ESCAPES,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
	);
}

/**
 * The header for saving `fileName` as a download.
 *
 * A name made only of safe characters is written as it is. Any other name is
 * written twice, as RFC 6266 allows: a plain `filename` every browser can
 * read, with the unsafe characters replaced, and a `filename*` carrying the
 * real name percent-encoded, which browsers prefer when both are there.
 */
export function contentDispositionFor(fileName: string): string {
	const plainName = fileName.toLowerCase().replace(UNSAFE_RUN, '-');

	if (plainName === fileName) {
		return `attachment; filename="${plainName}"`;
	}

	return `attachment; filename="${plainName}"; filename*=UTF-8''${encodeRfc5987(fileName)}`;
}
