/**
 * Which conference's schedule the reader is shown.
 *
 * There is one schedule page, and each conference has its own:
 * `/conferences/<slug>/schedule`. The top bar's "Schedule" goes to `/schedule`,
 * which has no schedule of its own and sends the reader on to the conference
 * picked here. On the schedule itself, a menu offers the reader's other
 * conferences (Trello card Lq9cSUET, "Why are there 2 pages for schedule?").
 *
 * Nothing here reads the clock or the database: both are handed in, so a test
 * can choose them.
 */

import type { DropdownItem } from '$lib/components/Dropdown.svelte';
import { dayInTimezone, formatDateRange } from '$lib/dates';
import { isRunningToday, type TodayConference } from '$lib/home-today';
import { conferenceScheduleUrl } from '$lib/urls';

/** Earlier start first. The name settles two that start on the same day, so the order never wobbles. */
function compareByStart(first: TodayConference, second: TodayConference): number {
	if (first.startDate !== second.startDate) {
		return first.startDate.localeCompare(second.startDate);
	}

	return first.name.localeCompare(second.name);
}

/** Whether a conference's first day is still to come, in its own timezone. */
function isStillToCome(conference: TodayConference, now: Date): boolean {
	// `YYYY-MM-DD` strings sort the way the days they name do.
	return dayInTimezone(now, conference.timezone) < conference.startDate;
}

/**
 * The conference whose schedule `/schedule` opens, or `null` for a reader who
 * is part of none. In this order:
 *
 * 1. a conference running today, in its own timezone;
 * 2. otherwise the next one to start;
 * 3. otherwise the one that ended last.
 *
 * Among several that tie, the earliest start wins, then the name.
 */
export function pickScheduleConference<Conference extends TodayConference>(
	conferences: Conference[],
	now: Date
): Conference | null {
	const byStart = [...conferences].sort(compareByStart);

	const runningToday = byStart.find((conference) => isRunningToday(conference, now));

	if (runningToday !== undefined) {
		return runningToday;
	}

	const nextToStart = byStart.find((conference) => isStillToCome(conference, now));

	if (nextToStart !== undefined) {
		return nextToStart;
	}

	// Every conference has ended, so the one that ended last is the most recent.
	// Walking them in `byStart` order and only taking a later end keeps the
	// first of several that ended on the same day.
	let endedLast: Conference | null = null;

	for (const conference of byStart) {
		if (endedLast === null || conference.endDate > endedLast.endDate) {
			endedLast = conference;
		}
	}

	return endedLast;
}

/**
 * The lines of the "Switch conference" menu on a conference's schedule: every
 * other conference of the reader's, earliest first, each opening its own
 * schedule. "Geneva MUN · 12 – 15 Feb 2026": the dates tell apart two
 * conferences that share a name from one year to the next.
 */
export function scheduleSwitchItems(
	conferences: TodayConference[],
	currentSlug: string
): DropdownItem[] {
	const others = conferences.filter((conference) => conference.slug !== currentSlug);
	const byStart = others.sort(compareByStart);

	return byStart.map((conference) => ({
		label: `${conference.name} · ${formatDateRange(conference.startDate, conference.endDate)}`,
		href: conferenceScheduleUrl(conference.slug)
	}));
}
