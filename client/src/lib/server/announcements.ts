/**
 * Where both announcement pages get and keep their announcements: the
 * organiser's page at `/manage/[slug]/announcements` and the delegate's page
 * at `/conferences/[slug]/announcements`.
 *
 * Files under `$lib/server` only ever run on the server, so this is where the
 * database is queried. Every function takes the Supabase client as its first
 * argument, and pages pass in `locals.supabase`, the client that knows who is
 * signed in. Row Level Security (`specs/02-architecture/permissions.md`) then
 * decides which announcements each caller may read: a delegate gets the ones
 * addressed to everyone, to the delegates, to their committee and to their
 * delegation, and an organiser gets them all.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnnouncementInput, AudienceInput } from '$lib/announcement-form';
import {
	announcementAuthorLine,
	ANNOUNCEMENTS_PAGE_SIZE,
	type Announcement,
	type AnnouncementGroup,
	type AnnouncementAudience,
	type ReaderAnnouncement
} from '$lib/announcements';

/**
 * The columns both pages read. `committees(abbreviation)` and
 * `delegations(name)` are not columns: they ask Supabase to follow
 * `committee_id` and `delegation_id` and bring back the short name alongside.
 */
const ANNOUNCEMENT_COLUMNS =
	'id, conference_id, author_id, title, body, audience, committee_id, delegation_id, is_pinned, published_at, committees(abbreviation), delegations(name)';

/** The code Postgres answers with when an id is not a valid uuid at all. */
const INVALID_ID_CODE = '22P02';

/** The error code Supabase sends when a page number is past the last page of results. */
const PAGE_OUT_OF_RANGE_CODE = 'PGRST103';

/** One `announcements` row as `ANNOUNCEMENT_COLUMNS` reads it, under the database's own names. */
type AnnouncementRow = {
	id: string;
	conference_id: string;
	author_id: string;
	title: string;
	body: string;
	audience: AnnouncementAudience;
	committee_id: string | null;
	delegation_id: string | null;
	is_pinned: boolean;
	published_at: string;
	/** `null` for every announcement that is not for one committee. */
	committees: { abbreviation: string | null } | null;
	/** `null` for every announcement that is not for one delegation. */
	delegations: { name: string } | null;
};

/** A row as the pages hold it, with the author's name looked up in `authorNames`. */
function toAnnouncement(row: AnnouncementRow, authorNames: Map<string, string>): Announcement {
	return {
		id: row.id,
		title: row.title,
		body: row.body,
		audience: row.audience,
		committeeId: row.committee_id,
		committeeAbbreviation: row.committees?.abbreviation ?? null,
		delegationId: row.delegation_id,
		delegationName: row.delegations?.name ?? null,
		isPinned: row.is_pinned,
		publishedAt: row.published_at,
		authorId: row.author_id,
		authorName: authorNames.get(row.author_id) ?? null
	};
}

/**
 * The full names of the people who wrote these announcements, by user id.
 *
 * `announcements.author_id` points at `auth.users` rather than at `profiles`,
 * so Supabase cannot follow it the way it follows `committee_id`, and the names
 * are a second query. Everybody signed in may read a profile's name.
 */
async function readAuthorNames(
	supabase: SupabaseClient,
	rows: AnnouncementRow[]
): Promise<Map<string, string>> {
	const authorIds = [...new Set(rows.map((row) => row.author_id))];

	if (authorIds.length === 0) {
		return new Map();
	}

	const { data, error } = await supabase
		.from('profiles')
		.select('id, full_name')
		.in('id', authorIds)
		.overrideTypes<{ id: string; full_name: string | null }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read who wrote the announcements: ${error.message}`);
	}

	const names = new Map<string, string>();

	for (const profile of data ?? []) {
		if (profile.full_name) {
			names.set(profile.id, profile.full_name);
		}
	}

	return names;
}

/**
 * Which of these committee announcements were written by one of the
 * committee's own chairs, as a set of announcement ids.
 *
 * That is what makes the delegate's page say "Anna Chen (Chair)" rather than
 * "Secretariat". Only committee announcements can have been written by a chair,
 * because a chair may address nobody else.
 */
async function findChairAuthored(
	supabase: SupabaseClient,
	rows: AnnouncementRow[]
): Promise<Set<string>> {
	const committeeRows = rows.filter((row) => row.committee_id !== null);
	const committeeIds = [...new Set(committeeRows.map((row) => row.committee_id))];

	if (committeeIds.length === 0) {
		return new Set();
	}

	const { data, error } = await supabase
		.from('committee_chairs')
		.select('committee_id, user_id')
		.in('committee_id', committeeIds)
		.overrideTypes<{ committee_id: string; user_id: string }[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the committee chairs: ${error.message}`);
	}

	const chairs = (data ?? []).map((chair) => `${chair.committee_id}:${chair.user_id}`);
	const chairSet = new Set(chairs);
	const chairAuthored = new Set<string>();

	for (const row of committeeRows) {
		if (chairSet.has(`${row.committee_id}:${row.author_id}`)) {
			chairAuthored.add(row.id);
		}
	}

	return chairAuthored;
}

