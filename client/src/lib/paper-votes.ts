/**
 * Voting on committee papers, and the record they leave
 * (`docs/committee-papers.md`, section 6, and step 8 of its build order).
 *
 * The chair still records every vote (section 3, rule 10). The vote form
 * lists what may be voted on; a vote opened from that list carries the
 * paper's id (`votes.paper_id`), and closing it settles the paper: the
 * database's `settle_vote_paper` trigger marks it passed or failed in the
 * same transaction. Everything here only shapes words and lists, so the
 * browser and the server both use it. Reading is `$lib/server/paper-votes.ts`.
 */

import { paperKindAndNumber, type PaperName, type PaperStatus } from '$lib/committee-papers';
import type { VoteCounts } from '$lib/committee-room';
import { formatDayAndLongMonth } from '$lib/dashboard-dates';
import { formatTimeOfDay } from '$lib/dates';
import type { PaperHeadingLine } from '$lib/paper-sheet';
import { paperShownOnScreen, type FloorPaper } from '$lib/papers-on-floor';
import type { ResolutionHeading } from '$lib/resolution-heading';
import type { RoomScreen } from '$lib/room-screen';
import { countsInWords } from '$lib/vote-view';
import { OTHER_VOTE_SUBJECT, type VoteSubject } from '$lib/votes';

/** The id the vote form's list and its label share. */
export const VOTE_PAPER_FIELD_ID = 'vote-paper';

/** The line under the list without JavaScript, when the typed subject is always drawn too. */
export const VOTE_PAPER_FIELD_HELP = 'For Other, type what the committee votes on below.';

/** How the vote on a paper went, from the closed vote tied to it. */
export type PaperVote = {
	passed: boolean;
	counts: VoteCounts;
	/** When the chair closed the vote, which is when the paper passed or failed. */
	closedAt: string;
};

/** One line of the vote form's list, as FormSelect draws it. */
export type VoteSubjectChoice = { value: string; label: string; detail?: string };

/**
 * What the committee may vote on, in the order it votes (section 6, "The vote
 * view"): the approved unfriendly amendments first, then, once a motion to
 * close debate has passed, the introduced drafts by number.
 *
 * Amendments may be put to the vote at any time, which is when THIMUN-style
 * committees take them, so they are always listed, in the order
 * `amendmentVoteSubjects` puts them.
 */
export function voteSubjects(lists: {
	amendments: VoteSubject[];
	drafts: FloorPaper[];
	isDebateClosed: boolean;
}): VoteSubject[] {
	const drafts = lists.isDebateClosed ? lists.drafts : [];

	return [...lists.amendments, ...drafts];
}

/** An amendment the dais approved, which waits for the committee's vote. */
export type ApprovedAmendment = {
	id: string;
	/** The draft it amends. */
	paperId: string;
	sequence: number;
	/** The amendment it changes, for an amendment to an amendment; else `null`. */
	parentId: string | null;
};

/** Lower numbers first. */
function bySequence(first: ApprovedAmendment, second: ApprovedAmendment): number {
	return first.sequence - second.sequence;
}

/**
 * The approved amendments as the vote form lists them: draft by draft, in
 * the drafts' order, each amendment by its number, with the amendments to it
 * just before it, as the committee votes on those first (`check_vote_paper`
 * refuses the other order). An amendment to an amendment the dais has not
 * yet approved cannot be voted on, so it waits off the list. Each is named
 * as the database names its vote: "Amendment 2 to Draft resolution 1.1".
 */
export function amendmentVoteSubjects(
	drafts: FloorPaper[],
	amendments: ApprovedAmendment[]
): VoteSubject[] {
	return drafts.flatMap((draft) => {
		const own = amendments.filter((amendment) => amendment.paperId === draft.id);
		const parents = own.filter((amendment) => amendment.parentId === null).sort(bySequence);
		const childrenOf = (parent: ApprovedAmendment) =>
			own.filter((amendment) => amendment.parentId === parent.id).sort(bySequence);
		// Each child is placed just before its parent, so one whose parent is not
		// in the list, not yet approved, is never placed at all.
		const ordered = parents.flatMap((parent) => [...childrenOf(parent), parent]);

		return ordered.map((amendment) => ({
			id: amendment.id,
			name: `Amendment ${amendment.sequence} to ${draft.name}`,
			title: draft.title,
			isAmendment: true
		}));
	});
}

/** The lines of the list: each subject by its name with its title beside it, then Other. */
export function voteSubjectChoices(subjects: FloorPaper[]): VoteSubjectChoice[] {
	const paperChoices = subjects.map((subject) => ({
		value: subject.id,
		label: subject.name,
		detail: subject.title
	}));

	return [...paperChoices, { value: OTHER_VOTE_SUBJECT, label: 'Other' }];
}

