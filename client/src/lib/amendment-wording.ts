/**
 * How an amendment is put into words on screen (`docs/committee-papers.md`,
 * step 7): the sentence that says what it does, "Change 1(a): add ‘whose
 * effects cannot be anticipated’.", the quiet line of facts under it, and the
 * clauses the form offers to amend.
 *
 * Clause numbers are never stored, so every sentence is worded from the
 * clauses as they are numbered now (`numberedClauses` in `./paper-clauses.ts`).
 * The sentences are Markdown, because an added clause keeps its own
 * formatting; the server draws them with `renderMarkdown`.
 *
 * Plain functions with no Svelte in them, so the browser and the server both
 * use them and they can be tested on their own.
 */

import { formatDayAndLongMonth } from '$lib/dashboard-dates';
import { formatTimeOfDay } from '$lib/dates';
import {
	clauseChoiceValue,
	isAmendmentWaiting,
	type AmendmentRules,
	type PaperAmendment
} from '$lib/paper-amendments';
import {
	numberedClauses,
	type AmendmentAction,
	type ClauseContent,
	type ClausePart,
	type NumberedClause
} from '$lib/paper-clauses';
import { clausePlainText } from '$lib/resolution-phrases';
import { withOpeningPhraseMarked } from '$lib/resolution-reading';

/** The clause with this id in this part of the text, numbered, or `null` when it is not there. */
export function findClause(
	content: ClauseContent,
	part: ClausePart,
	clauseId: string | null
): NumberedClause | null {
	if (clauseId === null) return null;

	return (
		numberedClauses(content).find((clause) => clause.part === part && clause.id === clauseId) ??
		null
	);
}

/**
 * How a sentence names a clause: an operative clause by its number alone,
 * "1(a)", as a chair reads it out, and a preambulatory one in full,
 * "preambulatory clause 2", as it has no number of its own.
 */
export function clauseReference(clause: NumberedClause): string {
	return clause.part === 'preamble' ? `preambulatory clause ${clause.reference}` : clause.reference;
}

/** "clause 1(a)" or "preambulatory clause 2". */
function clauseWithWord(clause: NumberedClause): string {
	return clause.part === 'preamble' ? clauseReference(clause) : `clause ${clause.reference}`;
}

/** What a change does to a clause's words, worked out word by word. */
export type WordChange =
	| { kind: 'same' }
	| { kind: 'add'; added: string }
	| { kind: 'strike'; removed: string }
	| { kind: 'replace'; removed: string; added: string }
	/** Nothing in common at the start or the end: the clause is written anew. */
	| { kind: 'whole' };

/** The punctuation that ends a word, which a change compares on its own: "weapons;" is "weapons" and ";". */
const TRAILING_PUNCTUATION = /^(.*?)([,;:.!?]*)$/;

/** A clause's plain words, with the punctuation at the end of each set apart as a token of its own. */
function wordTokens(markdown: string): string[] {
	return clausePlainText(markdown)
		.split(/\s+/)
		.filter(Boolean)
		.flatMap((word) => {
			const [, core, punctuation] = TRAILING_PUNCTUATION.exec(word) ?? [word, word, ''];

			return [core, punctuation].filter(Boolean);
		});
}

/** Tokens put back into words: punctuation sits against the word before it. */
function joinTokens(tokens: string[]): string {
	return tokens.reduce(
		(words, token) =>
			words === '' || /^[,;:.!?]+$/.test(token) ? `${words}${token}` : `${words} ${token}`,
		''
	);
}

/**
 * The words that differ between a clause's old words and its new ones: the
 * words both share at the start and at the end are set aside, and what is
 * left in the middle is what was added, struck or replaced. Formatting is
 * left out, as the sentence quotes the words.
 */
export function wordChange(before: string, after: string): WordChange {
	const oldWords = wordTokens(before);
	const newWords = wordTokens(after);
	let start = 0;

	while (
		start < oldWords.length &&
		start < newWords.length &&
		oldWords[start] === newWords[start]
	) {
		start += 1;
	}

	let end = 0;

	while (
		end < oldWords.length - start &&
		end < newWords.length - start &&
		oldWords[oldWords.length - 1 - end] === newWords[newWords.length - 1 - end]
	) {
		end += 1;
	}

	const removed = joinTokens(oldWords.slice(start, oldWords.length - end));
	const added = joinTokens(newWords.slice(start, newWords.length - end));

	if (removed === '' && added === '') return { kind: 'same' };
	if (start === 0 && end === 0) return { kind: 'whole' };
	if (removed === '') return { kind: 'add', added };
	if (added === '') return { kind: 'strike', removed };

	return { kind: 'replace', removed, added };
}

