/**
 * What the live room's ended screen shows, and the one choice it makes:
 * whether the next session or "Propose awards" is the step to take
 * (`05-pages/chair/committee-room.md`, "Ended", S11, R1, R19; a quick
 * session's, S14).
 *
 * Plain functions with no Svelte in them, so they can be read and tested on
 * their own. The rows they read are loaded by the chair layout and the live
 * room's `load`.
 */

import type { ResolvedPathname } from '$app/types';
import { sessionSummaryLine } from '$lib/room-record';
import {
	isBeforeConferenceStart,
	latestEndedSession,
	nextSessionName,
	scheduleLineText,
	type LobbyFacts,
	type LobbyRoom
} from '$lib/room-ready';
import type { ScheduleEvent } from '$lib/schedule';
import {
	chairAwardsUrl,
	chairMotionsSessionUrl,
	chairSessionNotesUrl,
	quickSessionDelegationsUrl
} from '$lib/urls';

/**
 * Whether the session that just ended was the conference's last: the
 * conference is over, or its last day has come with no later event on the
 * schedule for this committee. All days are `YYYY-MM-DD` in the conference's
 * own timezone, which sort as text in date order.
 */
export function isLastSessionOfConference(
	today: string,
	endDate: string,
	nextScheduleEvent: ScheduleEvent | null
): boolean {
	if (today > endDate) return true;

	return today === endDate && nextScheduleEvent === null;
}

/**
 * The ended screen's one filled button (P1): the next session, "Propose
 * awards" after the conference's last session, or none after a practice
 * session.
 */
export type EndedPrimary = 'start' | 'awards' | 'none';

/** Everything `EndedSummary.svelte` draws, worked out by `endedSummaryView`. */
export type EndedSummaryView = {
	/** The page's heading: "Session 1 has ended". */
	title: string;
	/** "2 h 14 min · 23 speeches · 4 motions, 3 passed · 1 vote: …". */
	summaryLine: string;
	primary: EndedPrimary;
	/** "Start Session 2", "Start another session" or "Start another practice session". */
	startLabel: string;
	/** "Propose awards", or null after a practice session and in a quick session. */
	awardsHref: ResolvedPathname | null;
	/** The Motions page's record of the session. */
	recordHref: ResolvedPathname;
	/** The session's notes, or null in a quick session. */
	notesHref: ResolvedPathname | null;
	/**
	 * A quick session's "Edit delegations" (`/quick/[slug]/delegations`), so its
	 * chair can change the members between sessions on the day one ends; null
	 * elsewhere.
	 */
	editDelegationsHref: ResolvedPathname | null;
	/** "Session 2 · 09:30, Council Chamber", or null with nothing later, and in a quick session. */
	nextOnSchedule: string | null;
};

/** The ended screen's step and its start button's words, by the day and the kind of committee. */
function endedStep(
	room: LobbyRoom,
	facts: LobbyFacts,
	nextName: string
): { primary: EndedPrimary; startLabel: string } {
	const { conference, today } = room;

	// A quick session has no awards, and its last day is always today (S14).
	if (facts.isQuickSession) return { primary: 'start', startLabel: `Start ${nextName}` };

	if (isBeforeConferenceStart(today, conference.startDate)) {
		return { primary: 'none', startLabel: 'Start another practice session' };
	}

	if (isLastSessionOfConference(today, conference.endDate, facts.nextScheduleEvent)) {
		return { primary: 'awards', startLabel: 'Start another session' };
	}

	return { primary: 'start', startLabel: `Start ${nextName}` };
}

/**
 * The ended screen's lines and links, from the chair layout's rows and the
 * live room's facts. Null while no session has ended, which the room's state
 * rules out whenever it draws this screen.
 */
export function endedSummaryView(room: LobbyRoom, facts: LobbyFacts): EndedSummaryView | null {
	const { conference, committee, today, sessions } = room;
	const session = latestEndedSession(sessions);

	if (session === null) return null;

	const isQuick = facts.isQuickSession;
	const nextName = nextSessionName(sessions, conference, today, isQuick);
	const step = endedStep(room, facts, nextName);
	const hasAwards = !isQuick && step.primary !== 'none';
	const nextEvent = isQuick ? null : facts.nextScheduleEvent;

	return {
		title: `${session.name} has ended`,
		summaryLine: sessionSummaryLine(session, facts.lastSessionRecord),
		...step,
		awardsHref: hasAwards ? chairAwardsUrl(conference.slug, committee.slug) : null,
		recordHref: chairMotionsSessionUrl(conference.slug, committee.slug, session.id),
		notesHref: isQuick ? null : chairSessionNotesUrl(conference.slug, committee.slug, session.id),
		editDelegationsHref: isQuick ? quickSessionDelegationsUrl(conference.slug) : null,
		nextOnSchedule:
			nextEvent === null ? null : scheduleLineText(nextEvent, today, conference.timezone)
	};
}
