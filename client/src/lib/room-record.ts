/**
 * A session's record in one line, as the ended screen and the lobby's "Last
 * session" write it (`specs/05-pages/chair/committee-room.md`, "Ended"):
 * "2 h 14 min · 23 speeches · 4 motions, 3 passed · 1 vote: Draft Resolution
 * 1.1 passed".
 *
 * The record is read by `readSessionRecord` in
 * `$lib/server/committee-sessions.ts`. Plain functions with no Svelte in
 * them, so they can be read and tested on their own.
 */

import type { CommitteeSession } from '$lib/chair-room';
import { formatMinutes } from '$lib/suspension';

/** One vote of a session, decided: its subject and whether it passed. */
export type RecordedVote = {
	/** "Draft Resolution 1.1", or null for a vote the chair gave no subject. */
	subject: string | null;
	passed: boolean;
};

/** What a session did, counted once it has ended. */
export type SessionRecord = {
	/** The session counted, so a record is never shown under another session's name. */
	sessionId: string;
	/** The speeches made on any of its lists. */
	speechCount: number;
	/** Its motions that passed or failed, those started without a vote included. */
	decidedMotionCount: number;
	passedMotionCount: number;
	/** Its closed votes. */
	votes: RecordedVote[];
};

const MILLISECONDS_PER_MINUTE = 60 * 1000;

/** "23 speeches", "1 speech" or "no speeches". */
function speechesText(count: number): string {
	if (count === 0) return 'no speeches';
	if (count === 1) return '1 speech';

	return `${count} speeches`;
}

/** "4 motions, 3 passed", "1 motion, 1 passed" or "no motions". */
function motionsText(decidedCount: number, passedCount: number): string {
	if (decidedCount === 0) return 'no motions';

	const motions = decidedCount === 1 ? '1 motion' : `${decidedCount} motions`;

	return `${motions}, ${passedCount} passed`;
}

/** "passed" or "failed". */
function resultWord(vote: RecordedVote): string {
	return vote.passed ? 'passed' : 'failed';
}

/**
 * "2 votes, 1 passed", "no votes", or one vote by its subject: "1 vote:
 * Draft Resolution 1.1 passed".
 */
function votesText(votes: RecordedVote[]): string {
	if (votes.length === 0) return 'no votes';

	if (votes.length === 1) {
		const vote = votes[0];

		if (vote.subject === null) return `1 vote, ${resultWord(vote)}`;

		return `1 vote: ${vote.subject} ${resultWord(vote)}`;
	}

	const passedCount = votes.filter((vote) => vote.passed).length;

	return `${votes.length} votes, ${passedCount} passed`;
}

/** "23 speeches · 4 motions, 3 passed · 1 vote: Draft Resolution 1.1 passed". */
export function sessionRecordLine(record: SessionRecord): string {
	const parts = [
		speechesText(record.speechCount),
		motionsText(record.decidedMotionCount, record.passedMotionCount),
		votesText(record.votes)
	];

	return parts.join(' · ');
}

/**
 * How long a session ran, "2 h 14 min", in whole minutes. Null for a session
 * with no start or end on record.
 */
export function sessionLengthText(session: CommitteeSession): string | null {
	if (session.startedAt === null || session.endedAt === null) return null;

	const elapsed = new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
	const minutes = Math.max(0, Math.floor(elapsed / MILLISECONDS_PER_MINUTE));

	return formatMinutes(minutes);
}

/**
 * The record of `session` when `record` is about it, or null. The page reads
 * the record of the latest ended session; for a moment after "End session"
 * the screen already shows the session just ended while the record read is
 * still the one before, and that one must not be shown under its name.
 */
export function recordOfSession(
	record: SessionRecord | null,
	session: CommitteeSession
): SessionRecord | null {
	return record?.sessionId === session.id ? record : null;
}

/**
 * "2 h 14 min · 23 speeches · 4 motions, 3 passed · no votes": the length
 * and the record, either left out while it is unknown.
 */
export function sessionSummaryLine(
	session: CommitteeSession,
	record: SessionRecord | null
): string {
	const length = sessionLengthText(session);
	const shownRecord = recordOfSession(record, session);
	const parts = [length, shownRecord === null ? null : sessionRecordLine(shownRecord)];

	return parts.filter((part) => part !== null).join(' · ');
}
