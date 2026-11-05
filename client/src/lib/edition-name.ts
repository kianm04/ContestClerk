/**
 * The name of a conference's next edition, worked out from the last one
 * (Trello fe3reN7Y): "TU Delft MUN 2026" becomes "TU Delft MUN 2027". No
 * guessing and no language model: the year in the old name is swapped for the
 * year the suggested dates fall in, and a name with no year in it is kept as it
 * is, because there is nothing to move.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

/** A four-digit year somewhere in a name, such as the 2026 in "Delft MUN 2026". */
const YEAR_IN_NAME = /\b(19|20)\d{2}\b/;

/** The year a name carries, or `null` when it has none. */
export function yearInName(name: string): number | null {
	const match = YEAR_IN_NAME.exec(name);

	return match === null ? null : Number(match[0]);
}

/**
 * The previous edition's name with its year replaced by `nextYear`. "Delft MUN
 * 2026" and 2027 give "Delft MUN 2027". A name without a year comes back
 * unchanged, and so does one that already names `nextYear`.
 */
export function nextEditionName(previousName: string, nextYear: number): string {
	if (yearInName(previousName) === null) {
		return previousName;
	}

	return previousName.replace(YEAR_IN_NAME, String(nextYear));
}

/**
 * The year of a `YYYY-MM-DD` day, or `null` for anything else. The start date
 * of the suggested edition is what the generated name's year comes from.
 */
export function yearOfDay(day: string): number | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
		return null;
	}

	return Number(day.slice(0, 4));
}

/**
 * The same sentence with the previous edition's year and name swapped for the
 * next one's, so a copied tagline or description does not promise the wrong
 * year. "Join us in April 2026 for Delft MUN 2026" becomes "Join us in April
 * 2027 for Delft MUN 2027". Text with no year in it is left alone.
 */
export function retargetEditionText(
	text: string,
	previousName: string,
	nextName: string,
	nextYear: number
): string {
	const previousYear = yearInName(previousName);

	let retargeted = text.split(previousName).join(nextName);

	if (previousYear !== null) {
		retargeted = retargeted.split(String(previousYear)).join(String(nextYear));
	}

	return retargeted;
}