/**
 * Every announcement of one conference, pinned first and then newest first,
 * for the organiser's list. Row Level Security gives an organiser all of them.
 */
export async function listAnnouncementsForOrganiser(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<Announcement[]> {
	const { data, error } = await supabase
		.from('announcements')
		.select(ANNOUNCEMENT_COLUMNS)
		.eq('conference_id', conferenceId)
		.order('is_pinned', { ascending: false })
		.order('published_at', { ascending: false })
		// Replaces Supabase's guess at the row's shape with ours. It has to come last.
		.overrideTypes<AnnouncementRow[], { merge: false }>();

	if (error) {
		throw new Error(`Could not read the announcements: ${error.message}`);
	}

	const rows = data ?? [];
	const authorNames = await readAuthorNames(supabase, rows);

	return rows.map((row) => toAnnouncement(row, authorNames));
}

/**
 * One page of the announcements the signed-in reader may see, pinned first and
 * then newest first, with the total so the page can count its pages.
 *
 * Row Level Security is the filter: a delegate is handed the announcements to
 * everyone, to the delegates, to their own committee and to their own
 * delegation, and never one to the staff or to another committee.
 */
export async function listAnnouncementsFor(
	supabase: SupabaseClient,
	conferenceId: string,
	page: number
): Promise<{ rows: ReaderAnnouncement[]; total: number }> {
	// `range` counts from 0 and includes both ends, so page 1 is rows 0 to 19.
	const firstRow = (page - 1) * ANNOUNCEMENTS_PAGE_SIZE;
	const lastRow = firstRow + ANNOUNCEMENTS_PAGE_SIZE - 1;

	const { data, error, count } = await supabase
		.from('announcements')
		.select(ANNOUNCEMENT_COLUMNS, { count: 'exact' })
		.eq('conference_id', conferenceId)
		.order('is_pinned', { ascending: false })
		.order('published_at', { ascending: false })
		.range(firstRow, lastRow)
		.overrideTypes<AnnouncementRow[], { merge: false }>();

	// Somebody asked for a page past the last one, for example by editing the address.
	if (error?.code === PAGE_OUT_OF_RANGE_CODE) {
		return { rows: [], total: count ?? 0 };
	}

	if (error) {
		throw new Error(`Could not read the announcements: ${error.message}`);
	}

	const rows = data ?? [];

	// Neither lookup needs the other's answer, so they run side by side.
	const [authorNames, chairAuthored] = await Promise.all([
		readAuthorNames(supabase, rows),
		findChairAuthored(supabase, rows)
	]);

	const announcements = rows.map((row) => {
		const announcement = toAnnouncement(row, authorNames);
		const authorLine = announcementAuthorLine(announcement.authorName, chairAuthored.has(row.id));

		return { ...announcement, authorLine };
	});

	return { rows: announcements, total: count ?? 0 };
}

/** One announcement of this conference, or `null` when it is not one of its announcements. */
export async function getAnnouncement(
	supabase: SupabaseClient,
	conferenceId: string,
	announcementId: string
): Promise<Announcement | null> {
	const { data, error } = await supabase
		.from('announcements')
		.select(ANNOUNCEMENT_COLUMNS)
		.eq('conference_id', conferenceId)
		.eq('id', announcementId)
		.maybeSingle()
		.overrideTypes<AnnouncementRow, { merge: false }>();

	// A malformed id is refused by Postgres rather than simply not found. It
	// can only come from a request somebody edited by hand, and it names nothing.
	if (error?.code === INVALID_ID_CODE) {
		return null;
	}

	if (error) {
		throw new Error(`Could not read the announcement: ${error.message}`);
	}

	if (!data) {
		return null;
	}

	const authorNames = await readAuthorNames(supabase, [data]);

	return toAnnouncement(data, authorNames);
}

/**
 * Whether the signed-in reader can still open this announcement. `false` when
 * it has been deleted, which is what the notifications page asks before it
 * follows an announcement notification's link.
 */
export async function announcementExists(
	supabase: SupabaseClient,
	announcementId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('announcements')
		.select('id')
		.eq('id', announcementId)
		.maybeSingle();

	// A malformed id, as in `getAnnouncement`, names nothing.
	if (error?.code === INVALID_ID_CODE) {
		return false;
	}

	if (error) {
		throw new Error(`Could not look for the announcement: ${error.message}`);
	}

	return data !== null;
}

/** The committees of a conference, in the order the organiser arranged them. */
export async function listAnnouncementCommittees(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<AnnouncementGroup[]> {
	const { data, error } = await supabase
		.from('committees')
		.select('id, name')
		.eq('conference_id', conferenceId)
		.order('position', { ascending: true });

	if (error) {
		throw new Error(`Could not read the committees: ${error.message}`);
	}

	return data ?? [];
}

/** The accepted delegations of a conference, by name. The others have nobody to tell yet. */
export async function listAcceptedDelegations(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<AnnouncementGroup[]> {
	const { data, error } = await supabase
		.from('delegations')
		.select('id, name')
		.eq('conference_id', conferenceId)
		.eq('status', 'accepted')
		.order('name', { ascending: true });

	if (error) {
		throw new Error(`Could not read the delegations: ${error.message}`);
	}

	return data ?? [];
}

/**
 * How many people an announcement to this audience would notify.
 *
 * The database function `conference_audience_user_ids` answers who the audience
 * is, and it is the same function the `notify_announcement` trigger asks when
 * the announcement is published, so the count and the notifications cannot
 * disagree. The author is left out here because the trigger leaves them out.
 * Only somebody who can manage the conference may ask.
 */
export async function countAudience(
	supabase: SupabaseClient,
	conferenceId: string,
	audience: AudienceInput,
	authorId: string
): Promise<number> {
	// A function that returns a set of ids comes back as a plain list of them.
	const { data, error } = await supabase.rpc('conference_audience_user_ids', {
		conference_id: conferenceId,
		audience: audience.audience,
		committee_id: audience.committeeId ?? undefined,
		delegation_id: audience.delegationId ?? undefined
	});

	if (error) {
		throw new Error(`Could not count who would be notified: ${error.message}`);
	}

	const everybody: string[] = data ?? [];
	const recipients = everybody.filter((userId) => userId !== authorId);

	return recipients.length;
}

/**
 * Publish an announcement. The `notify_announcement` trigger in the database
 * writes one notification for everybody in its audience as part of the same
 * insert, so there is nothing else to do here.
 */
export async function createAnnouncement(
	supabase: SupabaseClient,
	conferenceId: string,
	authorId: string,
	input: AnnouncementInput,
	/** The id the organiser's browser chose for the row it already shows (T142), or null to let the database choose. */
	announcementId: string | null = null
): Promise<void> {
	const { error } = await supabase.from('announcements').insert({
		// The id the browser chose (`$lib/new-row-id.ts`), or the database's own.
		...(announcementId === null ? {} : { id: announcementId }),
		conference_id: conferenceId,
		author_id: authorId,
		title: input.title,
		body: input.body,
		audience: input.audience,
		committee_id: input.committeeId,
		delegation_id: input.delegationId,
		is_pinned: input.isPinned
	});

	if (error) {
		throw new Error(`Could not publish the announcement: ${error.message}`);
	}
}

/**
 * Change what an announcement says and whether it is pinned.
 *
 * The audience is not written: the database refuses to re-address an
 * announcement once it is published, and the trigger that notifies fires on an
 * insert only, so an edit tells nobody anything new.
 */
export async function updateAnnouncement(
	supabase: SupabaseClient,
	announcementId: string,
	input: Pick<AnnouncementInput, 'title' | 'body' | 'isPinned'>
): Promise<void> {
	const { error } = await supabase
		.from('announcements')
		.update({ title: input.title, body: input.body, is_pinned: input.isPinned })
		.eq('id', announcementId);

	if (error) {
		throw new Error(`Could not save the announcement: ${error.message}`);
	}
}

/** Pin an announcement to the top of both lists, or unpin it. */
export async function setAnnouncementPinned(
	supabase: SupabaseClient,
	announcementId: string,
	isPinned: boolean
): Promise<void> {
	const { error } = await supabase
		.from('announcements')
		.update({ is_pinned: isPinned })
		.eq('id', announcementId);

	if (error) {
		throw new Error(`Could not pin the announcement: ${error.message}`);
	}
}

/**
 * Delete an announcement. The notifications it sent stay, because a trigger
 * never deletes a notification; their link now leads to "That announcement was
 * removed." on the delegate's page.
 */
export async function deleteAnnouncement(
	supabase: SupabaseClient,
	announcementId: string
): Promise<void> {
	const { error } = await supabase.from('announcements').delete().eq('id', announcementId);

	if (error) {
		throw new Error(`Could not delete the announcement: ${error.message}`);
	}
}

/**
 * Mark the reader's unread announcement notifications of one conference as
 * read. Opening the announcements page is reading them. The bell is counted by
 * the layout at the same time as this runs, so it stops counting them from the
 * next page on rather than on this one.
 */
export async function markAnnouncementNotificationsRead(
	supabase: SupabaseClient,
	userId: string,
	conferenceId: string
): Promise<void> {
	const { error } = await supabase
		.from('notifications')
		.update({ read_at: new Date().toISOString() })
		.eq('user_id', userId)
		.eq('conference_id', conferenceId)
		.eq('kind', 'announcement')
		.is('read_at', null);

	if (error) {
		throw new Error(`Could not mark the announcement notifications as read: ${error.message}`);
	}
}
