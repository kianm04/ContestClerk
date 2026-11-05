/**
 * Announcements as the two announcement pages hold them, and the small rules
 * about how one is shown: its audience badge, its author line, its time and the
 * short version the organiser's list uses.
 *
 * Both the server and the browser import this file, so nothing here talks to
 * Supabase. The queries are in `$lib/server/announcements.ts`, and what the
 * organiser's form accepts is in `$lib/announcement-form.ts`.
 * `06-features/schedule-and-announcements.md` has the rules in words.
 */

import { pathOnThisSite } from '$lib/auth';
import { formatRelativeTime } from '$lib/dates';
import type { Database } from '$lib/database.types';
import type { BadgeTone } from '$lib/status';

/** Who an announcement is for. The same five audiences as the database's `audience` enum. */
export type AnnouncementAudience = Database['public']['Enums']['audience'];

/** One announcement, as both pages hold it. */
export type Announcement = {
	/** The announcement's id. The `{#each}` blocks over announcements are keyed on it. */
	id: string;
	title: string;
	/** Plain text with a blank line between paragraphs. */
	body: string;
	audience: AnnouncementAudience;
	/** Set exactly when `audience` is `committee`, which a check in the database insists on. */
	committeeId: string | null;
	/** The committee's short name, such as "UNSC", or `null` when it has none. */
	committeeAbbreviation: string | null;
	/** Set exactly when `audience` is `delegation`. */
	delegationId: string | null;
	delegationName: string | null;
	isPinned: boolean;
	publishedAt: string;
	authorId: string;
	/** The author's full name, or `null` when their profile could not be read. */
	authorName: string | null;
};

/** An announcement on the delegate's page, which also says who wrote it in the page's own words. */
export type ReaderAnnouncement = Announcement & {
	/** "Secretariat", or a chair's name followed by "(Chair)". */
	authorLine: string;
};

/** A committee or an accepted delegation, which is what an announcement can be addressed to by name. */
export type AnnouncementGroup = {
	id: string;
	name: string;
};

/** How many announcements the delegate's page shows at a time. */
export const ANNOUNCEMENTS_PAGE_SIZE = 20;

/** How many characters of the body the organiser's list shows before it cuts it short. */
export const ANNOUNCEMENT_PREVIEW_LENGTH = 160;

/** For how many hours a time is written as "3 hours ago" rather than as a date. */
const RELATIVE_TIME_HOURS = 48;

/** How many milliseconds there are in an hour. */
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/** What each audience is called on a badge when there is no committee or delegation name. */
const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
	everyone: 'Everyone',
	delegates: 'Delegates',
	staff: 'Staff',
	committee: 'Committee',
	delegation: 'Delegation'
};

/**
 * The words on an announcement's audience badge: the committee's short name or
 * the delegation's name when it has one, and the audience itself otherwise.
 */
export function announcementBadgeLabel(announcement: Announcement): string {
	if (announcement.audience === 'committee') {
		return announcement.committeeAbbreviation ?? AUDIENCE_LABELS.committee;
	}

	if (announcement.audience === 'delegation') {
		return announcement.delegationName ?? AUDIENCE_LABELS.delegation;
	}

	return AUDIENCE_LABELS[announcement.audience];
}

/** The colour of the badge: a committee's or a delegation's own stands out, the rest are quiet. */
export function announcementBadgeTone(announcement: Announcement): BadgeTone {
	if (announcement.audience === 'committee' || announcement.audience === 'delegation') {
		return 'brand';
	}

	return 'neutral';
}

/**
 * Whether the delegate's card shows an audience badge. Only a committee's or a
 * delegation's announcement does: everything else was meant for the reader as
 * one of many, and a badge on every card would say nothing.
 */
export function showsReaderBadge(announcement: Announcement): boolean {
	return announcement.audience === 'committee' || announcement.audience === 'delegation';
}

