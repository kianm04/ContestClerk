/**
 * The small card that shows an organiser how their conference will look to
 * visitors, beside the Publish page and the Published page (the manage
 * redesign). It says the same few things a visitor reads first: the name, the
 * dates and place, who it is for, a couple of committees and when
 * applications close.
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import {
	committeeChips,
	formatConferenceDay,
	isAcceptingApplications,
	type Conference
} from '$lib/conferences';
import { formatDateRange } from '$lib/dates';
import { statusLabel } from '$lib/status';

/** The parts of a conference the card reads. */
export type PreviewConference = Pick<
	Conference,
	| 'name'
	| 'bannerPath'
	| 'startDate'
	| 'endDate'
	| 'venueName'
	| 'city'
	| 'level'
	| 'committeeNames'
	| 'status'
	| 'timezone'
	| 'applicationOpenMode'
	| 'applicationsOpenAt'
	| 'applicationsCloseAt'
>;

/** What the card says, line by line. */
export type ConferencePreview = {
	name: string;
	/** The banner in the `public-media` bucket, or `null` for the plain "No banner yet". */
	bannerPath: string | null;
	/** "12 – 14 Mar 2027 · Northbridge Hall, London". */
	datesAndPlace: string;
	/** "High school and university". */
	levelLabel: string;
	/** The first two committees by short name, then "+3" for the rest. */
	committeeChips: string[];
	/** "Applications close 31 Jan 2027", or `null` while there is no closing date. */
	closingLine: string | null;
};

/** "Northbridge Hall, London": the venue and the city, whichever are filled in. */
function venueAndCity(conference: Pick<Conference, 'venueName' | 'city'>): string {
	const parts = [conference.venueName, conference.city];
	const filledParts = parts.filter((part) => part !== null && part.trim() !== '');

	return filledParts.join(', ');
}

/** The dates, then the place when there is one. */
function datesAndPlace(conference: PreviewConference): string {
	const dates = formatDateRange(conference.startDate, conference.endDate);
	const place = venueAndCity(conference);

	if (place === '') {
		return dates;
	}

	return `${dates} · ${place}`;
}

/**
 * "Applications open · close 31 Jan 2027" while a published conference takes
 * applications, and "Applications close 31 Jan 2027" before then. The day is
 * the conference's own, wherever the organiser is reading from.
 */
function closingLine(conference: PreviewConference, now: Date): string | null {
	if (conference.applicationsCloseAt === null) {
		return null;
	}

	const closingDay = formatConferenceDay(conference.applicationsCloseAt, conference.timezone);

	if (isAcceptingApplications(conference, now)) {
		return `Applications open · close ${closingDay}`;
	}

	return `Applications close ${closingDay}`;
}

/** What the preview card says about this conference at this moment. */
export function conferencePreview(conference: PreviewConference, now: Date): ConferencePreview {
	return {
		name: conference.name,
		bannerPath: conference.bannerPath,
		datesAndPlace: datesAndPlace(conference),
		levelLabel: statusLabel('conference_level', conference.level),
		committeeChips: committeeChips(conference.committeeNames),
		closingLine: closingLine(conference, now)
	};
}
