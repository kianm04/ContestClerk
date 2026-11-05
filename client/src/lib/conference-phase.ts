/**
 * Which phase of its life a conference is in.
 *
 * The organiser's dashboard is organised around this one answer
 * (`specs/05-pages/organiser/dashboard.md`, "Data"): a draft is being set up, a
 * published conference is taking applications or allocating seats, then come
 * the conference days, and after them there is only tidying up.
 *
 * Nothing here talks to Supabase or knows any Svelte, so the rule can be read
 * and tested on its own.
 */

import type { Conference } from '$lib/conferences';
import { dayInTimezone } from '$lib/dates';

/** The five phases, in the order a conference goes through them. */
export type ConferencePhase = 'setup' | 'applications' | 'allocation' | 'conference-days' | 'after';

/** The four columns of a conference the phase is worked out from, and its timezone. */
export type ConferencePhaseFields = Pick<
	Conference,
	'status' | 'startDate' | 'endDate' | 'timezone' | 'applicationsCloseAt'
>;

/**
 * Whether the application window has closed by `now`.
 *
 * A conference with no closing moment has not closed: nothing says when it
 * would, so the dashboard keeps treating it as taking applications.
 */
function haveApplicationsClosed(conference: ConferencePhaseFields, now: Date): boolean {
	if (conference.applicationsCloseAt === null) {
		return false;
	}

	const closesAt = new Date(conference.applicationsCloseAt);

	return closesAt.getTime() <= now.getTime();
}

/**
 * The phase `conference` is in at the moment `now`.
 *
 * "Today" is the day `now` falls on in the conference's own timezone, not the
 * server's: a conference in Tokyo starts its first day while it is still the
 * evening before in London. Days are `YYYY-MM-DD`, so comparing them as text
 * compares them as dates.
 *
 * The applications window is compared as a moment rather than a day, because
 * it closes at an exact time ("23:59 on 24 Sep"), not at the end of a day.
 */
export function conferencePhase(conference: ConferencePhaseFields, now: Date): ConferencePhase {
	if (conference.status === 'draft') {
		return 'setup';
	}

	if (conference.status === 'archived') {
		return 'after';
	}

	const today = dayInTimezone(now, conference.timezone);

	if (today > conference.endDate) {
		return 'after';
	}

	if (today >= conference.startDate) {
		return 'conference-days';
	}

	if (haveApplicationsClosed(conference, now)) {
		return 'allocation';
	}

	return 'applications';
}
