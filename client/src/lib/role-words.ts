/**
 * The small bits of English the app makes out of a role's name.
 *
 * A conference names its own roles (`docs/roles-and-permissions.md`): the
 * three it starts with are "Organiser", "Chair" and "Volunteer", and an
 * organiser may add "USG delegate affairs" or "Registration desk" later. The
 * pages write those names into sentences ("Lars is now a chair"), tabs
 * ("Chairs") and counts ("3 chairs"), and the rules for doing that live here so
 * that every page bends a name the same way.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

/**
 * The name as it reads inside a sentence: "chair" from "Chair", "organiser"
 * from "Organiser".
 *
 * Only the first letter is lowered, and only when the second letter is already
 * lowercase. "USG delegate affairs" keeps its capitals, because "uSG" would be
 * a mistake and the abbreviation is the name.
 */
export function roleNameInSentence(name: string): string {
	const secondLetter = name.charAt(1);

	if (secondLetter !== '' && secondLetter === secondLetter.toLowerCase()) {
		return name.charAt(0).toLowerCase() + name.slice(1);
	}

	return name;
}

/**
 * The letters whose spoken names start with a vowel sound ("em", "ess", "ex"),
 * which is what decides the article before an abbreviation: "an MP", "an SG
 * office", but "a USG delegate affairs", because U is said "you".
 */
const LETTERS_SAID_WITH_A_VOWEL_SOUND = /^[AEFHILMNORSX]/;

/**
 * The name with an article in front, for "is now a chair" and "is now an
 * organiser". English picks "an" before a vowel sound, and for an ordinary
 * word the first letter is close enough: the only role names this gets wrong
 * are ones such as "Usher", and a conference that minds can rename it. An
 * abbreviation, which `roleNameInSentence` leaves in capitals, is said letter
 * by letter, so its first letter's name decides instead.
 */
export function roleNameWithArticle(name: string): string {
	const word = roleNameInSentence(name);
	const isAbbreviation = word === name && /^[A-Z]/.test(name);
	const startsWithVowelSound = isAbbreviation
		? LETTERS_SAID_WITH_A_VOWEL_SOUND.test(word)
		: /^[aeiou]/i.test(word);

	return `${startsWithVowelSound ? 'an' : 'a'} ${word}`;
}

/**
 * The plural of a role's name, for a tab ("Chairs") or a count ("3 chairs"
 * once lowered). A name that already ends in an s, such as "Press", stays as it
 * is rather than becoming "Presss".
 */
export function pluralRoleName(name: string): string {
	if (name.endsWith('s') || name.endsWith('S')) {
		return name;
	}

	return `${name}s`;
}

/**
 * "1 chair" or "3 chairs": the count, then the name as it reads in a sentence,
 * made plural when there is not exactly one.
 */
export function countedRoleName(count: number, name: string): string {
	const word = roleNameInSentence(name);

	if (count === 1) {
		return `${count} ${word}`;
	}

	return `${count} ${pluralRoleName(word)}`;
}
