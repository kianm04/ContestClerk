/**
 * What a motion's count means, under the For and Against steppers of "Next to
 * vote" (`specs/05-pages/chair/motions.md`, "`motion-count.ts`"): the line
 * that says what the count means, which of Pass and Fail is the primary, and
 * why the other one is disabled.
 *
 * Counting is optional. With no count the chair simply presses Pass or Fail,
 * as in myMUN, and the two buttons are equal. Once either count is entered,
 * the line says how the count comes out and the button that agrees with it is
 * the one filled button. Procedural motions pass on a simple majority of the
 * seats present (`simpleMajority` in `$lib/committee-room.ts`), so only the
 * votes for decide it.
 */

import { countPresent, type AttendanceStatus } from '$lib/committee-room';
import { MOTION_REFUSALS, type MotionResult, type MotionTally } from '$lib/motions';

/** What the count is worked out from. */
export type MotionCountFacts = {
	/** The hands counted for, or null while that field is empty. */
	votesFor: number | null;
	/** The hands counted against, or null while that field is empty. */
	votesAgainst: number | null;
	/** The seats present, or every seat before the session's first roll call. */
	presentCount: number;
	/** The votes for that pass the motion: `simpleMajority(presentCount)`. */
	majority: number;
	/** Whether the session has had a roll call yet. */
	hasRollCall: boolean;
};

/** The line under the counts, in the pieces the view draws in different weights. */
export type MotionCountLine = {
	/** "Passes with 7 for, a simple majority of the 13 present." */
	majority: string;
	/** "As counted, it passes." or "As counted, it fails.", once a count is entered; otherwise null. */
	verdict: string | null;
	/** "No roll call yet." before the session's first roll call, in a quiet tone; otherwise null. */
	rollCallNote: string | null;
};

/** One of the two decision buttons. */
export type MotionDecisionButton = 'pass' | 'fail';

/** How the decision row draws Pass and Fail. */
export type MotionDecision = {
	/** The filled button, or null while nothing is counted and the two are equal. */
	primary: MotionDecisionButton | null;
	/** The button the count disagrees with, drawn disabled, or null. */
	disabled: MotionDecisionButton | null;
	/** Beside the disabled button: "4 for is short of 7" or "9 for is enough to pass"; otherwise null. */
	reason: string | null;
};

/** Whether the chair has entered a count. Once either field is filled, an empty one counts as 0. */
export function hasMotionCount(facts: MotionCountFacts): boolean {
	return facts.votesFor !== null || facts.votesAgainst !== null;
}

/** Whether the count passes the motion: at least a majority of the seats present voted for. */
function countPasses(facts: MotionCountFacts): boolean {
	const votesFor = facts.votesFor ?? 0;

	return votesFor >= facts.majority;
}

/**
 * The line under the counts. Before any count it says only what passing
 * takes; once counted it adds how the count comes out. Before the session's
 * first roll call every seat counts as present, so it speaks of seats rather
 * than of those present, and notes that no roll call has been taken.
 */
export function motionCountLine(facts: MotionCountFacts): MotionCountLine {
	const counted = facts.hasRollCall ? 'present' : 'seats';
	const majority = `Passes with ${facts.majority} for, a simple majority of the ${facts.presentCount} ${counted}.`;
	const verdict = countPasses(facts) ? 'As counted, it passes.' : 'As counted, it fails.';

	return {
		majority,
		verdict: hasMotionCount(facts) ? verdict : null,
		rollCallNote: facts.hasRollCall ? null : 'No roll call yet.'
	};
}

/**
 * How Pass and Fail are drawn. Without a count neither is filled: a choice
 * between two answers is not a next step. With one, the button that matches
 * it is the primary and the other is disabled with the reason.
 */
export function motionDecision(facts: MotionCountFacts): MotionDecision {
	if (!hasMotionCount(facts)) return { primary: null, disabled: null, reason: null };

	const votesFor = facts.votesFor ?? 0;

	if (countPasses(facts)) {
		return { primary: 'pass', disabled: 'fail', reason: `${votesFor} for is enough to pass` };
	}

	return {
		primary: 'fail',
		disabled: 'pass',
		reason: `${votesFor} for is short of ${facts.majority}`
	};
}

/**
 * The seats a motion's majority is counted from: those present at the
 * session's latest roll call, or every seat before the session has one, since
 * every seat counts as present until the roll is called
 * (`specs/06-features/chairing.md`, "Concepts").
 */
export function motionPresentCount(
	seatCount: number,
	attendance: Record<string, AttendanceStatus>,
	hasRollCall: boolean
): number {
	return hasRollCall ? countPresent(attendance) : seatCount;
}

/**
 * Why Pass or Fail is refused for the count as typed, or null when it may go
 * ahead (`motions.md`, "`vote`", rules 3 and 4): more votes than seats
 * present, or a count that says the opposite of the button pressed. With
 * JavaScript the button that disagrees is disabled, so only a page without it
 * meets the second. A motion decided without counting (`tally` null) is never
 * refused here.
 */
export function motionCountRefusal(
	result: MotionResult,
	tally: MotionTally | null,
	presentCount: number,
	majority: number
): string | null {
	if (tally === null) return null;
	if (tally.votesFor + tally.votesAgainst > presentCount) return MOTION_REFUSALS.tooManyVotes;

	const passes = tally.votesFor >= majority;

	if (result === 'passed' && !passes) return MOTION_REFUSALS.countSaysFails;
	if (result === 'failed' && passes) return MOTION_REFUSALS.countSaysPasses;

	return null;
}