/** True for the two statuses a vote leaves a paper in. */
export function isVotedStatus(status: PaperStatus): boolean {
	return status === 'passed' || status === 'failed';
}

/**
 * How the vote went, for the line under a voted paper's title: "Passed 16
 * March, 16:40 · 31 for · 6 against · 7 abstentions", or "Failed" alone for a
 * paper settled without a vote MUNMeet holds. Null for a paper not voted on.
 */
export function votedWord(
	paper: { status: PaperStatus; vote?: PaperVote | null },
	timeZone: string
): string | null {
	if (!isVotedStatus(paper.status)) return null;

	const word = paper.status === 'passed' ? 'Passed' : 'Failed';
	const vote = paper.vote ?? null;

	if (vote === null) return word;

	const when = `${formatDayAndLongMonth(vote.closedAt, timeZone)}, ${formatTimeOfDay(vote.closedAt, timeZone)}`;

	return `${word} ${when} · ${countsInWords(vote.counts)}`;
}

/**
 * What the record calls a paper: a draft resolution that passed is a
 * resolution, "Resolution 1.1" (section 2); any other paper keeps its name.
 */
export function recordName(paper: PaperName & { status: PaperStatus }): string {
	const name = paperKindAndNumber(paper);

	if (paper.kind !== 'draft_resolution' || paper.status !== 'passed') return name;

	return name.replace(/^Draft resolution/, 'Resolution');
}

/** "16 March 2027": the day a moment falls on in `timeZone`, written in full for the record. */
export function recordDay(moment: string, timeZone: string): string {
	return new Intl.DateTimeFormat('en-GB', {
		timeZone,
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(new Date(moment));
}

/** "31 votes", "1 vote". */
function votesInWords(count: number): string {
	return count === 1 ? '1 vote' : `${count} votes`;
}

/**
 * The record copy's line under its title: "Adopted on 16 March 2027 by 31
 * votes to 6, with 7 abstentions." Without a vote, as for a paper settled
 * before MUNMeet held its votes, the day it was decided alone.
 */
export function adoptedSentence(
	decidedAt: string,
	vote: PaperVote | null,
	timeZone: string
): string {
	const day = recordDay(vote?.closedAt ?? decidedAt, timeZone);

	if (vote === null) return `Adopted on ${day}.`;

	const { counts } = vote;
	const tally = `Adopted on ${day} by ${votesInWords(counts.for)} to ${counts.against}`;

	// A record says nothing of abstentions when there were none.
	if (counts.abstain === 0) return `${tally}.`;

	const abstentions = counts.abstain === 1 ? '1 abstention' : `${counts.abstain} abstentions`;

	return `${tally}, with ${abstentions}.`;
}

/** The record copy's last line: "Record copy, printed from MUNMeet on 16 March 2027." */
export function printedLine(now: Date, timeZone: string): string {
	return `Record copy, printed from MUNMeet on ${recordDay(now.toISOString(), timeZone)}.`;
}

/** What `resolutionHeading` writes for a line with nobody on it yet. */
const NOBODY_YET = 'None yet';

/**
 * The facts under the record copy's title: the conference, then the
 * heading's lines (committee, topic, sponsors and signatories, or a
 * THIMUN committee's submitters), as the drawing sets them.
 */
export function recordFacts(
	conferenceName: string,
	heading: ResolutionHeading
): PaperHeadingLine[] {
	// The heading's "None yet" is for a paper still gathering names; the record is final.
	const lines = heading.lines.map((line) =>
		line.value === NOBODY_YET ? { ...line, value: 'None' } : line
	);

	return [{ label: 'Conference', value: conferenceName }, ...lines];
}

/** The live view's word before the paper the room votes on: "Voting on", then "Voted on". */
export function liveVoteWord(isVoteOpen: boolean): string {
	return isVoteOpen ? 'Voting on' : 'Voted on';
}

/** The paper the room's current vote is on, and whether that vote is still open. */
export type RoomPaperVote = { paper: FloorPaper; isOpen: boolean };

/**
 * The live view's one line under the floor, linking the paper the room is
 * busy with (`docs/committee-papers.md`, section 6): the paper being voted
 * on, or just voted on, while the vote has the screen; otherwise the paper
 * on the projector while the room debates. Null when there is neither.
 */
export function livePaperLine(
	screen: RoomScreen,
	displayedPaper: FloorPaper | null,
	votedPaper: RoomPaperVote | null
): { word: string; paper: FloorPaper } | null {
	if (screen.kind === 'vote') {
		return votedPaper && { word: liveVoteWord(votedPaper.isOpen), paper: votedPaper.paper };
	}

	const shown = paperShownOnScreen(screen, displayedPaper);

	return shown && { word: 'On screen', paper: shown };
}
