/**
 * Reading the id the browser chose for a row a press adds (T141).
 *
 * An instant form draws a new row, such as a speaker added to the queue, the
 * moment it is pressed, under an id the browser made up
 * (`newRowId` in `$lib/chair-form.ts`) and sends in `NEW_ROW_ID_FIELD`. The server saves the row under that
 * same id, so the row drawn and the row saved are one and the same, and fresh
 * data arriving never shows it twice. Without JavaScript no id is sent and
 * the database chooses one, as before.
 */

/** The form field that carries the id the browser chose for the row a press adds. */
export const NEW_ROW_ID_FIELD = 'newRowId';

/** The shape of an id Postgres's `uuid` type accepts, such as `crypto.randomUUID()` makes. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The id a form sent for its new row, or null when it sent none or something
 * that is not an id, in which case the database chooses one. A made-up id
 * that some other row already has is refused by the database, which is the
 * same as any other failed save.
 */
export function readNewRowId(value: FormDataEntryValue | null): string | null {
	if (typeof value !== 'string') return null;

	const id = value.trim();

	return UUID_PATTERN.test(id) ? id.toLowerCase() : null;
}
