/**
 * The amendment cards beside an introduced draft resolution, and on the
 * dais's review of it (`docs/committee-papers.md`, step 7): each amendment
 * put into words against the versions of the draft, with the clause it sits
 * beside and the buttons the reader may press.
 *
 * Plain functions with no Svelte in them. The sentences are Markdown, so the
 * server hands in its `renderMarkdown` to turn them into safe HTML; a test
 * hands in anything it likes.
 */

import {
	amendmentMetaLine,
	amendmentSentence,
	findClause,
	type AmendmentTarget
} from '$lib/amendment-wording';
import {
	amendmentChoices,
	amendmentName,
	amendmentStatusTone,
	amendmentStatusWord,
	type AmendmentChoices,
	type AmendmentReader,
	type AmendmentRules,
	type PaperAmendment,
	type StatusTone
} from '$lib/paper-amendments';
import { numberedClauses, type ClauseContent } from '$lib/paper-clauses';
import { placeCards } from '$lib/paper-margin';

/** One version of the draft's text, as `readPaperVersions` reads it. */
export type DraftVersion = { id: string; versionNumber: number; content: ClauseContent };

/** An amendment ready to draw on its card. */
export type AmendmentCard = {
	id: string;
	sequence: number;
	/** "Amendment 3". */
	name: string;
	statusWord: string;
	tone: StatusTone;
	/** "Change 1(a): add ‘…’.", as safe HTML. */
	sentenceHtml: string;
	/** "Germany · Friendly · 15 March, 14:52". */
	metaLine: string;
	/** Why the dais ruled it out of order, or `null`. */
	ruling: string | null;
	/** For the proposer while the sponsors are asked: "Accepted by Austria and Mexico", or `null`. */
	answersLine: string | null;
	/** The clause it sits beside, as the id of that clause in the text as it stands; `null` for the end. */
	anchorClauseId: string | null;
	/** The amendment it changes, for an amendment to an amendment. */
	parentId: string | null;
	choices: AmendmentChoices;
	/** The amendment itself, for what the dais's page decides with it. */
	amendment: PaperAmendment;
};

/** The version an amendment was proposed against, or the first when it is not known. */
function basedOnVersion(amendment: PaperAmendment, versions: DraftVersion[]): DraftVersion | null {
	return (
		versions.find((version) => version.id === amendment.basedOnVersionId) ?? versions[0] ?? null
	);
}

/**
 * What the sentence knows about an amendment's clause. The clause is
 * numbered as the draft stands now while it is there, and as it stood when
 * the amendment was proposed once it has gone, as a written-in strike's has.
 * A change is worded against the clause as it was then, before it was
 * written in; an amendment to an amendment against the amendment's words.
 */
export function amendmentTarget(
	amendment: PaperAmendment,
	amendments: PaperAmendment[],
	versions: DraftVersion[]
): AmendmentTarget {
	const latest = versions.at(-1)?.content ?? { preamble: [], operative: [] };
	const based = basedOnVersion(amendment, versions)?.content ?? latest;
	const { targetPart, targetClauseId } = amendment;
	const clause =
		findClause(latest, targetPart, targetClauseId) ?? findClause(based, targetPart, targetClauseId);
	const parent = amendments.find((each) => each.id === amendment.parentAmendmentId) ?? null;

	if (parent !== null) {
		return { clause, before: parent.textMarkdown, parent: { sequence: parent.sequence } };
	}

	return {
		clause,
		before: findClause(based, targetPart, targetClauseId)?.markdown ?? clause?.markdown ?? null,
		parent: null
	};
}

/**
 * The clause a card sits beside in the text as it stands: a written-in
 * addition beside the clause it added (`a` and its number, as
 * `applyAmendment` names it), an addition at the start beside the part's
 * first clause, anything else beside its clause, and `null`, the end, for a
 * clause no longer there.
 */
export function anchorClauseId(amendment: PaperAmendment, latest: ClauseContent): string | null {
	const clauses = numberedClauses(latest).filter((clause) => clause.part === amendment.targetPart);
	const has = (id: string) => clauses.some((clause) => clause.id === id);
	const addedId = `a${amendment.sequence}`;

	if (amendment.action === 'add' && amendment.status === 'written_in' && has(addedId))
		return addedId;
	if (amendment.targetClauseId === null) return clauses[0]?.id ?? null;

	return has(amendment.targetClauseId) ? amendment.targetClauseId : null;
}

