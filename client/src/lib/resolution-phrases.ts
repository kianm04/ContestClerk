/*
	The opening phrases of a draft resolution's clauses (docs/committee-papers.md,
	section 4, "The draft resolution's text").

	Every preambulatory clause starts with a phrase such as "Recalling", set in
	italic, and every operative clause with a verb such as "Calls upon", set
	underlined. Authors do not style the phrase themselves: a clause that starts
	with a phrase from the lists below has it styled wherever the paper is shown.
	A phrase on no list, such as "Urges strongly" or one in French, is styled
	when the author marks it with "Opening phrase", which stores it as its
	formatting: `*Recalling*` in the preamble, `++Calls upon++` in the operative
	part (`++text++` is how this codebase writes underline).

	The lists are the ones MUN conferences hand out (UNA-USA's and THIMUN's),
	with the British and the American spelling of every -ise word, so a
	delegate who writes "Recognizing" is not told they are wrong.

	This file is plain TypeScript with no Svelte in it, so the browser and the
	server both use it.
*/

import type { ClausePart } from '$lib/paper-clauses';

/** The phrases a preambulatory clause starts with, in alphabetical order. */
export const PREAMBULATORY_PHRASES: readonly string[] = [
	'Acknowledging',
	'Acknowledging with appreciation',
	'Acknowledging with deep concern',
	'Affirming',
	'Alarmed',
	'Alarmed by',
	'Anxious',
	'Appreciating',
	'Approving',
	'Aware',
	'Aware of',
	'Bearing in mind',
	'Believing',
	'Cognisant',
	'Cognizant',
	'Commending',
	'Concerned',
	'Concerned by',
	'Confident',
	'Conscious',
	'Considering',
	'Contemplating',
	'Convinced',
	'Declaring',
	'Deeply alarmed',
	'Deeply concerned',
	'Deeply conscious',
	'Deeply convinced',
	'Deeply disturbed',
	'Deeply regretting',
	'Deploring',
	'Desiring',
	'Determined',
	'Disturbed',
	'Emphasising',
	'Emphasizing',
	'Encouraged',
	'Endorsing',
	'Expecting',
	'Expressing concern',
	'Expressing deep concern',
	'Expressing its appreciation',
	'Expressing its gratitude',
	'Expressing its hope',
	'Expressing its satisfaction',
	'Firmly convinced',
	'Fulfilling',
	'Fully alarmed',
	'Fully aware',
	'Fully believing',
	'Further deploring',
	'Further noting',
	'Further recalling',
	'Further recognising',
	'Further recognizing',
	'Gravely concerned',
	'Guided by',
	'Having adopted',
	'Having considered',
	'Having devoted attention',
	'Having examined',
	'Having heard',
	'Having received',
	'Having regard to',
	'Having reviewed',
	'Having studied',
	'Highlighting',
	'Keeping in mind',
	'Mindful',
	'Noting',
	'Noting further',
	'Noting with appreciation',
	'Noting with approval',
	'Noting with concern',
	'Noting with deep concern',
	'Noting with grave concern',
	'Noting with regret',
	'Noting with satisfaction',
	'Observing',
	'Pointing out',
	'Reaffirming',
	'Realising',
	'Realizing',
	'Recalling',
	'Recalling also',
	'Recognising',
	'Recognising also',
	'Recognizing',
	'Recognizing also',
	'Referring',
	'Regretting',
	'Reiterating',
	'Reminding',
	'Seeking',
	'Stressing',
	'Taking into account',
	'Taking into consideration',
	'Taking note',
	'Taking note of',
	'Underlining',
	'Underscoring',
	'Upholding',
	'Viewing with apprehension',
	'Viewing with appreciation',
	'Welcoming',
	'Welcoming also',
	'Wishing'
];

/** The phrases an operative clause starts with, in alphabetical order. */
export const OPERATIVE_PHRASES: readonly string[] = [
	'Accepts',
	'Acknowledges',
	'Adopts',
	'Advises',
	'Affirms',
	'Agrees',
	'Appeals',
	'Appreciates',
	'Approves',
	'Asks',
	'Authorises',
	'Authorizes',
	'Calls',
	'Calls for',
	'Calls on',
	'Calls upon',
	'Commends',
	'Condemns',
	'Confirms',
	'Congratulates',
	'Considers',
	'Decides',
	'Declares',
	'Declares accordingly',
	'Demands',
	'Deplores',
	'Designates',
	'Directs',
	'Draws attention',
	'Draws the attention',
	'Emphasises',
	'Emphasizes',
	'Encourages',
	'Endorses',
	'Establishes',
	'Expresses',
	'Expresses its appreciation',
	'Expresses its concern',
	'Expresses its deep concern',
	'Expresses its gratitude',
	'Expresses its hope',
	'Expresses its regret',
	'Expresses its satisfaction',
	'Expresses its support',
	'Further calls upon',
	'Further decides',
	'Further encourages',
	'Further invites',
	'Further proclaims',
	'Further recommends',
	'Further reminds',
	'Further requests',
	'Further resolves',
	'Further urges',
	'Has resolved',
	'Highlights',
	'Implores',
	'Instructs',
	'Invites',
	'Mandates',
	'Notes',
	'Notes with appreciation',
	'Notes with concern',
	'Notes with regret',
	'Notes with satisfaction',
	'Proclaims',
	'Proposes',
	'Reaffirms',
	'Recalls',
	'Recognises',
	'Recognizes',
	'Recommends',
	'Regrets',
	'Reiterates',
	'Rejects',
	'Reminds',
	'Requests',
	'Resolves',
	'Solemnly affirms',
	'Stresses',
	'Strongly condemns',
	'Strongly encourages',
	'Strongly recommends',
	'Strongly supports',
	'Strongly urges',
	'Suggests',
	'Supports',
	'Takes note',
	'Takes note of',
	'Transmits',
	'Trusts',
	'Underlines',
	'Underscores',
	'Urges',
	'Welcomes'
];

