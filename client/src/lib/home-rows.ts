/**
 * The rows under the hero of the signed-in home page: the due word on a task,
 * the "Also coming up" conference rows, the programme rows, an application's
 * status word, the announcements' title link and the quick session rows, with
 * the limits each list keeps.
 *
 * `docs/home.md` sections 3.4 to 3.9 and 5 are the contract. Everything here is
 * a plain calculation on the `HomeDashboard` the server hands the page. Nothing
 * reads the clock, talks to Supabase or knows any Svelte: the moment is handed
 * in, so every part of the page agrees on it and a test can choose it.
 */

import type { ResolvedPathname } from '$app/types';
import type { ApplicationListEntry } from '$lib/applications';
import {
	dayInTimezone,
	daysBetween,
	formatDateRange,
	formatDueIn,
	formatEventTime
} from '$lib/dates';
import {
	eventWhen,
	type HomeAnnouncement,
	type HomeDashboard,
	type HomeLink,
	type UpcomingEvent
} from '$lib/home';
import type { ConferenceHero, HomeHero } from '$lib/home-hero';
import type { TodayEvent } from '$lib/home-today';
import type { StatusDotTone } from '$lib/manage-status';
import type { MyQuickSession } from '$lib/my-quick-sessions';
import { statusBadgeTone, statusLabel } from '$lib/status';
import type { TaskDeadline } from '$lib/tasks';
import type { UpcomingConferenceCard } from '$lib/upcoming-conferences';
import {
	conferenceAnnouncementsUrl,
	conferenceScheduleUrl,
	manageUrl,
	myScheduleUrl
} from '$lib/urls';

/** How many "Also coming up" rows are drawn before "Show all {n}". */
export const COMING_UP_LIMIT = 8;

/** How many quick sessions are drawn before "Show all {n}". */
export const QUICK_SESSION_LIMIT = 3;

/** How many of today's events the "Today's programme" section lists. */
const TODAY_PROGRAMME_LIMIT = 6;

/**
 * A deadline this many days away or nearer is soon: its word is amber, and
 * the task takes the page's button (`isPressing` in `$lib/home-hero.ts`).
 */
const DUE_SOON_DAYS = 7;

/** Up to this many days away the word still counts the days; beyond it, it names the date. */
const DUE_WITHIN_MONTH_DAYS = 30;

/**
 * A status as the page shows one: a few words, the colour of the dot before
 * them, and whether the dot is drawn at all. Every status word on the page is
 * one of these, so a task's "Overdue", a conference row's "Applications open"
 * and an application's "Not accepted" are drawn by the same `StatusDot`.
 */
export type DueWord = {
	text: string;
	tone: StatusDotTone;
	/** `false` for a grey word: a grey dot would only repeat the word. */
	hasDot: boolean;
};

/**
 * A status word with its dot decided from its tone: red, amber, light blue and
 * green each say something the word alone does not, grey says nothing.
 */
function statusWord(text: string, tone: StatusDotTone): DueWord {
	return { text, tone, hasDot: tone !== 'neutral' };
}

/**
 * When a task is due, as its row and the hero's next step say it: "Overdue" in
 * red, "Today", "Tomorrow" or "In 5 days" in amber for the next week, "In 12
 * days" in plain grey for the rest of the month, and "By 25 Jul 2027" beyond
 * that, with the year always written. The day is counted where the conference
 * is, which is why the deadline carries its timezone.
 */
export function dueWord(deadline: TaskDeadline, now: Date): DueWord {
	const days = daysBetween(dayInTimezone(now, deadline.timezone), deadline.day);

	if (days > DUE_WITHIN_MONTH_DAYS) {
		// A range from a day to the same day is that one day written out.
		return statusWord(`By ${formatDateRange(deadline.day, deadline.day)}`, 'neutral');
	}

	const text = formatDueIn(deadline.day, now, deadline.timezone);

	if (days < 0) {
		return statusWord(text, 'danger');
	}

	return statusWord(text, days <= DUE_SOON_DAYS ? 'warning' : 'neutral');
}

