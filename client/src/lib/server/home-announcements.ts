/**
 * The newest announcements across the conferences a person takes part in or
 * helps run, for the home page's "Announcements" section.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. `loadHomeDashboard` in `./home.ts` calls this once it
 * knows the reader's conferences, and asks about all of them at once, so a
 * person at six conferences costs no more requests than one at one. The two
 * announcement pages read the full rows through `./announcements.ts`; this
 * reads three columns of the newest few.
 *
 * Row Level Security is the filter that matters: `announcements` has one select
 * policy per audience, so a delegate is handed the ones to everyone, to the
 * delegates, to their committee and to their delegation, and never one to the
 * staff or to another committee. Nothing about the audience is written here.
 * The `conference_id` filter is here all the same, so that if a policy ever let
 * anybody read any conference's announcements the list would still be the
 * reader's own.
 *
 * There is no `published_at <= now` condition because the table has no
 * scheduling: `published_at` defaults to the moment of the insert, nothing in
 * the app writes it, and the trigger that notifies the audience fires on that
 * same insert. An announcement that exists has been published.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HomeAnnouncement } from '$lib/home';

/** How many announcements the home page lists. */
const HOME_ANNOUNCEMENT_LIMIT = 3;

/**
 * One row as the query brings it back, under the database's own names.
 * `conferences(...)` is not a column: it asks Supabase to follow
 * `conference_id` and bring the conference's name, slug and timezone alongside.
 */
type HomeAnnouncementRow = {
	id: string;
	title: string;
	published_at: string;
	conference_id: string;
	/** `null` when Row Level Security withheld the conference the announcement belongs to. */
	conferences: { name: string; slug: string; timezone: string } | null;
};

/**
 * The newest announcements the reader may see at these conferences, newest
 * first, at most `limit` of them.
 */
export async function listHomeAnnouncements(
	supabase: SupabaseClient,
	conferenceIds: string[],
	limit: number = HOME_ANNOUNCEMENT_LIMIT
): Promise<HomeAnnouncement[]> {
	// Somebody at no conference has no announcements to read, and an empty list
	// would have to be written as `in.()`, which PostgREST refuses. So nothing
	// is sent.
	if (conferenceIds.length === 0) {
		return [];
	}

	const { data, error } = await supabase
		.from('announcements')
		.select('id, title, published_at, conference_id, conferences(name, slug, timezone)')
		.in('conference_id', conferenceIds)
		.order('published_at', { ascending: false })
		.limit(limit)
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<HomeAnnouncementRow[], { merge: false }>();

	// A failed query means a bug (a wrong column name, a missing policy), not
	// something the reader can fix, so it shows the error page.
	if (error) {
		throw new Error(`Could not read your conferences' announcements: ${error.message}`);
	}

	const announcements: HomeAnnouncement[] = [];

	for (const row of data ?? []) {
		// A conference that could not be read leaves the announcement with no name
		// beside it and no timezone to date it in, so it is left out rather than
		// drawn half empty. `listUpcomingEvents` in `./home.ts` follows the same rule.
		if (row.conferences === null) {
			continue;
		}

		announcements.push({
			id: row.id,
			title: row.title,
			publishedAt: row.published_at,
			conferenceName: row.conferences.name,
			conferenceSlug: row.conferences.slug,
			conferenceTimezone: row.conferences.timezone
		});
	}

	return announcements;
}