/** The list of phrases for a part of the text. */
export function phrasesFor(part: ClausePart): readonly string[] {
	return part === 'preamble' ? PREAMBULATORY_PHRASES : OPERATIVE_PHRASES;
}

/** `text` with every character that means something in a regular expression escaped. */
function escapeForPattern(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/*
	One pattern per part that finds the opening phrase at the start of a
	clause. The phrases are tried longest first, so "Calls upon all States"
	finds "Calls upon" and not "Calls". A space in a phrase matches any run of
	spaces, so "Calls  upon" still counts. The phrase must end where a word
	ends: `(?![\p{L}\p{N}])` means "not followed by a letter or a digit", so
	"Recallingx" finds nothing. The `i` flag ignores case and the `u` flag lets
	`\p{L}` mean a letter in any alphabet.
*/
function phrasePattern(phrases: readonly string[]): RegExp {
	const longestFirst = [...phrases].sort((first, second) => second.length - first.length);
	const alternatives = longestFirst.map((phrase) =>
		phrase.split(' ').map(escapeForPattern).join('\\s+')
	);

	return new RegExp(`^\\s*(${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
}

const PREAMBULATORY_PATTERN = phrasePattern(PREAMBULATORY_PHRASES);
const OPERATIVE_PATTERN = phrasePattern(OPERATIVE_PHRASES);

/**
 * The phrase from that part's list that a clause starts with, written as it
 * is in the text ("RECALLING", "Calls  upon"), or null when it starts with
 * none. `text` is the clause's plain text, without its Markdown (see
 * `clausePlainText`); space before the phrase is allowed and is not part of
 * what comes back. When several phrases fit, the longest wins.
 */
export function openingPhrase(text: string, part: ClausePart): string | null {
	const pattern = part === 'preamble' ? PREAMBULATORY_PATTERN : OPERATIVE_PATTERN;

	return pattern.exec(text)?.[1] ?? null;
}

/*
	A phrase the author marked with "Opening phrase", at the very start of a
	clause's Markdown. In the preamble it is italic, `*Recalling*` or
	`_Recalling_`, but not bold `**Recalling**`: the first character inside
	must not be another star or a space. In the operative part it is
	underlined, `++Calls upon++`, read the way the Markdown renderer in
	`$lib/server/markdown.ts` reads underline.
*/
const MARKED_PREAMBULATORY_PATTERN = /^\s*(?:\*([^*\s][^*]*)\*|_([^_\s][^_]*)_(?![\p{L}\p{N}]))/u;
const MARKED_OPERATIVE_PATTERN = /^\s*\+\+([\s\S]+?)\+\+/;

/**
 * The words of a phrase marked by hand at the start of a clause's Markdown,
 * italic in the preamble and underlined in the operative part, or null when
 * the clause does not start with one.
 */
export function markedOpeningPhrase(markdown: string, part: ClausePart): string | null {
	const match =
		part === 'preamble'
			? MARKED_PREAMBULATORY_PATTERN.exec(markdown)
			: MARKED_OPERATIVE_PATTERN.exec(markdown);
	// Only one of the two italic forms matched, so one of its groups is empty.
	const words = (match?.[1] ?? match?.[2] ?? '').trim();

	return words === '' ? null : words;
}

/*
	The marks that are formatting rather than words, found in one pass so an
	escaped character stays as typed: a backslash and the character after it
	(`\*` is a star the author typed), `++` (underline), `~~` (struck), stars
	(italic and bold), backticks (code), and underscores that stand at the edge
	of a word. An underscore inside a word, as in `snake_case`, is a character
	in Markdown, not italic.
*/
const FORMATTING_MARKS = /\\(.)|\+\+|~~|\*+|`+|(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu;

/** A link or an image, `[words](address)`, of which only the words are text. */
const LINK = /!?\[([^\]]*)\]\([^)]*\)/g;

/**
 * A clause's words without its Markdown: `*Recalling* its resolution` is
 * "Recalling its resolution", and a link keeps only its words. This is what
 * `openingPhrase` and the format checks read.
 */
export function clausePlainText(markdown: string): string {
	return markdown
		.replace(LINK, '$1')
		.replace(FORMATTING_MARKS, (_mark, escapedCharacter?: string) => escapedCharacter ?? '');
}

/**
 * Does the clause start with an opening phrase, one from the lists or one the
 * author marked? This is what the format check asks of every clause.
 */
export function hasOpeningPhrase(markdown: string, part: ClausePart): boolean {
	return (
		markedOpeningPhrase(markdown, part) !== null ||
		openingPhrase(clausePlainText(markdown), part) !== null
	);
}