/** One row of "Also coming up". */
export type ConferenceRowData = {
	/** The conference's id, which the `{#each}` block over the rows is keyed on. */
	id: string;
	name: string;
	/** The reader's own door into the conference, which the whole row links to. */
	href: ResolvedPathname;
	/** The wide banner for the thumbnail, or `null` for an empty slot. */
	bannerPath: string | null;
	/** "UNHRC", "Morocco", "25 – 27 Jul 2027", "Amsterdam": the meta line, joined with " · " on the row. */
	metaParts: string[];
	/**
	 * The flag drawn before the seat's name, which is `metaParts[1]` on a seat's
	 * row, after the committee. `null` on every other row, and for a seat that
	 * is not a country.
	 */
	flagCountryCode: string | null;
	/** "In 8 months", "Today" with a light-blue dot, or the organiser's "Applications open". */
	status: DueWord;
};

/**
 * What the reader is at the conference, as the row's first words: the
 * committee and the seat or title for a committee role, the delegation for a
 * delegation role, and one word for the rest.
 */
function roleParts(card: UpcomingConferenceCard): string[] {
	if (card.seat !== null) {
		return [card.seat.committeeHeading, card.seat.name];
	}

	if (card.chair !== null) {
		return [card.chair.committeeHeading, card.chair.title];
	}

	if (card.delegation !== null) {
		return [card.delegation.isHead ? 'Head of delegation' : 'Delegation', card.delegation.name];
	}

	if (card.roleKind === 'accepted') {
		return ['Delegate', 'seat to come'];
	}

	return [card.roleKind === 'volunteer' ? 'Volunteer' : 'Organiser'];
}

/** The city, or "Online" for an online conference that names no city, or nothing. */
function rowPlace(card: UpcomingConferenceCard): string | null {
	if (card.city !== null) {
		return card.city;
	}

	return card.locationMode === 'online' ? 'Online' : null;
}

/**
 * The row's status word. An organiser's row says where the conference is in
 * its life, as the manage list does; every other row says how long to go, or
 * "Today" in light blue while it runs.
 */
function conferenceRowStatus(card: UpcomingConferenceCard): DueWord {
	if (card.organiser !== null) {
		return statusWord(card.organiser.status.text, card.organiser.status.tone);
	}

	return statusWord(card.when.text, card.when.isLive ? 'brand' : 'neutral');
}

function toConferenceRow(card: UpcomingConferenceCard): ConferenceRowData {
	const dates = formatDateRange(card.startDate, card.endDate);
	const place = rowPlace(card);
	const metaParts = [...roleParts(card), dates];

	if (place !== null) {
		metaParts.push(place);
	}

	return {
		id: card.id,
		name: card.name,
		href: card.href,
		bannerPath: card.bannerPath,
		metaParts,
		flagCountryCode: card.seat?.countryCode ?? null,
		status: conferenceRowStatus(card)
	};
}

/** The first `limit` items, or all of them when the reader asked for all. */
function inView<Item>(items: Item[], limit: number, showAll: boolean): Item[] {
	return showAll ? items : items.slice(0, limit);
}

/**
 * The "Also coming up" rows for these cards, in the order given. The page
 * hands in every card but the hero's, which has the panel instead of a row.
 *
 * Up to `COMING_UP_LIMIT` rows are drawn unless `showAll` lifts the limit;
 * `moreCount` is how many were left out, for "Show all {n}" to say the whole
 * number. `hasThumbs` is whether any row drawn has a banner, so a list where
 * none has one can leave the thumbnail column out altogether.
 *
 * Unlike the other row builders this one takes no moment: the cards already
 * carry the words of the moment they were built at.
 */
