/**
 * The shapes the signed-in home page is drawn from, and the few words it works
 * out for itself.
 *
 * `docs/home.md` ("Your next conference") describes the page: a greeting, the
 * reader's next conference as one panel with their next step in it, and under
 * it short ruled lists of what they still owe, the programme, announcements,
 * their other conferences, applications waiting for an answer, quick sessions
 * and, for anyone who organises nothing, three conferences open for
 * applications. Fetching all of that is `$lib/server/home.ts`'s job. This file
 * holds the types those queries fill in and the plain calculations the page
 * does on top of them, so both can be read and tested without knowing any
 * Svelte. `$lib/home-hero.ts` works out the panel and `$lib/home-rows.ts` the
 * rows from the `HomeDashboard` written here.
 *
 * Nothing here reads the clock, talks to Supabase or imports from
 * `$lib/server`. The hour is handed to `greeting` by the page, because the time
 * of day the reader sees is the one on their own device.
 */

import type { ResolvedPathname } from '$app/types';
import {
	applicationRowLine,
	delegationRowLine,
	type ApplicationListEntry
} from '$lib/applications';
import type { Conference } from '$lib/conferences';
import { dayInTimezone, dayLabel, formatEventTime } from '$lib/dates';
import type { TodayEvent, TodayItem } from '$lib/home-today';
import type { MyQuickSession } from '$lib/my-quick-sessions';
import { firstName } from '$lib/profiles';
import type { HomeTask } from '$lib/tasks';
import type { UpcomingConferenceCard } from '$lib/upcoming-conferences';
import { applicationUrl, delegationUrl } from '$lib/urls';

/**
 * How many cards the "Open for applications" section shows. Three, so a row of
 * the directory's cards fits a wide screen in one line.
 */
export const EXPLORE_CONFERENCE_LIMIT = 3;

/**
 * How many rows the "Applications" section shows.
 *
 * The reader's own applications and the delegations they belong to are read
 * separately and merged into one list. One list drawn from two queries cannot
 * honour two separate limits without dropping rows the reader would rather
 * see, so the merged list takes one limit of three.
 */
export const MY_APPLICATION_LIMIT = 3;

/** How many events the "Programme" section shows when no conference runs today. */
export const UPCOMING_EVENT_LIMIT = 5;

/** A text link somewhere on the page: the words, and where they lead. */
export type HomeLink = {
	label: string;
	/** Built with a helper from `$lib/urls.ts`. */
	href: ResolvedPathname;
};

/**
 * One announcement as the "Announcements" section lists it: its title, when
 * it was published and which conference said it.
 *
 * `$lib/server/home-announcements.ts` reads these; the row turns `publishedAt`
 * into "3 days ago" or a date in the conference's own timezone.
 */
export type HomeAnnouncement = {
	id: string;
	title: string;
	/** An ISO timestamp. */
	publishedAt: string;
	conferenceName: string;
	conferenceSlug: string;
	/** An IANA name such as `Europe/Amsterdam`, the zone the date is written in. */
	conferenceTimezone: string;
};

/**
 * One event on the dashboard's "Programme" list.
 *
 * `startsAt` and `endsAt` are ISO timestamps as Postgres returns them, and
 * `conferenceTimezone` is the zone they are shown in: an event at 13:30 is at
 * 13:30 where the conference is, whatever time it is where the reader is.
 */
export type UpcomingEvent = {
	/** The event's id. The `{#each}` block over the rows is keyed on it. */
	id: string;
	title: string;
	startsAt: string;
	endsAt: string;
	/** The room or address the organisers wrote, or `null` when they wrote none. */
	location: string | null;
	conferenceName: string;
	/** The conference's slug, so the row can link to its programme. */
	conferenceSlug: string;
	conferenceTimezone: string;
};

