/**
 * What the chair's Vote view draws (`specs/05-pages/chair/voting.md`): which
 * of its four drawings the room asks for, who is voting, and every line of
 * words on it, from "13 present, 2 of them present and voting" to "Draft
 * Resolution 1.1 passes", and where the tally bar's mark sits.
 *
 * Plain functions, so they can be read and tested without Svelte. The shapes
 * and the form rules are in `$lib/votes.ts`; whether a vote passes is
 * `voteResult` in `$lib/committee-room.ts`.
 */

import type { ResolvedPathname } from '$app/types';
import type { ChairMotion, CommitteeSession, CommitteeStateView } from '$lib/chair-room';
import {
	countPresent,
	quorum,
	voteResult,
	votesNeeded,
	type AttendanceStatus,
	type MajorityType,
	type Quorum,
	type RoomSeat,
	type VoteCounts
} from '$lib/committee-room';
import { formatTimeOfDay } from '$lib/dates';
import { closedVoteCounts, formatTally, totalVotes, type SessionVote } from '$lib/votes';

/**
 * The part of the chair layout's data the Vote view reads: the room, the
 * seats and the latest roll call. `chair/voting` and `chair` hand their
 * `data` over as it is.
 */
export type VoteViewFrame = {
	conference: { slug: string; timezone: string };
	committee: { slug: string };
	committeeState: CommitteeStateView;
	currentSession: CommitteeSession | null;
	currentMotion: ChairMotion | null;
	seats: RoomSeat[];
	/** The latest roll call of the session, keyed by seat id; empty before one. */
	attendance: Record<string, AttendanceStatus>;
	latestRollCallId: string | null;
};

/** What "Cancel vote" needs to ask its question in place, with JavaScript or without. */
export type CancelVoteLinks = {
	/** `?cancel=confirm` is in the address: the question is asked at once. */
	isConfirming: boolean;
	/** The page with `?cancel=confirm`, where "Cancel vote" leads without JavaScript. */
	confirmHref: ResolvedPathname;
	/** The page without it, where "Keep voting" leads without JavaScript. */
	keepHref: ResolvedPathname;
};

/** The four drawings of the view: the set-up, a hand count, a roll call vote and the result. */
export type VoteScreen = 'setup' | 'handCount' | 'rollCall' | 'result';

/** What decides which drawing the view shows. */
export type VoteScreenFacts = {
	/** The room's current vote, open or closed, or null. */
	currentVote: Pick<SessionVote, 'status' | 'method'> | null;
	/** Whether `committee_state.mode` is `voting`. */
	isRoomVoting: boolean;
	/** `?vote=new`: "Open another vote" was pressed while a result is on show. */
	isNewVoteShown: boolean;
};

/** Who is in the room for a vote, from the latest roll call. */
export type VoteAttendance = {
	/** The seats marked present or present and voting, in alphabetical order, as a roll call vote is read. */
	votingSeats: RoomSeat[];
	presentCount: number;
	/** The seats marked "present and voting", which may not abstain. */
	presentAndVotingSeatIds: string[];
	/** Every seat the committee has. */
	seatCount: number;
	quorum: Quorum;
};

/** The set-up's line about the room, and whether it warns. */
export type AttendanceLine = {
	text: string;
	/** True below quorum: the line is drawn in the warning tone, and blocks nothing. */
	isBelowQuorum: boolean;
};

/** Where the tally bar's parts sit, as percentages of its width. */
export type TallyBarGeometry = {
	forPercent: number;
	againstPercent: number;
	/** Where the majority is met: `needed` of the votes cast for and against. */
	markPercent: number;
	/** The votes for that pass the vote as the count stands. */
	needed: number;
	/** Which way the mark's words hang from the mark, so they never run off either end. */
	markAlign: 'start' | 'center' | 'end';
};

/** A show of hands as the chair is counting it. An emptied field is null and counts as 0. */
export type HandCountDraft = {
	for: number | null;
	against: number | null;
	abstain: number | null;
};

/** How far from either end the mark's words stop being centred on it, in percent. */
const MARK_EDGE_PERCENT = 15;

/**
 * The drawing the room asks for (voting.md, "What the view draws"). An open
 * vote is counted by hands or called by roll; a closed one shows its result
 * until "End voting", or until "Open another vote" asks for the set-up; with
 * no vote at all, the set-up.
 */
export function voteScreen(facts: VoteScreenFacts): VoteScreen {
	const vote = facts.currentVote;

	if (vote?.status === 'open') return vote.method === 'roll_call' ? 'rollCall' : 'handCount';
	if (vote?.status === 'closed' && facts.isRoomVoting && !facts.isNewVoteShown) return 'result';

	return 'setup';
}

/** Who may vote, by the latest roll call: the seats it marked present, alphabetically. */
export function voteAttendance(
	seats: RoomSeat[],
	attendance: Record<string, AttendanceStatus>
): VoteAttendance {
	const isPresent = (seat: RoomSeat) =>
		attendance[seat.id] === 'present' || attendance[seat.id] === 'present_and_voting';
	const present = seats.filter(isPresent);
	// `sort` changes the array it is given, which is a copy here.
	const votingSeats = present.sort((first, second) => first.name.localeCompare(second.name));
	const presentAndVotingSeatIds = votingSeats
		.filter((seat) => attendance[seat.id] === 'present_and_voting')
		.map((seat) => seat.id);
	const presentCount = countPresent(attendance);

	return {
		votingSeats,
		presentCount,
		presentAndVotingSeatIds,
		seatCount: seats.length,
		quorum: quorum(presentCount, seats.length)
	};
}