export function conferenceRows(
	cards: UpcomingConferenceCard[],
	showAll: boolean
): { rows: ConferenceRowData[]; moreCount: number; hasThumbs: boolean } {
	const rows = inView(cards, COMING_UP_LIMIT, showAll).map(toConferenceRow);

	return {
		rows,
		moreCount: cards.length - rows.length,
		hasThumbs: rows.some((row) => row.bannerPath !== null)
	};
}

/** One row of "Today's programme" or "Programme". */
export type ProgrammeRowData = {
	/** The event's id, which the `{#each}` block over the rows is keyed on. */
	id: string;
	/** The conference's programme, open on the event's day. */
	href: ResolvedPathname;
	/** "12:30 – 13:30" on a conference day, "Tomorrow · 09:00 – 10:30" otherwise. */
	when: string;
	title: string;
	/**
	 * "Room 2.04 · DelftMUN 2026", or the room alone on a conference day, when
	 * the hero already names the conference; `null` when there is nothing to say.
	 */
	meta: string | null;
	/** Whether the event is in progress, which the row marks "Now". */
	isNow: boolean;
};

/** Whether an event has started and not yet ended at this moment. */
function isInProgress(event: { startsAt: string; endsAt: string }, now: Date): boolean {
	return new Date(event.startsAt) <= now && now < new Date(event.endsAt);
}

/** The programme on the day the event falls on, where the conference is. */
function programmeDayUrl(slug: string, startsAt: string, timezone: string): ResolvedPathname {
	return conferenceScheduleUrl(slug, { day: dayInTimezone(new Date(startsAt), timezone) });
}

/**
 * The committees whose events are the reader's at the hero conference: the
 * one they hold a seat in or chair. Nobody else has a committee there, so
 * only the whole conference's events are theirs.
 */
export function heroCommitteeIds(card: UpcomingConferenceCard): string[] {
	if (card.seat !== null) {
		return [card.seat.committeeId];
	}

	if (card.chair !== null) {
		return [card.chair.committeeId];
	}

	return [];
}

/**
 * The events of today's programme that are still the reader's to go to at one
 * conference: the whole conference's and their own committee's, only those that
 * have not ended, and only those on today where the conference is. The server
 * reads a day ahead so that an event in progress is kept, which lets tomorrow
 * morning's first session into the list every evening; the day test, in the
 * conference's own `timezone`, leaves it out again. The order the events came
 * in is kept, which is soonest first as the server reads them.
 */
export function eventsLeftToday(
	events: TodayEvent[],
	conferenceId: string,
	readerCommitteeIds: string[],
	timezone: string,
	now: Date
): TodayEvent[] {
	const today = dayInTimezone(now, timezone);

	return events.filter(
		(event) =>
			event.conferenceId === conferenceId &&
			(event.committeeId === null || readerCommitteeIds.includes(event.committeeId)) &&
			new Date(event.endsAt) > now &&
			dayInTimezone(new Date(event.startsAt), timezone) === today
	);
}

/**
 * The "Today's programme" rows on a conference day: what is left of the hero
 * conference's programme for the reader, soonest first, at most six. The meta
 * line is the room alone, because the hero names the conference.
 */
export function todayProgrammeRows(
	events: TodayEvent[],
	hero: ConferenceHero,
	readerCommitteeIds: string[],
	now: Date
): ProgrammeRowData[] {
	return eventsLeftToday(events, hero.conferenceId, readerCommitteeIds, hero.timezone, now)
		.slice(0, TODAY_PROGRAMME_LIMIT)
		.map((event) => ({
			id: event.id,
			href: programmeDayUrl(hero.slug, event.startsAt, hero.timezone),
			when: formatEventTime(event.startsAt, event.endsAt, hero.timezone),
			title: event.title,
			meta: event.location,
			isNow: isInProgress(event, now)
		}));
}

/**
 * The "Programme" rows on an ordinary day: the next events across the
 * reader's conferences, as loaded. Each names its conference, because the
 * list runs across several.
 */
