/**
 * A vote on an amendment, on the projector (`docs/committee-papers.md`,
 * section 6, "The projector", and step 7): what the room votes on, put the
 * way a chair puts it, "Strike clause 2", over the clause it changes and the
 * counts. `$lib/server/amendment-on-screen.ts` reads it; the display's
 * `DisplayAmendmentVote` draws it.
 *
 * Plain functions with no Svelte in them, so they can be tested on their own.
 */

import { clauseWithWord } from '$lib/amendment-record';
import type { AmendmentTarget } from '$lib/amendment-wording';
import type { VoteCounts } from '$lib/committee-room';
import type { PaperAmendment } from '$lib/paper-amendments';
import type { AmendmentScreenPage } from '$lib/paper-on-screen';

/** The amendment the room votes on, as the projector shows it. */
export type AmendmentOnScreen = {
	/** "Amendment 2" on its draft. */
	sequence: number;
	/** The draft it amends: "Draft resolution 1.1". */
	paperName: string;
	/** What it does, in a chair's words: "Strike clause 2". */
	headline: string;
	/** "Proposed by the United States · Unfriendly". */
	proposedLine: string;
	page: AmendmentScreenPage;
};

/**
 * What an amendment does, short enough to be read across a room: "Strike
 * clause 2", "Change clause 1(a)", "Add a clause after clause 4", or for an
 * amendment to an amendment, "Change amendment 2".
 */
export function amendmentHeadline(
	amendment: Pick<PaperAmendment, 'action' | 'targetPart'>,
	target: Pick<AmendmentTarget, 'clause' | 'parent'>
): string {
	const { clause, parent } = target;

	if (parent !== null) return `Change amendment ${parent.sequence}`;

	if (amendment.action === 'add') {
		if (clause !== null) return `Add a clause after ${clauseWithWord(clause)}`;

		return amendment.targetPart === 'preamble'
			? 'Add a clause at the start of the preamble'
			: 'Add a clause before clause 1';
	}

	const verb = amendment.action === 'strike' ? 'Strike' : 'Change';

	return clause === null ? `${verb} a clause` : `${verb} ${clauseWithWord(clause)}`;
}

/**
 * The first words of the names that are said with "the": the United States,
 * the Russian Federation, the Republic of Korea, the Holy See.
 */
const NAMES_STARTING_WITH_THE = [
	'Bolivarian ',
	'Central African ',
	'Czech ',
	'Democratic ',
	'Dominican ',
	'European ',
	'Federated ',
	'Holy ',
	'Islamic ',
	'Kingdom ',
	'Lao ',
	'Plurinational ',
	'Republic ',
	'Russian ',
	'State of ',
	'Syrian ',
	'United '
];

/** The last words of the names that are said with "the": the Netherlands, the Marshall Islands. */
const NAMES_ENDING_WITH_THE = [
	'Bahamas',
	'Comoros',
	'Congo',
	'Gambia',
	'Islands',
	'Maldives',
	'Netherlands',
	'Philippines',
	'Seychelles'
];

/** A seat's name as said after "proposed by": "the United States", but "Germany". */
export function seatNameInSentence(name: string): string {
	const takesThe =
		NAMES_STARTING_WITH_THE.some((start) => name.startsWith(start)) ||
		NAMES_ENDING_WITH_THE.some((end) => name.endsWith(end));

	return takesThe ? `the ${name}` : name;
}

/** "Proposed by the United States · Unfriendly", the grey line under the headline. */
export function proposedByLine(
	amendment: Pick<PaperAmendment, 'proposerName' | 'isFriendly'>
): string {
	const proposer =
		amendment.proposerName === null
			? 'a seat since removed'
			: seatNameInSentence(amendment.proposerName);

	return `Proposed by ${proposer} · ${amendment.isFriendly ? 'Friendly' : 'Unfriendly'}`;
}

/** "Voting on amendment 2 · Draft resolution 1.1", or "Voted on …" once the vote is closed. */
export function amendmentVoteLine(
	isClosed: boolean,
	amendment: Pick<AmendmentOnScreen, 'sequence' | 'paperName'>
): string {
	const verb = isClosed ? 'Voted on' : 'Voting on';

	return `${verb} amendment ${amendment.sequence} · ${amendment.paperName}`;
}

/** The projector's title: what the amendment does while the room votes, then "Amendment 2 passes". */
export function amendmentVoteTitle(
	vote: { isClosed: boolean; passed: boolean | null },
	amendment: Pick<AmendmentOnScreen, 'sequence' | 'headline'>
): string {
	if (!vote.isClosed) return amendment.headline;

	return `Amendment ${amendment.sequence} ${vote.passed ? 'passes' : 'fails'}`;
}

/** "38 of 43 have voted", under the bar while the vote is open; null when attendance is not known. */
export function votedLine(counts: VoteCounts, presentCount: number | null): string | null {
	if (presentCount === null) return null;

	const voted = counts.for + counts.against + counts.abstain;

	return `${voted} of ${presentCount} ${voted === 1 ? 'has' : 'have'} voted`;
}