/**
 * Who wrote an announcement, as the delegate's page says it.
 *
 * A chair speaks as themselves: "Anna Chen (Chair)". Everybody else who can
 * publish one runs the conference and speaks for it: "Secretariat". Only a chair
 * of the announcement's own committee counts as a chair here, so an organiser
 * who also chairs a committee still writes to everyone as the Secretariat.
 */
export function announcementAuthorLine(
	authorName: string | null,
	isChairOfCommittee: boolean
): string {
	if (isChairOfCommittee && authorName) {
		return `${authorName} (Chair)`;
	}

	return 'Secretariat';
}

/**
 * When an announcement was published, in words: "3 hours ago" for the last 48
 * hours, then the date, such as "12 Feb 2026". The date is read in the
 * conference's timezone, which is the clock everybody at the conference keeps.
 */
export function formatPublishedAt(publishedAt: string, now: Date, timezone: string): string {
	const hoursAgo = (now.getTime() - new Date(publishedAt).getTime()) / MILLISECONDS_PER_HOUR;

	if (hoursAgo < RELATIVE_TIME_HOURS) {
		return formatRelativeTime(publishedAt, now, timezone);
	}

	return new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	}).format(new Date(publishedAt));
}

/**
 * The start of the body, for the organiser's list: at most 160 characters,
 * ending in an ellipsis when something was cut. The delegate's page always
 * shows the whole body.
 */
export function announcementPreview(body: string): string {
	if (body.length <= ANNOUNCEMENT_PREVIEW_LENGTH) {
		return body;
	}

	const shortened = body.slice(0, ANNOUNCEMENT_PREVIEW_LENGTH - 1).trimEnd();

	return `${shortened}…`;
}

/** "1 person" or "212 people". */
export function peopleCount(count: number): string {
	return count === 1 ? '1 person' : `${count} people`;
}

/** The line under the organiser's form: "Will notify 212 people". */
export function recipientCountLine(count: number): string {
	return `Will notify ${peopleCount(count)}`;
}

/** The message after publishing: "Published and sent to 212 people." */
export function publishedMessage(count: number): string {
	return `Published and sent to ${peopleCount(count)}.`;
}

/** How many pages of `ANNOUNCEMENTS_PAGE_SIZE` a number of announcements fills. Never fewer than one. */
export function announcementPageCount(total: number): number {
	return Math.max(1, Math.ceil(total / ANNOUNCEMENTS_PAGE_SIZE));
}

/** The page of the delegate's list the address asks for, `?page=2`. Anything but a whole number above zero is page 1. */
export function readAnnouncementsPage(value: string | null): number {
	const page = Number(value);

	return Number.isInteger(page) && page > 0 ? page : 1;
}

/** What a notification's link says about the announcement it was written for. */
export type AnnouncementLink = {
	conferenceSlug: string;
	announcementId: string;
};

/**
 * Read the conference and the announcement out of a notification's link, such
 * as `/conferences/delftmun-2026/announcements?announcement=<id>`.
 *
 * The `notify_announcement` trigger writes that link. Anything else, including
 * an announcement link written before the trigger added the id, answers `null`,
 * and the notifications page then follows the link as it stands.
 */
export function readAnnouncementLink(linkPath: string): AnnouncementLink | null {
	// `pathOnThisSite` refuses a link that names another website, such as
	// `//example.com/...`, and one that does not parse at all, such as `//`,
	// which would otherwise throw and take the notifications page with it.
	const path = pathOnThisSite(linkPath);

	if (path === null) {
		return null;
	}

	// A base is needed to read a path on its own; what is left is known to parse.
	const link = new URL(path, 'http://localhost');
	const pathMatch = link.pathname.match(/^\/conferences\/([^/]+)\/announcements$/);
	const announcementId = link.searchParams.get('announcement');

	if (!pathMatch || !announcementId) {
		return null;
	}

	return { conferenceSlug: pathMatch[1], announcementId };
}
