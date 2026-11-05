/**
 * The sentence under the conference dashboard's title, for whichever phase
 * the conference is in (`specs/05-pages/organiser/dashboard.md`, "Header").
 *
 * Nothing here talks to Supabase or knows any Svelte, so each sentence can be
 * read and tested on its own. A draft never reaches the dashboard: `load`
 * sends it on to its next setup step first.
 */

import type { ConferencePhase, ConferencePhaseFields } from '$lib/conference-phase';
import type { Conference } from '$lib/conferences';
import {
	countdownText,
	formatDayAndLongMonth,
	formatLongDay,
	noonOfDay
} from '$lib/dashboard-dates';
import { countOf } from '$lib/dashboard-words';
import { dayInTimezone, daysBetween } from '$lib/dates';

/** The conference columns a sentence is written from. */
export type StatusConference = ConferencePhaseFields & Pick<Conference, 'applicationsOpenAt'>;

/** What the sentence needs to know besides the conference itself. After only. */
export type StatusFacts = {
	/** How many delegates held a seat. */
	delegateCount: number;
	/** How many committees the conference had. */
	committeeCount: number;
};

/**
 * While applications are taken: when they open, when they close, or only that
 * they are open when the organiser has set no closing moment.
 */
function applicationsSentence(conference: StatusConference, now: Date): string {
	const { applicationsOpenAt, applicationsCloseAt, timezone } = conference;
	const today = dayInTimezone(now, timezone);

	if (applicationsOpenAt !== null && new Date(applicationsOpenAt).getTime() > now.getTime()) {
		const openDay = dayInTimezone(new Date(applicationsOpenAt), timezone);
		const countdown = countdownText(daysBetween(today, openDay));

		return `Applications open on ${formatLongDay(applicationsOpenAt, timezone)}, ${countdown}.`;
	}

	if (applicationsCloseAt === null) {
		return 'Applications are open.';
	}

	const closeDay = dayInTimezone(new Date(applicationsCloseAt), timezone);
	const countdown = countdownText(daysBetween(today, closeDay));

	return `Applications are open. They close on ${formatLongDay(applicationsCloseAt, timezone)}, ${countdown}.`;
}

/** Once applications have closed: when they did, and how soon the first day is. */
function allocationSentence(conference: StatusConference, now: Date): string {
	const today = dayInTimezone(now, conference.timezone);
	const countdown = countdownText(daysBetween(today, conference.startDate));
	const firstDay = formatLongDay(noonOfDay(conference.startDate), 'UTC');

	// The phase is Allocation only once the closing moment has passed, so it is set.
	const closedAt = conference.applicationsCloseAt ?? '';
	const closedOn = formatDayAndLongMonth(closedAt, conference.timezone);

	return `Applications closed on ${closedOn}. The conference starts on ${firstDay}, ${countdown}.`;
}

/** On a conference day: which day of how many, and which day that is. */
function conferenceDaySentence(conference: StatusConference, now: Date): string {
	const today = dayInTimezone(now, conference.timezone);
	const dayNumber = daysBetween(conference.startDate, today) + 1;
	const dayCount = daysBetween(conference.startDate, conference.endDate) + 1;

	return `Day ${dayNumber} of ${dayCount} · ${formatLongDay(noonOfDay(today), 'UTC')}`;
}

/** Once it is over: the last day, and how many took part. */
function afterSentence(conference: StatusConference, facts: StatusFacts): string {
	const lastDay = formatLongDay(noonOfDay(conference.endDate), 'UTC');
	const ended = `The conference ended on ${lastDay}.`;

	if (facts.delegateCount === 0) {
		return ended;
	}

	const delegates = countOf(facts.delegateCount, 'delegate', 'delegates');
	const committees = countOf(facts.committeeCount, 'committee', 'committees');

	return `${ended} ${delegates} took part in ${committees}.`;
}

/**
 * The sentence under the title for `phase`, read at the moment `now`.
 *
 * An archived conference is told the day it ended, as a finished one is: the
 * sidebar's status says "Archived", and `conferences` keeps no moment for
 * archiving to name.
 */
export function dashboardStatusSentence(
	phase: ConferencePhase,
	conference: StatusConference,
	now: Date,
	facts: StatusFacts
): string {
	if (phase === 'applications') {
		return applicationsSentence(conference, now);
	}

	if (phase === 'allocation') {
		return allocationSentence(conference, now);
	}

	if (phase === 'conference-days') {
		return conferenceDaySentence(conference, now);
	}

	if (phase === 'after') {
		return afterSentence(conference, facts);
	}

	// Setup never reaches the dashboard, so this is only a safe answer.
	return 'This conference is a draft.';
}