/**
 * The set-up's line about the room: "13 present, 2 of them present and
 * voting", "13 present" when nobody is present and voting, or below quorum
 * "No quorum: 3 of 8 present", which warns but stops nothing.
 */
export function attendanceLine(room: VoteAttendance): AttendanceLine {
	if (!room.quorum.hasQuorum) {
		return {
			text: `No quorum: ${room.presentCount} of ${room.seatCount} present`,
			isBelowQuorum: true
		};
	}

	const presentAndVoting = room.presentAndVotingSeatIds.length;
	const present = `${room.presentCount} present`;
	const text =
		presentAndVoting === 0 ? present : `${present}, ${presentAndVoting} of them present and voting`;

	return { text, isBelowQuorum: false };
}

/** The majority in words, after the attendance line. */
export function majorityInWords(majority: MajorityType | string): string {
	if (majority === 'two_thirds') {
		return 'two-thirds majority: two thirds of those voting for or against';
	}

	return 'simple majority: more for than against';
}

/**
 * The words after a vote's subject in its heading: "substantive · simple
 * majority", with "roll call" first for a roll call vote.
 */
export function voteMeta(vote: Pick<SessionVote, 'kind' | 'majority' | 'method'>): string {
	const majority = vote.majority === 'two_thirds' ? 'two-thirds majority' : 'simple majority';
	const parts = [vote.kind, majority];

	if (vote.method === 'roll_call') parts.unshift('roll call');

	return parts.join(' · ');
}

/** The result as the view and the projector say it: "Draft Resolution 1.1 passes". */
export function resultTitle(vote: Pick<SessionVote, 'subject' | 'passed'>): string {
	return `${vote.subject} ${vote.passed ? 'passes' : 'fails'}`;
}

/** The counts in words under a result: "9 for · 4 against · 2 abstentions" ("1 abstention"). */
export function countsInWords(counts: VoteCounts): string {
	const abstentions = counts.abstain === 1 ? '1 abstention' : `${counts.abstain} abstentions`;

	return `${counts.for} for · ${counts.against} against · ${abstentions}`;
}

/** A show of hands' counts as the chair has typed or stepped them, an empty field as 0. */
export function draftCounts(draft: HandCountDraft): VoteCounts {
	return { for: draft.for ?? 0, against: draft.against ?? 0, abstain: draft.abstain ?? 0 };
}

/** A saved show of hands as the steppers start from: 0 where nothing is counted yet. */
export function handCountDraftOf(
	vote: Pick<SessionVote, 'votesFor' | 'votesAgainst' | 'votesAbstain'>
): HandCountDraft {
	return {
		for: vote.votesFor ?? 0,
		against: vote.votesAgainst ?? 0,
		abstain: vote.votesAbstain ?? 0
	};
}

/**
 * Whether a count is worth saving as the chair counts (`count`): every field
 * holds a number, and no more hands than delegates present, which the server
 * would refuse.
 */
export function isSavableCount(draft: HandCountDraft, presentCount: number): boolean {
	if (draft.for === null || draft.against === null || draft.abstain === null) return false;

	return totalVotes(draftCounts(draft)) <= presentCount;
}

/** The sentence under a show of hands, as it stands. */
export function handCountWords(counts: VoteCounts, majority: MajorityType): string {
	if (totalVotes(counts) === 0) return 'Count the hands for, then against, then abstentions.';

	return voteResult(counts, majority) ? 'As counted, it passes.' : 'As counted, it fails.';
}

/** The primary of an open vote, named for the count as it stands: "Close vote: passes". */
export function closeVoteLabel(counts: VoteCounts, majority: MajorityType): string {
	return `Close vote: ${voteResult(counts, majority) ? 'passes' : 'fails'}`;
}

/** Under a roll call vote's counts: "3 to call". */
export function toCallText(count: number): string {
	return `${count} to call`;
}

/** A closed vote's result as one word: "Passed" or "Failed". */
export function closedVoteWord(vote: Pick<SessionVote, 'passed'>): string {
	return vote.passed ? 'Passed' : 'Failed';
}

/** A closed vote's line in "Votes this session": "5–8–1 · simple majority · 11:02". */
export function voteHistoryLine(vote: SessionVote, timeZone: string): string {
	const majority = vote.majority === 'two_thirds' ? 'two-thirds majority' : 'simple majority';
	const parts = [formatTally(closedVoteCounts(vote)), majority];

	if (vote.closedAt !== null) parts.push(formatTimeOfDay(vote.closedAt, timeZone));

	return parts.join(' · ');
}

/**
 * Where the tally bar's parts sit: For against Against, abstentions left out,
 * and the mark where the majority is met, `votesNeeded` of the votes cast.
 * With nothing cast yet the mark sits at a half, or two thirds.
 */
export function tallyBarGeometry(counts: VoteCounts, majority: MajorityType): TallyBarGeometry {
	const cast = counts.for + counts.against;
	const needed = votesNeeded(counts, majority);
	const emptyMark = majority === 'two_thirds' ? 66.7 : 50;
	const markPercent = cast === 0 ? emptyMark : Math.min(100, (needed / cast) * 100);
	let markAlign: TallyBarGeometry['markAlign'] = 'center';

	if (markPercent < MARK_EDGE_PERCENT) markAlign = 'start';
	if (markPercent > 100 - MARK_EDGE_PERCENT) markAlign = 'end';

	return {
		forPercent: cast === 0 ? 0 : (counts.for / cast) * 100,
		againstPercent: cast === 0 ? 0 : (counts.against / cast) * 100,
		markPercent,
		needed,
		markAlign
	};
}
