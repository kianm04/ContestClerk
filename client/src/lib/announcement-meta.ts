/**
 * The quiet line under an announcement's title on the organiser's page
 * (`/manage/[slug]/announcements`): "Pinned · To everyone · Eleanor Whitfield ·
 * 3 hours ago".
 *
 * Nothing here talks to Supabase or knows any Svelte.
 */

import {
	formatPublishedAt,
	type Announcement,
	type AnnouncementAudience
} from '$lib/announcements';

/** Whom each audience is sent to, when there is no committee or delegation name to give. */
const AUDIENCE_TEXT: Record<AnnouncementAudience, string> = {
	everyone: 'To everyone',
	delegates: 'To delegates',
	staff: 'To staff',
	committee: 'To one committee',
	delegation: 'To one delegation'
};

/** What the author is called when their profile could not be read. */
const UNKNOWN_AUTHOR = 'Unknown author';

/**
 * Whom an announcement went to: "To everyone", or "To UNSC" and "To Delft High
 * School" for one committee or one delegation.
 */
export function announcementAudienceText(
	announcement: Pick<Announcement, 'audience' | 'committeeAbbreviation' | 'delegationName'>
): string {
	if (announcement.audience === 'committee' && announcement.committeeAbbreviation) {
		return `To ${announcement.committeeAbbreviation}`;
	}

	if (announcement.audience === 'delegation' && announcement.delegationName) {
		return `To ${announcement.delegationName}`;
	}

	return AUDIENCE_TEXT[announcement.audience];
}

/**
 * The whole line: "Pinned" first when it is pinned, then whom it went to, who
 * wrote it and when. The time is read in the conference's `timezone`.
 */
export function announcementMetaLine(
	announcement: Announcement,
	now: Date,
	timezone: string
): string {
	const parts = [
		announcementAudienceText(announcement),
		announcement.authorName ?? UNKNOWN_AUTHOR,
		formatPublishedAt(announcement.publishedAt, now, timezone)
	];

	if (announcement.isPinned) {
		parts.unshift('Pinned');
	}

	return parts.join(' · ');
}
