/**
 * The counting and listing helpers every line of the conference dashboard writes with:
 * "3 applications", "Ana and Ben".
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

/**
 * The count followed by the right form of the noun. Both forms are given in
 * full, because English plurals do not follow one rule ("1 delegation is",
 * "2 delegations are").
 */
export function countOf(count: number, singular: string, plural: string): string {
	if (count === 1) {
		return `1 ${singular}`;
	}

	return `${count} ${plural}`;
}

/**
 * Names joined the way a sentence lists them: "Ana", "Ana and Ben",
 * "Ana, Ben and Cleo". `Intl.ListFormat` is the browser's own list writer, so
 * the commas and the "and" follow British English without a rule of our own.
 */
export function listInWords(names: string[]): string {
	return new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(names);
}
