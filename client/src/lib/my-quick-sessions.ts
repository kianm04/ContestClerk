/**
 * Quick sessions as `/home` lists them under "Quick sessions" (`docs/home.md`,
 * section 3.9), and the one rule every other list follows to leave them out
 * (S14, D7).
 *
 * A quick session is a draft conference of `kind = 'quick_session'` holding one
 * committee, which its creator chairs and, through a personal organisation,
 * organises (`05-pages/chair/quick-session.md`). It would otherwise turn up in
 * every list of conferences and committees a person has, so each of those
 * readers asks `isQuickSession` of the conference it brings along.
 *
 * Plain functions with no Svelte and no database in them, so the browser and
 * the server can both import this file and a test can call them directly.
 */

import type { ResolvedPathname } from '$app/types';
import { dayInTimezone, formatDateRange } from '$lib/dates';
import { chairRoomUrl } from '$lib/urls';

/** What `conferences.kind` holds: an ordinary conference, or a quick session (D7). */
export type ConferenceKind = 'conference' | 'quick_session';

/** The three states of a `committee_sessions` row. */
export type QuickSessionStatus = 'scheduled' | 'in_progress' | 'ended';

/** The quiet line of a quick session that has never run. */
export const NO_SESSION_YET = 'No session yet';

/**
 * Whether a conference, read with its `kind`, is a quick session. A conference
 * read without `kind` counts as an ordinary one, so a reader that does not ask
 * for the column keeps everything it had.
 */
export function isQuickSession(conference: { kind?: ConferenceKind | null }): boolean {
	return conference.kind === 'quick_session';
}

/** A quick session's newest `committee_sessions` row, as `/home` reads it. */
export type LatestQuickSession = {
	/** "Session 2". */
	name: string;
	status: QuickSessionStatus;
	/** When it started, an ISO timestamp, or null while it has not. */
	startedAt: string | null;
};

/**
 * Whether a session is running right now: the newest row is `in_progress` and
 * has started. The status line and the row's "In progress" dot both ask this
 * one question, so the words and the dot can never disagree.
 */
export function isQuickSessionInProgress(latestSession: LatestQuickSession | null): boolean {
	return (
		latestSession !== null &&
		latestSession.startedAt !== null &&
		latestSession.status === 'in_progress'
	);
}

/** One quick session the reader chairs, as the server has read it. */
export type QuickSessionSource = {
	committeeId: string;
	/** The committee's name, which is also the quick session's: "Thursday practice". */
	committeeName: string;
	committeeSlug: string;
	conferenceSlug: string;
	/** The conference's timezone, which the day of its last session is read in. */
	timezone: string;
	/** When the committee was made, which places a quick session that never ran. */
	committeeCreatedAt: string;
	/** Its newest session, or null before the first. */
	latestSession: LatestQuickSession | null;
};

/** One row of "Quick sessions". */
export type MyQuickSession = {
	committeeId: string;
	committeeName: string;
	/** "Session 2 in progress", "Last session 24 Sept 2026" or "No session yet". */
	statusLine: string;
	/** Whether a session is running right now, which the row marks "In progress". */
	isInProgress: boolean;
	/** The committee's chair room, which opens on its lobby, its session or its ended screen. */
	href: ResolvedPathname;
};

/**
 * A quick session's quiet line: "Session 2 in progress" while one runs, "Last
 * session 24 Sept 2026" once one has ended (the day it started, in the quick
 * session's own timezone), and "No session yet" otherwise.
 */
export function quickSessionStatusLine(
	latestSession: LatestQuickSession | null,
	timezone: string
): string {
	if (latestSession === null || latestSession.startedAt === null) return NO_SESSION_YET;
	if (isQuickSessionInProgress(latestSession)) return `${latestSession.name} in progress`;
	if (latestSession.status !== 'ended') return NO_SESSION_YET;

	const day = dayInTimezone(new Date(latestSession.startedAt), timezone);

	// A range from a day to the same day is that one day written out: "24 Sept 2026".
	return `Last session ${formatDateRange(day, day)}`;
}

/** When a quick session was last used: its newest session's start, or else when it was made. */
function lastUsedMoment(source: QuickSessionSource): number {
	const moment = source.latestSession?.startedAt ?? source.committeeCreatedAt;

	return Date.parse(moment);
}

/** The rows of "Quick sessions", most recently used first. */
export function toMyQuickSessions(sources: QuickSessionSource[]): MyQuickSession[] {
	const newestFirst = [...sources].sort(
		(first, second) => lastUsedMoment(second) - lastUsedMoment(first)
	);

	return newestFirst.map((source) => ({
		committeeId: source.committeeId,
		committeeName: source.committeeName,
		statusLine: quickSessionStatusLine(source.latestSession, source.timezone),
		isInProgress: isQuickSessionInProgress(source.latestSession),
		href: chairRoomUrl(source.conferenceSlug, source.committeeSlug)
	}));
}