/** "Austria", "Austria and Mexico", "Austria, Chile and Mexico". */
function listedNames(names: string[]): string {
	if (names.length <= 1) return names.join('');

	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** For the proposer, the sponsors who have accepted so far: the answers as they arrive. */
function answersLine(amendment: PaperAmendment, reader: AmendmentReader): string | null {
	const isProposer = reader !== null && reader.seatId === amendment.proposedBySeatId;
	const accepted = amendment.sponsorAnswers.filter((sponsor) => sponsor.accepts === true);

	if (!isProposer || amendment.status !== 'awaiting_sponsors' || accepted.length === 0) return null;

	return `Accepted by ${listedNames(accepted.map((sponsor) => sponsor.seatName))}`;
}

/** Everything the cards need, besides the amendments. */
export type AmendmentCardContext = {
	versions: DraftVersion[];
	rules: AmendmentRules;
	reader: AmendmentReader;
	/** "sponsors", or THIMUN's "submitters". */
	sponsorsWord: string;
	timeZone: string;
	/** Markdown to safe HTML: `renderMarkdown` on the server. */
	render: (markdown: string) => string;
};

/** Every amendment to the draft as a card, by number. */
export function amendmentCards(
	amendments: PaperAmendment[],
	context: AmendmentCardContext
): AmendmentCard[] {
	const { versions, rules, reader, sponsorsWord, timeZone, render } = context;
	const latest = versions.at(-1)?.content ?? { preamble: [], operative: [] };

	return [...amendments]
		.sort((first, second) => first.sequence - second.sequence)
		.map((amendment) => {
			const target = amendmentTarget(amendment, amendments, versions);

			return {
				id: amendment.id,
				sequence: amendment.sequence,
				name: amendmentName(amendment),
				statusWord: amendmentStatusWord(amendment.status),
				tone: amendmentStatusTone(amendment.status),
				// The sentence is one line, so the paragraph `renderMarkdown` wraps it in goes.
				sentenceHtml: render(amendmentSentence(amendment, target))
					.trim()
					.replace(/^<p>([\s\S]*)<\/p>$/, '$1'),
				metaLine: amendmentMetaLine(amendment, {
					rules,
					parent: target.parent,
					sponsorsWord,
					timeZone
				}),
				ruling: amendment.ruling,
				answersLine: answersLine(amendment, reader),
				anchorClauseId: anchorClauseId(amendment, latest),
				parentId: amendment.parentAmendmentId,
				choices: amendmentChoices(amendment, reader, rules),
				amendment
			};
		});
}

/**
 * The cards in the order they sit down the margin: in the order of the
 * clauses they sit beside, then by number, and those with no clause last.
 */
export function cardsInReadingOrder(
	cards: AmendmentCard[],
	latest: ClauseContent
): AmendmentCard[] {
	const order = new Map(numberedClauses(latest).map((clause, index) => [clause.id, index]));
	const placeOf = (card: AmendmentCard) =>
		card.anchorClauseId === null ? Infinity : (order.get(card.anchorClauseId) ?? Infinity);

	return [...cards].sort(
		(first, second) => placeOf(first) - placeOf(second) || first.sequence - second.sequence
	);
}

/** Where each card sits down the margin, by its id, and how tall the margin is to hold them. */
export type AmendmentLayout = { tops: Record<string, number>; height: number };

/**
 * Each card level with its clause, pushed down where the one before is in
 * the way, as the comments sit beside a paper being written. `clauseTop`
 * says where a clause's top is drawn, measured from the top of the margin,
 * or `null` for one not on screen; a card with no clause follows the one
 * before it. Hand the cards in reading order (`cardsInReadingOrder`).
 */
export function amendmentLayout(
	cards: AmendmentCard[],
	clauseTop: (clauseId: string) => number | null,
	heights: Record<string, number>,
	gap: number
): AmendmentLayout {
	const boxes = cards.map((card) => ({
		key: card.id,
		desiredTop: (card.anchorClauseId === null ? null : clauseTop(card.anchorClauseId)) ?? 0,
		height: heights[card.id] ?? 0
	}));
	const placed = placeCards(boxes, gap, null);

	return {
		tops: Object.fromEntries(boxes.map((box, index) => [box.key, placed[index]])),
		height: boxes.reduce((tallest, box, index) => Math.max(tallest, placed[index] + box.height), 0)
	};
}