/** Everything the home page shows, in one object. */
export type HomeDashboard = {
	/**
	 * Every conference the reader has a role in that has not ended, running
	 * today first and then soonest first, as `upcomingConferences` in
	 * `$lib/upcoming-conferences.ts` orders them. The first is the hero; the
	 * rest are the "Also coming up" rows. No cap: the page decides how many
	 * rows to draw.
	 */
	upcomingConferences: UpcomingConferenceCard[];
	/** Everything the reader still has to do, overdue and soonest first. */
	tasks: HomeTask[];
	/** What the reader has to do today at the conferences running today, most urgent first. */
	todayItems: TodayItem[];
	/**
	 * The programme the server read at the conferences running today: every
	 * event that ends after now and starts within a day, soonest first. Which of
	 * them fall on today is read per conference, in its own timezone, by
	 * `eventsLeftToday` in `$lib/home-rows.ts`.
	 */
	todayEvents: TodayEvent[];
	/** The next few events across the reader's conferences, soonest first. */
	upcomingEvents: UpcomingEvent[];
	/** The newest announcements across the reader's conferences, newest first. */
	announcements: HomeAnnouncement[];
	/**
	 * The reader's own applications and the delegations they are in that are
	 * still waiting for an answer: draft, submitted, waitlisted or rejected at
	 * a conference that has not ended, at most `MY_APPLICATION_LIMIT`. An
	 * accepted one is a conference, and is in `upcomingConferences` instead.
	 */
	myApplications: ApplicationListEntry[];
	/** The quick sessions the reader chairs, most recently used first. */
	quickSessions: MyQuickSession[];
	/** Conferences open for applications; empty for a reader who manages anything. */
	exploreConferences: Conference[];
	/** Whether the reader helps run any conference, over or not. */
	hasManagedConferences: boolean;
	/** Whether the reader chairs any committee. */
	chairsSomething: boolean;
	/**
	 * Whether the reader has ever taken part in a conference in any way: held a
	 * seat, chaired, helped as staff, belonged to a delegation or applied,
	 * anywhere, past or to come, in any status. `false` decides "Find your first
	 * conference" over "Find your next conference" in the find hero.
	 */
	hasTakenPart: boolean;
	/**
	 * How many conferences are open for applications, read only when
	 * `upcomingConferences` is empty and the page says so; `null` otherwise.
	 */
	openConferenceCount: number | null;
	/**
	 * The seats on offer at the hero conference and how many are held, read
	 * only when the hero is a published conference the reader organises;
	 * `null` otherwise.
	 */
	heroSeats: { held: number; onOffer: number } | null;
	/** Which list `?all=` asks to show in full, or `null` for none. */
	showAll: 'conferences' | 'quick' | null;
};

/**
 * When an event is, as the "Programme" rows say it: "Today · 13:30 – 15:00",
 * or "24 Nov 2026 · 09:00 – 10:30".
 *
 * The day is named as well as the time, because this list runs across several
 * conferences and several days at once: "13:30" on its own would not say which
 * of them. Both halves are read in the conference's own timezone, never the
 * reader's, which is why `now` is handed in rather than read from the clock.
 */
export function eventWhen(event: UpcomingEvent, now: Date): string {
	const day = dayInTimezone(new Date(event.startsAt), event.conferenceTimezone);
	const when = dayLabel(day, now, event.conferenceTimezone);
	const time = formatEventTime(event.startsAt, event.endsAt, event.conferenceTimezone);

	return `${when} · ${time}`;
}

/**
 * The quiet line under the conference's name on one row of "Applications":
 * "Submitted 8 Sept 2026" for an application of the reader's own, and
 * "Delegation · LSE Team" for a delegation they belong to.
 *
 * Both sentences are `$lib/applications.ts`'s, so a row here and the same row
 * on `/applications` read identically.
 */
export function homeApplicationLine(entry: ApplicationListEntry, now: Date): string {
	if (entry.kind === 'individual') {
		return applicationRowLine(entry.application, now);
	}

	return delegationRowLine(entry.membership);
}

/**
 * Where that row leads: the application's own page, or the delegation's
 * dashboard.
 *
 * Unlike `/applications`, a row here never carries a "Finish" button, so the
 * whole row is always a link and there is no second address to work out.
 */
export function homeApplicationHref(entry: ApplicationListEntry): ResolvedPathname {
	if (entry.kind === 'individual') {
		return applicationUrl(entry.application.id);
	}

	return delegationUrl(entry.membership.id);
}

/** The hour the afternoon starts on a 24-hour clock. Before it, it is still morning. */
const AFTERNOON_STARTS_AT_HOUR = 12;

/** The hour the evening starts on a 24-hour clock. Before it, it is still afternoon. */
const EVENING_STARTS_AT_HOUR = 18;

/** The greeting word on its own, for a clock hour from 0 to 23. */
function timeOfDayGreeting(hour: number): string {
	if (hour < AFTERNOON_STARTS_AT_HOUR) {
		return 'Good morning';
	}

	if (hour < EVENING_STARTS_AT_HOUR) {
		return 'Good afternoon';
	}

	return 'Good evening';
}

/**
 * The line at the top of the page: "Good afternoon, Daniel."
 *
 * `hour` is a clock hour from 0 to 23. Morning is before 12, afternoon before
 * 18, evening after that. `fullName` is the whole name; only the first word is
 * used, through `firstName` in `$lib/profiles`.
 */
export function greeting(hour: number, fullName: string): string {
	const greetingWords = timeOfDayGreeting(hour);
	const name = firstName(fullName);

	// An account that has no name yet is greeted without one, because
	// "Good afternoon, ." is not something to put in front of anybody.
	if (name === '') {
		return `${greetingWords}.`;
	}

	return `${greetingWords}, ${name}.`;
}
