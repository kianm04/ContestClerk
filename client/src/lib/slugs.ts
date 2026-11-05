/**
 * Slugs: the readable, link-safe names at the end of addresses such as
 * `/conferences/thimun-2027-4f9a1c`.
 */

/** The longest the readable part of a slug may be, so links stay a sensible length. */
const MAXIMUM_SLUG_NAME_LENGTH = 60;

/** How many random characters go on the end of every new slug. */
const RANDOM_SUFFIX_LENGTH = 6;

/**
 * Turn a name into lowercase words joined by hyphens: `Café MUN 2027!` becomes
 * `cafe-mun-2027`. Returns '' when the name has no letters or digits we can keep.
 */
export function slugify(name: string): string {
	// `NFKD` splits a letter such as `é` into a plain `e` and a separate accent
	// mark. The accent marks (`\p{M}`) are then removed, leaving the plain letter.
	const withoutAccents = name.normalize('NFKD').replace(/\p{M}/gu, '');
	const lowercase = withoutAccents.toLowerCase();

	// Every run of characters other than a-z and 0-9 becomes one hyphen.
	const hyphenated = lowercase.replace(/[^a-z0-9]+/g, '-');
	const shortened = hyphenated.slice(0, MAXIMUM_SLUG_NAME_LENGTH);

	// Remove hyphens left over at the start or the end, as in `-model-un-`.
	return shortened.replace(/^-+|-+$/g, '');
}

/**
 * A slug for something new: the readable name plus a short random ending, such as
 * `thimun-2027-4f9a1c`. Thanks to the ending, two conferences with the same name
 * still get different links, without asking the database which slugs are taken.
 */
export function makeUniqueSlug(name: string): string {
	const slugifiedName = slugify(name);
	const readablePart = slugifiedName === '' ? 'untitled' : slugifiedName;

	// `randomUUID` returns text like `4f9a1c2e-...`, which starts with random letters and digits.
	const randomSuffix = crypto.randomUUID().slice(0, RANDOM_SUFFIX_LENGTH);

	return `${readablePart}-${randomSuffix}`;
}