/** Plain words made safe to put in Markdown: every mark that means something is escaped. */
function asMarkdownText(words: string): string {
	return words.replace(/[\\`*_~+[\]<>#|]/g, (mark) => `\\${mark}`);
}

/** `words` in single quotes, as a chair quotes a clause. */
function quoted(markdown: string): string {
	return `‘${markdown}’`;
}

/** What a change does, after its colon: "add ‘…’", "strike ‘…’" or "replace ‘…’ with ‘…’". */
function changeWords(change: WordChange, after: string): string {
	if (change.kind === 'add') return `add ${quoted(asMarkdownText(change.added))}`;
	if (change.kind === 'strike') return `strike ${quoted(asMarkdownText(change.removed))}`;
	if (change.kind === 'replace') {
		return `replace ${quoted(asMarkdownText(change.removed))} with ${quoted(asMarkdownText(change.added))}`;
	}
	if (change.kind === 'same') return 'no change to its words';

	return `to read ${quoted(after)}`;
}

/** What the sentence knows about the clause an amendment points at. */
export type AmendmentTarget = {
	/** The clause as numbered now, or in the version the amendment was proposed against. */
	clause: NumberedClause | null;
	/** The clause's words before the change: the version it was proposed against, or the parent's words. */
	before: string | null;
	/** For an amendment to an amendment, the amendment it changes. */
	parent: { sequence: number } | null;
};

/** A clause's new words, with its opening phrase styled where a top clause has one. */
function newClauseWords(text: string, part: ClausePart, level: number): string {
	return level <= 1 ? withOpeningPhraseMarked(text, part) : text;
}

/**
 * The sentence on an amendment's card, as Markdown: "Change 1(a): add ‘…’.",
 * "Strike clause 2", "Add after clause 4: ‘Affirms that…’", or for an
 * amendment to an amendment, "Change amendment 2: replace ‘…’ with ‘…’.".
 */
export function amendmentSentence(
	amendment: { action: AmendmentAction; targetPart: ClausePart; textMarkdown: string | null },
	target: AmendmentTarget
): string {
	const text = amendment.textMarkdown ?? '';
	const { clause, before, parent } = target;

	if (parent !== null) {
		return `Change amendment ${parent.sequence}: ${changeWords(wordChange(before ?? '', text), quoted(text))}.`;
	}

	if (amendment.action === 'strike') {
		return clause === null
			? 'Strike a clause no longer in the draft'
			: `Strike ${clauseWithWord(clause)}`;
	}

	if (amendment.action === 'add') {
		const words = quoted(newClauseWords(text, amendment.targetPart, clause?.level ?? 1));
		const place =
			clause !== null
				? `after ${clauseWithWord(clause)}`
				: amendment.targetPart === 'preamble'
					? 'at the start of the preamble'
					: 'before clause 1';

		return `Add ${place}: ${words}`;
	}

	const name = clause === null ? 'a clause no longer in the draft' : clauseReference(clause);
	const after = quoted(newClauseWords(text, amendment.targetPart, clause?.level ?? 1));

	return `Change ${name}: ${changeWords(wordChange(before ?? '', text), after)}.`;
}

/** "15 March, 14:52", in the conference's time. */
function dayAndTime(moment: string, timeZone: string): string {
	return `${formatDayAndLongMonth(moment, timeZone)}, ${formatTimeOfDay(moment, timeZone)}`;
}

/** "1 seat" or "5 seats". */
function seats(count: number): string {
	return `${count} ${count === 1 ? 'seat' : 'seats'}`;
}

/** How much support an unfriendly amendment has: "Supported by 2 seats of the 5 it needs". */
function supportWords(amendment: PaperAmendment, needed: number): string | null {
	if (needed <= 1) return null;

	const count = 1 + amendment.supporterSeatIds.length;

	if (amendment.status === 'collecting_support') {
		return `Supported by ${seats(count)} of the ${needed} it needs`;
	}

	return count === needed
		? `Supported by ${seats(count)}, the ${needed} it needs`
		: `Supported by ${seats(count)}, ${needed} needed`;
}

/** "3 of 5 sponsors have answered", in the committee's own word for its sponsors. */
function answeredWords(amendment: PaperAmendment, sponsorsWord: string): string {
	const asked = amendment.sponsorAnswers.length;
	const answered = amendment.sponsorAnswers.filter((sponsor) => sponsor.accepts !== null).length;
	const noun = asked === 1 ? sponsorsWord.replace(/s$/, '') : sponsorsWord;

	return `${answered} of ${asked} ${noun} ${answered === 1 ? 'has' : 'have'} answered`;
}

/** Whether the line says "Friendly" or "Unfriendly": only where the committee has both, once it is known. */
function friendlinessWord(amendment: PaperAmendment, rules: AmendmentRules): string | null {
	const isKnown =
		amendment.isFriendly ||
		!['awaiting_sponsors', 'withdrawn', 'lapsed'].includes(amendment.status);

	if (!rules.hasFriendlyAmendments || amendment.parentAmendmentId !== null || !isKnown) return null;

	return amendment.isFriendly ? 'Friendly' : 'Unfriendly';
}

/**
 * The quiet line under an amendment's sentence: who proposed it, what it
 * amends, whether it is friendly, and where it has got to. "Germany ·
 * Friendly · 15 March, 14:52", "India · 3 of 5 sponsors have answered".
 */
export function amendmentMetaLine(
	amendment: PaperAmendment,
	context: {
		rules: AmendmentRules;
		parent: { sequence: number } | null;
		sponsorsWord: string;
		timeZone: string;
	}
): string {
	const { rules, parent, sponsorsWord, timeZone } = context;
	const facts: (string | null)[] = [
		amendment.proposerName,
		parent && `To amendment ${parent.sequence}`,
		friendlinessWord(amendment, rules)
	];

	if (amendment.status === 'awaiting_sponsors') {
		facts.push(answeredWords(amendment, sponsorsWord));
	} else if (isAmendmentWaiting(amendment.status) && !amendment.isFriendly) {
		facts.push(supportWords(amendment, rules.supportNeeded));
	} else if (amendment.decidedAt !== null) {
		facts.push(dayAndTime(amendment.decidedAt, timeZone));
	}

	return facts.filter((fact) => fact !== null).join(' · ');
}

/** One choice in the form's clause Select. */
export type ClauseOption = { value: string; label: string; detail: string };

/** The first few words of a clause, so a reader can tell clause 1(a) from 1(b) in the list. */
function openingWords(markdown: string): string {
	const words = clausePlainText(markdown).split(/\s+/).filter(Boolean);

	return words.length > 6 ? `${words.slice(0, 6).join(' ')}…` : words.join(' ');
}

/** "Clause 1(a)", "After clause 1(a)", or for a preambulatory one "Preambulatory clause 2". */
function optionLabel(clause: NumberedClause, isAddition: boolean): string {
	const name = clauseWithWord(clause);
	const label = isAddition ? `After ${name}` : name;

	return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The clauses the form offers: the operative clauses and their sub-clauses,
 * and the preambulatory clauses first where the committee amends those too.
 * An addition goes after the clause chosen, or at the very start of its part,
 * which only an addition offers. Without JavaScript the form cannot change
 * its list when the action is chosen, so `action` is `null` there and the
 * list holds every choice, worded for any action.
 */
export function clauseOptions(
	content: ClauseContent,
	isPreambleAmendable: boolean,
	action: AmendmentAction | null
): ClauseOption[] {
	const clauses = numberedClauses(content).filter(
		(clause) => clause.part === 'operative' || isPreambleAmendable
	);
	const options = clauses.map((clause) => ({
		value: clauseChoiceValue(clause.part, clause.id),
		label: optionLabel(clause, action === 'add'),
		detail: openingWords(clause.markdown)
	}));

	if (action !== null && action !== 'add') return options;

	// Once the action is known to be an addition, the note on the start choices says nothing new.
	const startDetail = action === 'add' ? '' : 'An addition only';
	const starts = [
		...(isPreambleAmendable
			? [
					{
						value: clauseChoiceValue('preamble', null),
						label: 'At the start of the preamble',
						detail: startDetail
					}
				]
			: []),
		{ value: clauseChoiceValue('operative', null), label: 'Before clause 1', detail: startDetail }
	];
	const firstOperative = options.findIndex((option) => option.value.startsWith('operative:'));
	const preambleOptions = firstOperative === -1 ? options : options.slice(0, firstOperative);
	const operativeOptions = firstOperative === -1 ? [] : options.slice(firstOperative);

	return [
		...starts.filter((start) => start.value.startsWith('preamble:')),
		...preambleOptions,
		...starts.filter((start) => start.value.startsWith('operative:')),
		...operativeOptions
	];
}
