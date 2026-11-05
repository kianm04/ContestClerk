/**
 * Small counts written as words, the way a sentence reads them: "two taking
 * shape", "One required step left". The summary line and the rows of `/manage`
 * are written this way in the manage redesign (`specs/03-design/manage-redesign/`).
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

/** The words for nought to ten. Above ten a sentence reads the figure more easily. */
const NUMBER_WORDS = [
	'no',
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
	'ten'
];

/**
 * A count as a word in lower case: 2 gives "two", 0 gives "no", and anything
 * above ten (or below nought) stays a figure, such as "12".
 */
export function numberInWords(count: number): string {
	return NUMBER_WORDS[count] ?? String(count);
}

/** The same, with a capital letter, for the start of a sentence: "Two", "12". */
export function numberInWordsCapitalised(count: number): string {
	const word = numberInWords(count);

	return word.charAt(0).toUpperCase() + word.slice(1);
}
