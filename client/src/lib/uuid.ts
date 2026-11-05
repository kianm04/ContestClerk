/**
 * Telling an id from anything else that arrives in an address or a form.
 *
 * Postgres refuses a whole query over anything that is not a uuid where it
 * expects one, so a value that goes into such a filter is checked here first
 * and dropped, rather than becoming a failed page.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

/** The shape of an id Postgres's `uuid` type accepts, such as `gen_random_uuid()` makes. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` is exactly one id, in either case, with nothing around it. */
export function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}
