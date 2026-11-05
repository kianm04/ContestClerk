/**
 * The status line under the conference's name in the management sidebar: a
 * coloured dot and a few words saying where the conference is in its life,
 * such as "Applications open" or "Day 2 of 3" (the manage redesign).
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import type { Conference } from '$lib/conferences';
import { conferencePhase } from '$lib/conference-phase';
import { dayInTimezone, daysBetween, formatDayAndMonth } from '$lib/dates';

/**
 * The colour of a status dot (`StatusDot.svelte`). The status line uses three:
 * green while applications are open, light blue on the conference days, and
 * grey for everything else, which is waiting or over. The tables of the
 * management pages also use orange for something owed or waiting, such as
 * "Unpaid", and red for something refused, such as "Changes requested".
 */
export type StatusDotTone = 'neutral' | 'success' | 'brand' | 'warning' | 'danger';

/** What the status line says, and the colour of its dot. */
export type ManageStatusLine = {
	text: string;
	tone: StatusDotTone;
};

/** The columns of a conference the status line is worked out from. */
export type ManageStatusFields = Pick<
	Conference,
	| 'status'
	| 'startDate'
	| 'endDate'
	| 'timezone'
	| 'applicationsOpenAt'
	| 'applicationsCloseAt'
	| 'applicationOpenMode'
>;

/** "Day 2 of 3": which day of the conference `now` is, where the conference is. */
function conferenceDayText(conference: ManageStatusFields, now: Date): string {
	const today = dayInTimezone(now, conference.timezone);
	const dayNumber = daysBetween(conference.startDate, today) + 1;
	const dayCount = daysBetween(conference.startDate, conference.endDate) + 1;

	return `Day ${dayNumber} of ${dayCount}`;
}

/** The status line of `conference` at the moment `now`. */
export function manageStatusLine(conference: ManageStatusFields, now: Date): ManageStatusLine {
	if (conference.status === 'draft') {
		return { text: 'Draft · not public', tone: 'neutral' };
	}

	if (conference.status === 'archived') {
		return { text: 'Archived', tone: 'neutral' };
	}

	const phase = conferencePhase(conference, now);
	const opensAt = conference.applicationsOpenAt;

	// Published through the creation flow with "Publish conference only"
	// (Trello fe3reN7Y): the organiser opens applications by hand later, so
	// until they do, no opening moment means closed rather than open.
	if (phase === 'applications' && conference.applicationOpenMode === 'manual' && opensAt === null) {
		return { text: 'Applications not open yet', tone: 'neutral' };
	}

	// Published, with the application window still ahead of it.
	if (phase === 'applications' && opensAt !== null && new Date(opensAt) > now) {
		const opensOn = formatDayAndMonth(opensAt, conference.timezone);
		return { text: `Applications open on ${opensOn}`, tone: 'neutral' };
	}

	if (phase === 'applications') {
		return { text: 'Applications open', tone: 'success' };
	}

	if (phase === 'allocation') {
		return { text: 'Applications closed', tone: 'neutral' };
	}

	if (phase === 'conference-days') {
		return { text: conferenceDayText(conference, now), tone: 'brand' };
	}

	return { text: 'Ended', tone: 'neutral' };
}