export function programmeRows(events: UpcomingEvent[], now: Date): ProgrammeRowData[] {
	return events.map((event) => ({
		id: event.id,
		href: programmeDayUrl(event.conferenceSlug, event.startsAt, event.conferenceTimezone),
		when: eventWhen(event, now),
		title: event.title,
		meta:
			event.location === null
				? event.conferenceName
				: `${event.location} · ${event.conferenceName}`,
		isNow: isInProgress(event, now)
	}));
}

/** What the programme section draws: its title, its title link and its rows. */
export type ProgrammeSectionData = {
	title: string;
	link: HomeLink;
	rows: ProgrammeRowData[];
};

/** The programme section's title link, on a conference day and any other. */
const FULL_SCHEDULE = 'Full schedule';

/**
 * The programme section: on a conference day, "Today's programme" with what is
 * left of the hero conference's day for the reader, leading to that
 * conference's schedule; otherwise "Programme" with the next events across all
 * the reader's conferences, leading to their own schedule. `null` when there is
 * nothing to list, so the page draws no section.
 */
export function programmeSection(
	dashboard: HomeDashboard,
	hero: HomeHero,
	now: Date
): ProgrammeSectionData | null {
	if (hero.kind === 'conference' && hero.label.isLive) {
		const readerCommitteeIds = heroCommitteeIds(dashboard.upcomingConferences[0]);
		const rows = todayProgrammeRows(dashboard.todayEvents, hero, readerCommitteeIds, now);

		if (rows.length > 0) {
			return {
				title: "Today's programme",
				link: { label: FULL_SCHEDULE, href: conferenceScheduleUrl(hero.slug) },
				rows
			};
		}
	}

	const rows = programmeRows(dashboard.upcomingEvents, now);

	if (rows.length === 0) {
		return null;
	}

	return { title: 'Programme', link: { label: FULL_SCHEDULE, href: myScheduleUrl() }, rows };
}

/** The title link of "Also coming up": "Manage" for a reader who helps run a conference, nobody else. */
export function comingUpLink(dashboard: HomeDashboard): HomeLink | null {
	return dashboard.hasManagedConferences ? { label: 'Manage', href: manageUrl() } : null;
}

/**
 * The status word on an "Applications" row: "Under review" and "Waitlisted"
 * in amber, "Not accepted" in red, "Draft" in plain grey. The words and
 * colours are `$lib/status.ts`'s own, so the row and `/applications` agree;
 * a delegation's status is read as a delegation's, which words a submitted
 * one "Under review" as well.
 */
export function applicationStatus(entry: ApplicationListEntry): DueWord {
	if (entry.kind === 'individual') {
		const status = entry.application.status;

		return statusWord(
			statusLabel('application_status', status),
			statusBadgeTone('application_status', status)
		);
	}

	const status = entry.membership.status;

	return statusWord(
		statusLabel('delegation_status', status),
		statusBadgeTone('delegation_status', status)
	);
}

/**
 * The title link of "Announcements": "All announcements", leading to the one
 * conference's announcements page when every row is from the same conference.
 * Rows from several conferences have no one page to lead to, so there is none.
 */
export function announcementsLink(announcements: HomeAnnouncement[]): HomeLink | null {
	if (announcements.length === 0) {
		return null;
	}

	const slug = announcements[0].conferenceSlug;
	const fromOneConference = announcements.every(
		(announcement) => announcement.conferenceSlug === slug
	);

	if (!fromOneConference) {
		return null;
	}

	return { label: 'All announcements', href: conferenceAnnouncementsUrl(slug) };
}

/**
 * The "Quick sessions" rows: the first `QUICK_SESSION_LIMIT` as loaded, most
 * recently used first, unless `showAll` lifts the limit. `moreCount` is how
 * many were left out, for "Show all {n}".
 */
export function quickSessionRows(
	sessions: MyQuickSession[],
	showAll: boolean
): { rows: MyQuickSession[]; moreCount: number } {
	const rows = inView(sessions, QUICK_SESSION_LIMIT, showAll);

	return { rows, moreCount: sessions.length - rows.length };
}
