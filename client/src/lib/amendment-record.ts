/**
 * The amendments on a passed paper's record copy (`docs/committee-papers.md`,
 * section 6, "The record", and step 7): a table of every amendment the
 * committee decided, what each did and how it ended. "Friendly; written in
 * on 15 March", "Failed, 12 to 25, with 6 abstentions", "Passed, 25 to 13,
 * with 6 abstentions; now clause 5".
 *
 * The record is printed, so its words are plain text, never Markdown. Plain
 * functions with no Svelte in them, so they can be tested on their own.
 */

import { amendmentTarget, type DraftVersion } from '$lib/amendment-cards';
import { clauseReference, wordChange, type WordChange } from '$lib/amendment-wording';
import { formatDayAndLongMonth } from '$lib/dashboard-dates';
import type { AmendmentStatus, PaperAmendment } from '$lib/paper-amendments';
import { numberedClauses, type ClauseContent, type NumberedClause } from '$lib/paper-clauses';
import type { PaperVote } from '$lib/paper-votes';
import { clausePlainText } from '$lib/resolution-phrases';

/** One row of the record's "Amendments" table. */
export type RecordedAmendment = {
	id: string;
	sequence: number;
	/** The seat that proposed it: "Germany". */
	proposedBy: string;
	/** What it did: "Strike clause 2", "Clause 1(a): adds “…”". */
	words: string;
	/** How it ended: "Friendly; written in on 15 March". */
	outcome: string;
};

/** The ends the committee decided, which the record lists; those ruled out or lapsed it leaves out. */
const DECIDED_STATUSES: AmendmentStatus[] = ['written_in', 'passed', 'failed'];

/** `words` without their Markdown, in double quotes, as the record copy is drawn. */
function quoted(words: string): string {
	return `“${clausePlainText(words).trim()}”`;
}

/** What a change did to a clause's words: "adds “…”", "replaces “…” with “…”". */
function changedWords(change: WordChange, after: string): string {
	if (change.kind === 'add') return `adds ${quoted(change.added)}`;
	if (change.kind === 'strike') return `strikes ${quoted(change.removed)}`;
	if (change.kind === 'replace') {
		return `replaces ${quoted(change.removed)} with ${quoted(change.added)}`;
	}
	if (change.kind === 'same') return 'no change to its words';

	return `to read ${quoted(after)}`;
}

/** A clause named in a sentence: "clause 4", "clause 1(a)" or "preambulatory clause 2". */
export function clauseWithWord(clause: NumberedClause): string {
	return clause.part === 'preamble' ? clauseReference(clause) : `clause ${clause.reference}`;
}

/** "Clause 4", for the start of a cell. */
function capitalised(words: string): string {
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What one amendment did, for the record's "Amendment" column: "Strike
 * clause 2", "Adds a clause after clause 4", "Clause 1(a): adds “…”", or for
 * an amendment to an amendment, "Amendment 2: replaces “…” with “…”".
 */
export function recordAmendmentWords(
	amendment: PaperAmendment,
	amendments: PaperAmendment[],
	versions: DraftVersion[]
): string {
	const { clause, before, parent } = amendmentTarget(amendment, amendments, versions);
	const text = amendment.textMarkdown ?? '';

	if (parent !== null) {
		return `Amendment ${parent.sequence}: ${changedWords(wordChange(before ?? '', text), text)}`;
	}

	if (amendment.action === 'strike') {
		return clause === null ? 'Strike a clause' : `Strike ${clauseWithWord(clause)}`;
	}

	if (amendment.action === 'add') {
		if (clause !== null) return `Adds a clause after ${clauseWithWord(clause)}`;

		return amendment.targetPart === 'preamble'
			? 'Adds a clause at the start of the preamble'
			: 'Adds a clause before clause 1';
	}

	const name = clause === null ? 'A clause' : capitalised(clauseWithWord(clause));

	return `${name}: ${changedWords(wordChange(before ?? '', text), text)}`;
}

/** ", with 6 abstentions", ", with 1 abstention", or nothing when nobody abstained. */
function abstentionWords(abstain: number): string {
	if (abstain === 0) return '';

	return `, with ${abstain} ${abstain === 1 ? 'abstention' : 'abstentions'}`;
}

/**
 * Where a passed addition now stands in the adopted text, "now clause 5",
 * found by the id the database gave the clause it added (`a` and the
 * amendment's number); null for anything else.
 */
export function addedClausePlace(amendment: PaperAmendment, adopted: ClauseContent): string | null {
	if (amendment.action !== 'add' || amendment.parentAmendmentId !== null) return null;

	const added = numberedClauses(adopted).find(
		(clause) => clause.part === amendment.targetPart && clause.id === `a${amendment.sequence}`
	);

	return added ? `now ${clauseWithWord(added)}` : null;
}

/**
 * How an amendment ended, for the record's "Outcome" column: "Friendly;
 * written in on 15 March", "Failed, 12 to 25, with 6 abstentions", or
 * "Passed, 25 to 13, with 6 abstentions; now clause 5". A vote MUNMeet does
 * not hold leaves the word alone: "Passed".
 */
export function amendmentOutcome(
	amendment: PaperAmendment,
	context: { vote: PaperVote | null; place: string | null; timeZone: string }
): string {
	const { vote, place, timeZone } = context;

	if (amendment.status === 'written_in') {
		const day = amendment.decidedAt
			? ` on ${formatDayAndLongMonth(amendment.decidedAt, timeZone)}`
			: '';

		return `${amendment.isFriendly ? 'Friendly; written in' : 'Written in'}${day}`;
	}

	const word = amendment.status === 'passed' ? 'Passed' : 'Failed';
	const tally =
		vote === null
			? ''
			: `, ${vote.counts.for} to ${vote.counts.against}${abstentionWords(vote.counts.abstain)}`;

	return `${word}${tally}${place ? `; ${place}` : ''}`;
}

/**
 * The record's "Amendments" table: every amendment the committee decided,
 * by number, against the draft's versions; `votes` holds the closed vote on
 * each, by the amendment's id. Empty when none was decided, and the table is
 * then left off the copy.
 */
export function recordedAmendments(
	amendments: PaperAmendment[],
	context: {
		versions: DraftVersion[];
		votes: Record<string, PaperVote>;
		timeZone: string;
	}
): RecordedAmendment[] {
	const { versions, votes, timeZone } = context;
	const adopted = versions.at(-1)?.content ?? { preamble: [], operative: [] };

	return amendments
		.filter((amendment) => DECIDED_STATUSES.includes(amendment.status))
		.sort((first, second) => first.sequence - second.sequence)
		.map((amendment) => ({
			id: amendment.id,
			sequence: amendment.sequence,
			proposedBy: amendment.proposerName ?? 'A seat since removed',
			words: recordAmendmentWords(amendment, amendments, versions),
			outcome: amendmentOutcome(amendment, {
				vote: votes[amendment.id] ?? null,
				place: amendment.status === 'passed' ? addedClausePlace(amendment, adopted) : null,
				timeZone
			})
		}));
}
