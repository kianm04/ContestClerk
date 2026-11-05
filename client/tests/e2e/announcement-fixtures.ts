import { createServiceRoleClient, createVisitorClient } from '../db/supabase-test-client';
import { TEST_PASSWORD, type TestUser } from './signed-in-user';

// What the two announcement browser tests, `manage-announcements.spec.ts` and
// `announcements.spec.ts`, set up and read back on top of `schedule-fixtures.ts`,
// which already makes a conference, its committees and its seated delegates.
//
// An announcement is published by its own author, signed in, the way the
// organiser's form publishes it: the `notify_announcement` trigger asks who the
// audience is on the author's behalf, and refuses anybody who could not publish
// it. The service-role client reads the notifications back, because nobody but
// the database can see all of them at once, and arranges the rest of the state
// a test begins in. It is never used to show that something is allowed, which
// is what `tests/db/supabase-test-client.ts` warns against.

/** One announcement, as `addAnnouncement` writes it. */
export type AnnouncementSeed = {
	conferenceId: string;
	/** An organiser of the conference, or a chair of the committee it is for. */
	author: TestUser;
	title: string;
	body?: string;
	audience?: 'everyone' | 'delegates' | 'staff' | 'committee';
	/** Set exactly when `audience` is `committee`, which the table insists on. */
	committeeId?: string;
	isPinned?: boolean;
	/** An ISO timestamp; now by default. Older ones sort further down. */
	publishedAt?: string;
};

/** The row `announcements` stores for one seed. */
function toAnnouncementRow(seed: AnnouncementSeed) {
	return {
		conference_id: seed.conferenceId,
		author_id: seed.author.id,
		title: seed.title,
		body: seed.body ?? 'Details to follow.',
		audience: seed.audience ?? 'everyone',
		committee_id: seed.committeeId ?? null,
		is_pinned: seed.isPinned ?? false,
		published_at: seed.publishedAt ?? new Date().toISOString()
	};
}

/**
 * Publish several announcements by the same author at once, and answer their ids.
 *
 * The author is signed in once for the whole list. Inserting them fires
 * `notify_announcement` once per row, so their audiences are notified exactly
 * as when the organiser presses "Publish announcement" that many times.
 */
export async function addAnnouncements(
	author: TestUser,
	seeds: AnnouncementSeed[]
): Promise<string[]> {
	const client = createVisitorClient();

	const { error: signInError } = await client.auth.signInWithPassword({
		email: author.email,
		password: TEST_PASSWORD
	});

	if (signInError) {
		throw new Error(`Could not sign the test author in: ${signInError.message}`);
	}

	const { data, error } = await client
		.from('announcements')
		.insert(seeds.map(toAnnouncementRow))
		.select('id');

	if (error || !data) {
		throw new Error(`Could not publish the test announcements: ${error?.message}`);
	}

	return data.map((row) => row.id);
}

/** Publish one announcement, and answer its id. */
export async function addAnnouncement(seed: AnnouncementSeed): Promise<string> {
	const [announcementId] = await addAnnouncements(seed.author, [seed]);

	return announcementId;
}

/** Delete one announcement, as the organiser's "Delete" does. Its notifications stay. */
export async function removeAnnouncement(announcementId: string): Promise<void> {
	const admin = createServiceRoleClient();

	const { error } = await admin.from('announcements').delete().eq('id', announcementId);

	if (error) {
		throw new Error(`Could not delete the test announcement: ${error.message}`);
	}
}

/**
 * Who has been notified of this conference's announcements, one user id per
 * notification, according to the database itself.
 */
export async function readAnnouncementRecipients(conferenceId: string): Promise<string[]> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('notifications')
		.select('user_id')
		.eq('conference_id', conferenceId)
		.eq('kind', 'announcement');

	if (error) {
		throw new Error(`Could not read the test notifications: ${error.message}`);
	}

	return (data ?? []).map((row) => row.user_id);
}

/** How many of one person's notifications are still unread, according to the database. */
export async function countUnreadNotifications(userId: string): Promise<number> {
	const admin = createServiceRoleClient();

	const { count, error } = await admin
		.from('notifications')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', userId)
		.is('read_at', null);

	if (error) {
		throw new Error(`Could not count the test notifications: ${error.message}`);
	}

	return count ?? 0;
}

/** Eight capital letters and digits, the shape a delegation's join code takes. */
function unusedJoinCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const characters: string[] = [];

	for (let position = 0; position < 8; position += 1) {
		characters.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
	}

	return characters.join('');
}

/** Add an accepted delegation to a conference, which makes it one an announcement can name. */
export async function addAcceptedDelegation(conferenceId: string, name: string): Promise<string> {
	const admin = createServiceRoleClient();

	const { data, error } = await admin
		.from('delegations')
		.insert({
			conference_id: conferenceId,
			name,
			institution_name: 'Riverside High School',
			status: 'accepted',
			join_code: unusedJoinCode(),
			submitted_at: new Date().toISOString()
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not write the test delegation: ${error?.message}`);
	}

	return data.id;
}
