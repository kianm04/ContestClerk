import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addChair,
	addCommittee,
	addDelegation,
	addSeat,
	addStaff,
	createOpenConferenceOwnedByMe,
	giveSeatTo,
	whileTheConferenceIsJoinable,
	type ConferenceFixture
} from './conference-fixtures';

// The `announcements` row of the policy matrix in
// specs/02-architecture/permissions.md, the two checks the table carries
// itself, and the `notify_announcement` trigger of
// specs/02-architecture/notifications.md. Task T34 adds all three, and
// specs/06-features/schedule-and-announcements.md has the rules in words.
//
// Every fixture conference below is published and open for applications, for
// two reasons: a delegation can only be registered while the window is open,
// and one test needs a published conference to show that an announcement stays
// private even then.
//
// `conference_audience_user_ids`, which the trigger asks who an audience is,
// has its own tests in participant-notifications.test.ts and is not repeated
// here.

/** The title almost every announcement below is published with. */
const ANNOUNCEMENT_TITLE = 'Registration opens at 08:00 on the first day';

/** The body every announcement below is published with. It is never the point. */
const ANNOUNCEMENT_BODY = 'Doors open half an hour before the opening ceremony.';

/**
 * A headline longer than a notification title may be, yet within the 120
 * characters the `announcements` table allows a title (announcements_title_length).
 * The trigger cuts what it writes into the bell down to 99 characters, because
 * specs/02-architecture/notifications.md asks for a title under 100, and the
 * announcement itself keeps every word.
 */
const LONG_ANNOUNCEMENT_TITLE =
	'The opening ceremony has been moved to the main hall on the other side of the campus, so arrive ten minutes early.';

/** The five audiences an announcement can be addressed to. */
type Audience = 'everyone' | 'delegates' | 'staff' | 'committee' | 'delegation';

/** What `publishAnnouncement` may be told to do differently. */
type AnnouncementOptions = {
	/** `'everyone'` by default, which is the column's own default. */
	audience?: Audience;
	title?: string;
	/** Required when the audience is `'committee'`, and refused otherwise. */
	committeeId?: string;
	/** Required when the audience is `'delegation'`, and refused otherwise. */
	delegationId?: string;
};

/**
 * Publishes one announcement through the author's own client, so that the
 * insert policy has to allow it, and returns its id. A refused insert throws,
 * which is what makes a bare call to this function an assertion in itself.
 */
async function publishAnnouncement(
	author: SignedInClient,
	conferenceId: string,
	options: AnnouncementOptions = {}
): Promise<string> {
	const { data, error } = await author.supabase
		.from('announcements')
		.insert({
			conference_id: conferenceId,
			author_id: author.userId,
			title: options.title ?? ANNOUNCEMENT_TITLE,
			body: ANNOUNCEMENT_BODY,
			audience: options.audience ?? 'everyone',
			committee_id: options.committeeId ?? null,
			delegation_id: options.delegationId ?? null
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not publish the fixture announcement: ${error?.message}`);
	}

	return data.id;
}

/**
 * What this client sees of one announcement: its title, or nothing at all. A
 * refused read is never an error, because no select policy passes and the row
 * simply is not there.
 */
async function readAnnouncementTitles(
	supabase: SupabaseClient,
	announcementId: string
): Promise<string[]> {
	const { data } = await supabase.from('announcements').select('title').eq('id', announcementId);
	const rows = (data ?? []) as { title: string }[];

	return rows.map((row) => row.title);
}

/** Every announcement of one conference this client may read, sorted by title. */
async function readConferenceAnnouncementTitles(
	supabase: SupabaseClient,
	conferenceId: string
): Promise<string[]> {
	const { data } = await supabase
		.from('announcements')
		.select('title')
		.eq('conference_id', conferenceId);
	const rows = (data ?? []) as { title: string }[];

	return rows.map((row) => row.title).sort();
}

type NotificationRow = { kind: string; title: string; link_path: string };

/**
 * The announcement notifications one person can see, read through their own
 * client, because that is what proves the notifications select policy gives
 * somebody their own rows.
 *
 * Only the `announcement` kind is asked for. Being seated writes a
 * `seat_allocated` notification of its own, and that one belongs to
 * participant-notifications.test.ts rather than to this file.
 */
async function readAnnouncementNotifications(person: SignedInClient): Promise<NotificationRow[]> {
	const { data } = await person.supabase
		.from('notifications')
		.select('kind, title, link_path')
		.eq('kind', 'announcement');

	return (data ?? []) as NotificationRow[];
}

/**
 * The one notification an announcement of this conference should write.
 *
 * The link lands on the conference's announcements list and names the
 * announcement, which is what lets the notifications page's "open" action tell
 * a removed announcement from one that is still there (migration 0016, T36).
 */
function expectedNotification(
	conferenceSlug: string,
	announcementId: string,
	title: string = ANNOUNCEMENT_TITLE
): NotificationRow {
	return {
		kind: 'announcement',
		title,
		link_path: `/conferences/${conferenceSlug}/announcements?announcement=${announcementId}`
	};
}

/**
 * A brand-new account sitting in a new seat of this committee. The seat name has
 * to differ per seat, because `seats` is unique on `(committee_id, name)`, so a
 * test that seats two delegates in one committee passes a second name.
 */
async function createSeatedDelegate(
	organiser: ConferenceFixture,
	committeeId: string,
	seatName = 'France',
	countryCode = 'FR'
): Promise<SignedInClient> {
	const delegate = await createSignedInClient();
	const seatId = await addSeat(organiser.supabase, committeeId, seatName, countryCode);

	await giveSeatTo(organiser.supabase, seatId, delegate.userId);

	return delegate;
}

/**
 * A brand-new account chairing this committee. The `ensure_chair_is_staff`
 * trigger writes their `conference_staff` row at the same time, so a chair is
 * also staff of the conference.
 */
async function createChair(
	organiser: ConferenceFixture,
	committeeId: string
): Promise<SignedInClient> {
	const chair = await createSignedInClient();

	await addChair(organiser.supabase, committeeId, chair.userId);

	return chair;
}

/** A brand-new account on the conference team, in the role with no powers of its own. */
async function createVolunteer(organiser: ConferenceFixture): Promise<SignedInClient> {
	const volunteer = await createSignedInClient();

	await addStaff(organiser.supabase, organiser.conferenceId, volunteer.userId);

	return volunteer;
}

type DelegationFixture = {
	head: SignedInClient;
	member: SignedInClient;
	delegationId: string;
};

/**
 * A delegation of this conference with a head and one plain member, both
 * brand-new accounts. The member joins the way a real one does: the head reads
 * the join code, which only a head may, and `join_delegation` puts the member
 * in.
 */
async function createDelegationWithMember(
	conference: ConferenceFixture,
	name = 'Fixture Delegation'
): Promise<DelegationFixture> {
	const head = await createSignedInClient();
	const delegationId = await addDelegation(head.supabase, conference.conferenceId, name);

	const { data, error } = await head.supabase
		.from('delegations')
		.select('join_code')
		.eq('id', delegationId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the fixture delegation's join code: ${error?.message}`);
	}

	const member = await createSignedInClient();
	// The fixture conference is dated 2020, and since T25 `join_delegation`
	// reads that as "already taken place"; `whileTheConferenceIsJoinable` lifts
	// the dates for this one call and puts them straight back.
	const { error: joinError } = await whileTheConferenceIsJoinable(conference, () =>
		member.supabase.rpc('join_delegation', { code: data.join_code })
	);

	if (joinError) {
		throw new Error(`Could not join the fixture delegation: ${joinError.message}`);
	}

	return { head, member, delegationId };
}

describe('announcements_committee_matches_audience', () => {
	it('refuses an announcement to a committee that names no committee', async () => {
		const organiser = await createOpenConferenceOwnedByMe();

		const { error } = await organiser.supabase.from('announcements').insert({
			conference_id: organiser.conferenceId,
			author_id: organiser.userId,
			title: ANNOUNCEMENT_TITLE,
			body: ANNOUNCEMENT_BODY,
			audience: 'committee'
		});

		expect(error?.message).toContain('announcements_committee_matches_audience');
	});

	it('refuses an announcement to everyone that names a committee anyway', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		const { error } = await organiser.supabase.from('announcements').insert({
			conference_id: organiser.conferenceId,
			author_id: organiser.userId,
			title: ANNOUNCEMENT_TITLE,
			body: ANNOUNCEMENT_BODY,
			audience: 'everyone',
			committee_id: committeeId
		});

		// A committee on a row nobody reads as a committee announcement would be a
		// fact the select policies never ask about, so it is refused on the way in.
		expect(error?.message).toContain('announcements_committee_matches_audience');
	});
});

describe('announcements_delegation_matches_audience', () => {
	it('refuses an announcement to a delegation that names no delegation', async () => {
		const organiser = await createOpenConferenceOwnedByMe();

		const { error } = await organiser.supabase.from('announcements').insert({
			conference_id: organiser.conferenceId,
			author_id: organiser.userId,
			title: ANNOUNCEMENT_TITLE,
			body: ANNOUNCEMENT_BODY,
			audience: 'delegation'
		});

		expect(error?.message).toContain('announcements_delegation_matches_audience');
	});

	it('refuses an announcement to everyone that names a delegation anyway', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const delegation = await createDelegationWithMember(organiser);

		const { error } = await organiser.supabase.from('announcements').insert({
			conference_id: organiser.conferenceId,
			author_id: organiser.userId,
			title: ANNOUNCEMENT_TITLE,
			body: ANNOUNCEMENT_BODY,
			audience: 'everyone',
			delegation_id: delegation.delegationId
		});

		expect(error?.message).toContain('announcements_delegation_matches_audience');
	});
});

describe('announcements_check_scope', () => {
	it('lets an organiser edit an announcement addressed to a committee of their own', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'committee',
			committeeId
		});

		// The trigger looks at the committee on the row every time it is written,
		// an edit included, and this one belongs to this conference, so it says
		// nothing. The committee itself cannot be changed by an edit at all --
		// protect_announcements_columns refuses that, and has its own tests
		// further down -- so what this proves is the other half: the check does
		// not stand in the way of an ordinary edit to a committee announcement.
		const { data, error } = await organiser.supabase
			.from('announcements')
			.update({ title: 'Registration opens at 09:00 instead' })
			.eq('id', announcementId)
			.select('title, committee_id');

		expect(error).toBeNull();
		expect(data).toEqual([
			{ title: 'Registration opens at 09:00 instead', committee_id: committeeId }
		]);
	});

	it('refuses an announcement naming a committee of another conference', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const otherConference = await createOpenConferenceOwnedByMe();
		const theirCommitteeId = await addCommittee(
			otherConference.supabase,
			otherConference.conferenceId
		);

		const { error } = await organiser.supabase.from('announcements').insert({
			conference_id: organiser.conferenceId,
			author_id: organiser.userId,
			title: ANNOUNCEMENT_TITLE,
			body: ANNOUNCEMENT_BODY,
			audience: 'committee',
			committee_id: theirCommitteeId
		});

		expect(error?.message).toContain('That committee is not part of this conference');
	});

	it("refuses an announcement being edited onto another conference's delegation", async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const delegation = await createDelegationWithMember(organiser);

		const otherConference = await createOpenConferenceOwnedByMe();
		const theirHead = await createSignedInClient();
		const theirDelegationId = await addDelegation(theirHead.supabase, otherConference.conferenceId);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'delegation',
			delegationId: delegation.delegationId
		});

		// The trigger fires on an update as well as on an insert, which is the
		// half `notify_announcement` could never catch: that one only runs when a
		// row is published. protect_announcements_columns would refuse this edit
		// too, and the message proves which of the two spoke: triggers on the same
		// event run in name order, so `announcements_check_scope` is asked first.
		const { error } = await organiser.supabase
			.from('announcements')
			.update({ delegation_id: theirDelegationId })
			.eq('id', announcementId);

		expect(error?.message).toContain('That delegation is not part of this conference');
	});
});

describe('announcements meant for everyone', () => {
	it('lets a seated delegate and a volunteer of the conference read it', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);
		const volunteer = await createVolunteer(organiser);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId);

		expect(await readAnnouncementTitles(delegate.supabase, announcementId)).toEqual([
			ANNOUNCEMENT_TITLE
		]);
		expect(await readAnnouncementTitles(volunteer.supabase, announcementId)).toEqual([
			ANNOUNCEMENT_TITLE
		]);
	});

	it('shows it to neither a signed-in stranger nor a signed-out visitor', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId);
		const stranger = await createSignedInClient();

		expect(await readAnnouncementTitles(stranger.supabase, announcementId)).toEqual([]);

		// The fixture conference is published, which is what makes its page, its
		// committees and its fees readable by anybody at all. An announcement is
		// never public even so: every select policy on the table is "to
		// authenticated" and asks the reader to take part in the conference or to
		// help run it.
		expect(await readAnnouncementTitles(createVisitorClient(), announcementId)).toEqual([]);
	});
});

describe('announcements meant for the delegates', () => {
	it('lets a participant read it', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'delegates'
		});

		expect(await readAnnouncementTitles(delegate.supabase, announcementId)).toEqual([
			ANNOUNCEMENT_TITLE
		]);
	});

	it('hides it from a volunteer on the team, who helps run it but does not take part', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const volunteer = await createVolunteer(organiser);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'delegates'
		});

		expect(await readAnnouncementTitles(volunteer.supabase, announcementId)).toEqual([]);
	});
});

describe('announcements meant for the team', () => {
	it('lets a volunteer read it', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const volunteer = await createVolunteer(organiser);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'staff'
		});

		expect(await readAnnouncementTitles(volunteer.supabase, announcementId)).toEqual([
			ANNOUNCEMENT_TITLE
		]);
	});

	it('hides it from a seated delegate, who takes part but does not help run it', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'staff'
		});

		expect(await readAnnouncementTitles(delegate.supabase, announcementId)).toEqual([]);
	});
});

describe('announcements meant for one committee', () => {
	it("lets the committee's own delegate and its chair read it", async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);
		const chair = await createChair(organiser, committeeId);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'committee',
			committeeId
		});

		expect(await readAnnouncementTitles(delegate.supabase, announcementId)).toEqual([
			ANNOUNCEMENT_TITLE
		]);
		expect(await readAnnouncementTitles(chair.supabase, announcementId)).toEqual([
			ANNOUNCEMENT_TITLE
		]);
	});

	it('hides it from a delegate of another committee of the same conference', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const otherCommitteeId = await addCommittee(
			organiser.supabase,
			organiser.conferenceId,
			'General Assembly'
		);
		const otherDelegate = await createSeatedDelegate(organiser, otherCommitteeId);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'committee',
			committeeId
		});

		// Being a participant of the conference is not enough: this policy asks
		// `is_committee_delegate` about the committee the row names.
		expect(await readAnnouncementTitles(otherDelegate.supabase, announcementId)).toEqual([]);
	});
});

describe('announcements meant for one delegation', () => {
	it('lets a member of that delegation read it', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const delegation = await createDelegationWithMember(organiser);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'delegation',
			delegationId: delegation.delegationId
		});

		expect(await readAnnouncementTitles(delegation.member.supabase, announcementId)).toEqual([
			ANNOUNCEMENT_TITLE
		]);
	});

	it('hides it from a participant who is not in that delegation', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);
		const delegation = await createDelegationWithMember(organiser);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'delegation',
			delegationId: delegation.delegationId
		});

		expect(await readAnnouncementTitles(delegate.supabase, announcementId)).toEqual([]);
	});
});

describe('announcements, reading them as the organiser', () => {
	it('shows an organiser every announcement of their conference, including ones they did not write', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const chair = await createChair(organiser, committeeId);
		const delegation = await createDelegationWithMember(organiser);

		await publishAnnouncement(chair, organiser.conferenceId, {
			title: "The chair's own word",
			audience: 'committee',
			committeeId
		});
		await publishAnnouncement(organiser, organiser.conferenceId, {
			title: 'To the delegates',
			audience: 'delegates'
		});
		await publishAnnouncement(organiser, organiser.conferenceId, {
			title: 'To one delegation',
			audience: 'delegation',
			delegationId: delegation.delegationId
		});

		// One statement, the way the organiser's announcements page reads the
		// table. The organiser is in none of these three audiences themselves, so
		// this is the "org. always" line of the matrix and nothing else.
		const titles = await readConferenceAnnouncementTitles(
			organiser.supabase,
			organiser.conferenceId
		);

		expect(titles).toEqual(["The chair's own word", 'To one delegation', 'To the delegates']);
	});
});

describe('announcements, publishing one', () => {
	it('lets an organiser publish to every audience there is', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegation = await createDelegationWithMember(organiser);

		// `publishAnnouncement` throws when the insert is refused, so five calls
		// that return are five audiences the insert policy allowed.
		await publishAnnouncement(organiser, organiser.conferenceId, {
			title: 'To everyone',
			audience: 'everyone'
		});
		await publishAnnouncement(organiser, organiser.conferenceId, {
			title: 'To the delegates',
			audience: 'delegates'
		});
		await publishAnnouncement(organiser, organiser.conferenceId, {
			title: 'To the team',
			audience: 'staff'
		});
		await publishAnnouncement(organiser, organiser.conferenceId, {
			title: 'To one committee',
			audience: 'committee',
			committeeId
		});
		await publishAnnouncement(organiser, organiser.conferenceId, {
			title: 'To one delegation',
			audience: 'delegation',
			delegationId: delegation.delegationId
		});

		const titles = await readConferenceAnnouncementTitles(
			organiser.supabase,
			organiser.conferenceId
		);

		expect(titles).toEqual([
			'To everyone',
			'To one committee',
			'To one delegation',
			'To the delegates',
			'To the team'
		]);
	});

	it("refuses an announcement signed with somebody else's name", async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);

		const { error } = await organiser.supabase.from('announcements').insert({
			conference_id: organiser.conferenceId,
			author_id: delegate.userId,
			title: ANNOUNCEMENT_TITLE,
			body: ANNOUNCEMENT_BODY,
			audience: 'everyone'
		});

		// Both insert policies ask for `author_id = auth.uid()`, so an organiser
		// cannot put somebody else's name on an announcement.
		expect(error).not.toBeNull();
	});

	it('lets a chair publish to their own committee and tells its delegates', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const chair = await createChair(organiser, committeeId);
		const delegate = await createSeatedDelegate(organiser, committeeId);

		const announcementId = await publishAnnouncement(chair, organiser.conferenceId, {
			audience: 'committee',
			committeeId
		});

		expect(await readAnnouncementTitles(chair.supabase, announcementId)).toEqual([
			ANNOUNCEMENT_TITLE
		]);

		// This is the case `conference_audience_user_ids` was replaced for. The
		// trigger runs inside the chair's own request, and until T34 the function
		// it asks turned a chair away, so the one audience a chair may address
		// would have been the one nobody could address.
		expect(await readAnnouncementNotifications(delegate)).toEqual([
			expectedNotification(organiser.conferenceSlug, announcementId)
		]);
	});

	it('refuses a delegate of the committee, who is not one of its chairs', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);

		// The other half of the exception the test above is about. The gate for
		// `audience = 'committee'` is `has_committee_permission(id, 'run_room')`, which is true of a
		// chair and of anybody who can manage the conference, and of nobody else
		// -- so sitting in the committee is not enough to be told who else does.
		const { error } = await delegate.supabase.rpc('conference_audience_user_ids', {
			conference_id: organiser.conferenceId,
			audience: 'committee',
			committee_id: committeeId,
			delegation_id: null
		});

		expect(error?.message).toContain('Only the organisers of a conference');
	});

	it('refuses a chair publishing to the whole conference', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const chair = await createChair(organiser, committeeId);

		const toEveryone = await chair.supabase.from('announcements').insert({
			conference_id: organiser.conferenceId,
			author_id: chair.userId,
			title: ANNOUNCEMENT_TITLE,
			body: ANNOUNCEMENT_BODY,
			audience: 'everyone'
		});

		const toDelegates = await chair.supabase.from('announcements').insert({
			conference_id: organiser.conferenceId,
			author_id: chair.userId,
			title: ANNOUNCEMENT_TITLE,
			body: ANNOUNCEMENT_BODY,
			audience: 'delegates'
		});

		const toStaff = await chair.supabase.from('announcements').insert({
			conference_id: organiser.conferenceId,
			author_id: chair.userId,
			title: ANNOUNCEMENT_TITLE,
			body: ANNOUNCEMENT_BODY,
			audience: 'staff'
		});

		expect(toEveryone.error).not.toBeNull();
		expect(toDelegates.error).not.toBeNull();
		expect(toStaff.error).not.toBeNull();
	});

	it('refuses a chair publishing to another committee of the same conference', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const otherCommitteeId = await addCommittee(
			organiser.supabase,
			organiser.conferenceId,
			'General Assembly'
		);
		const chair = await createChair(organiser, committeeId);

		const { error } = await chair.supabase.from('announcements').insert({
			conference_id: organiser.conferenceId,
			author_id: chair.userId,
			title: ANNOUNCEMENT_TITLE,
			body: ANNOUNCEMENT_BODY,
			audience: 'committee',
			committee_id: otherCommitteeId
		});

		expect(error).not.toBeNull();
	});

	it('refuses a plain participant publishing anything at all', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);

		const { error } = await delegate.supabase.from('announcements').insert({
			conference_id: organiser.conferenceId,
			author_id: delegate.userId,
			title: ANNOUNCEMENT_TITLE,
			body: ANNOUNCEMENT_BODY,
			audience: 'everyone'
		});

		expect(error).not.toBeNull();
	});
});

describe('announcements, editing and deleting one', () => {
	it('lets the author edit and delete their own announcement', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const chair = await createChair(organiser, committeeId);

		const announcementId = await publishAnnouncement(chair, organiser.conferenceId, {
			audience: 'committee',
			committeeId
		});

		const { data, error } = await chair.supabase
			.from('announcements')
			.update({ title: 'Registration opens at 09:00 instead' })
			.eq('id', announcementId)
			.select('title');

		expect(error).toBeNull();
		expect(data).toEqual([{ title: 'Registration opens at 09:00 instead' }]);

		await chair.supabase.from('announcements').delete().eq('id', announcementId);

		// Read back through the organiser, who may read every announcement of
		// their conference, so that a row hidden from the chair could not be
		// mistaken for a row that is gone.
		expect(await readAnnouncementTitles(organiser.supabase, announcementId)).toEqual([]);
	});

	it("lets an organiser edit and delete somebody else's announcement", async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const chair = await createChair(organiser, committeeId);

		const announcementId = await publishAnnouncement(chair, organiser.conferenceId, {
			audience: 'committee',
			committeeId
		});

		const { data, error } = await organiser.supabase
			.from('announcements')
			.update({ title: 'Please ignore the message above' })
			.eq('id', announcementId)
			.select('title');

		expect(error).toBeNull();
		expect(data).toEqual([{ title: 'Please ignore the message above' }]);

		await organiser.supabase.from('announcements').delete().eq('id', announcementId);

		expect(await readAnnouncementTitles(organiser.supabase, announcementId)).toEqual([]);
	});

	it("refuses a chair editing or deleting an organiser's announcement", async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const chair = await createChair(organiser, committeeId);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'everyone'
		});

		// A chair is staff, so they read this announcement perfectly well. Reading
		// it is the whole of what they may do with it.
		expect(await readAnnouncementTitles(chair.supabase, announcementId)).toEqual([
			ANNOUNCEMENT_TITLE
		]);

		// Nothing is refused out loud: the update and delete policies hide the row
		// from anybody who is neither its author nor an organiser, so both
		// statements match nothing at all.
		const { data } = await chair.supabase
			.from('announcements')
			.update({ title: 'Never mind what the organisers said' })
			.eq('id', announcementId)
			.select('title');

		expect(data).toEqual([]);

		await chair.supabase.from('announcements').delete().eq('id', announcementId);

		expect(await readAnnouncementTitles(organiser.supabase, announcementId)).toEqual([
			ANNOUNCEMENT_TITLE
		]);
	});
});

describe('protect_announcements_columns', () => {
	it('lets the author change what their announcement says and pin it', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const chair = await createChair(organiser, committeeId);

		const announcementId = await publishAnnouncement(chair, organiser.conferenceId, {
			audience: 'committee',
			committeeId
		});

		// The words and the pin are the two things an edit is for, and the guard
		// leaves both alone.
		const { data, error } = await chair.supabase
			.from('announcements')
			.update({
				title: 'Registration opens at 09:00 instead',
				body: 'The doors were opening an hour before the ceremony, which was too early.',
				is_pinned: true
			})
			.eq('id', announcementId)
			.select('title, is_pinned');

		expect(error).toBeNull();
		expect(data).toEqual([{ title: 'Registration opens at 09:00 instead', is_pinned: true }]);
	});

	it('refuses a chair re-addressing their committee announcement to everyone', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const otherCommitteeId = await addCommittee(
			organiser.supabase,
			organiser.conferenceId,
			'General Assembly'
		);
		const chair = await createChair(organiser, committeeId);
		const outsider = await createSeatedDelegate(organiser, otherCommitteeId);

		const announcementId = await publishAnnouncement(chair, organiser.conferenceId, {
			audience: 'committee',
			committeeId
		});

		// The insert policies say a chair writes to their own committee and to
		// nothing else, and the tests above prove they cannot publish to the whole
		// conference. The update policy is "the author or an organiser", and its
		// author branch is true whatever the row has been turned into -- so
		// without the column guard this edit would carry the same message to
		// everybody taking part, and pin it to the top of their list.
		const { error } = await chair.supabase
			.from('announcements')
			.update({ audience: 'everyone', committee_id: null, is_pinned: true })
			.eq('id', announcementId);

		expect(error?.message).toContain('An announcement cannot be re-addressed');

		// A delegate of the other committee is a participant of the conference, so
		// an announcement to everyone would be theirs to read. This one still is
		// not.
		expect(await readAnnouncementTitles(outsider.supabase, announcementId)).toEqual([]);
	});

	it('refuses a chair re-addressing their committee announcement to the team', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const chair = await createChair(organiser, committeeId);
		const volunteer = await createVolunteer(organiser);

		const announcementId = await publishAnnouncement(chair, organiser.conferenceId, {
			audience: 'committee',
			committeeId
		});

		const { error } = await chair.supabase
			.from('announcements')
			.update({ audience: 'staff', committee_id: null })
			.eq('id', announcementId);

		expect(error?.message).toContain('An announcement cannot be re-addressed');
		expect(await readAnnouncementTitles(volunteer.supabase, announcementId)).toEqual([]);
	});

	it('refuses a chair moving their announcement to another committee', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const otherCommitteeId = await addCommittee(
			organiser.supabase,
			organiser.conferenceId,
			'General Assembly'
		);
		const chair = await createChair(organiser, committeeId);

		const announcementId = await publishAnnouncement(chair, organiser.conferenceId, {
			audience: 'committee',
			committeeId
		});

		const { error } = await chair.supabase
			.from('announcements')
			.update({ committee_id: otherCommitteeId })
			.eq('id', announcementId);

		expect(error?.message).toContain('An announcement cannot be re-addressed');
	});

	it('refuses an organiser re-addressing an announcement of their own', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'staff'
		});

		// The guard holds every browser, an organiser included. They may address
		// any audience they like on the way in, so nothing is taken away from
		// them: they delete this one and write the announcement they meant, which
		// is also the only thing that notifies the audience they meant.
		const { error } = await organiser.supabase
			.from('announcements')
			.update({ audience: 'everyone' })
			.eq('id', announcementId);

		expect(error?.message).toContain('An announcement cannot be re-addressed');
	});

	it('refuses moving an announcement to another conference', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const otherConference = await createOpenConferenceOwnedByMe();
		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId);

		const { error } = await organiser.supabase
			.from('announcements')
			.update({ conference_id: otherConference.conferenceId })
			.eq('id', announcementId);

		expect(error?.message).toContain('An announcement cannot be re-addressed');
	});
});

describe('announcements_set_updated_at, the trigger that stamps a change', () => {
	it('stamps the moment an announcement was last edited, whatever the caller sent', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId);

		const { data: before } = await organiser.supabase
			.from('announcements')
			.select('updated_at')
			.eq('id', announcementId)
			.single();

		// The backdated `updated_at` travels with a real change, so the trigger has
		// something to do and it is the trigger's value that wins rather than the
		// author's. Without it, "when was this last edited?" would be a question
		// the person editing it gets to answer.
		const { data: after } = await organiser.supabase
			.from('announcements')
			.update({
				title: 'Registration opens at 09:00 instead',
				updated_at: '2020-01-01T00:00:00Z'
			})
			.eq('id', announcementId)
			.select('updated_at')
			.single();

		expect(new Date(after?.updated_at).getTime()).toBeGreaterThan(
			new Date(before?.updated_at).getTime()
		);
	});
});

describe('notify_announcement, announcements_notify_published', () => {
	it('tells every delegate, delegation member and staff member about an announcement to everyone', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);
		const volunteer = await createVolunteer(organiser);
		const delegation = await createDelegationWithMember(organiser);

		// A delegation is told what is said to everyone once its head has sent
		// it; a draft is still nobody's business but its own (migration
		// 20261022140000, security review M5).
		await delegation.head.supabase
			.from('delegations')
			.update({ status: 'submitted' })
			.eq('id', delegation.delegationId);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'everyone'
		});

		const expected = [expectedNotification(organiser.conferenceSlug, announcementId)];

		expect(await readAnnouncementNotifications(delegate)).toEqual(expected);
		expect(await readAnnouncementNotifications(delegation.member)).toEqual(expected);
		expect(await readAnnouncementNotifications(volunteer)).toEqual(expected);
	});

	it('leaves the author out, even when they are in the audience themselves', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);

		// An organiser is a member of the organisation running the conference,
		// which counts as staff, so "everyone" really does include them here.
		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'everyone'
		});

		expect(await readAnnouncementNotifications(organiser)).toEqual([]);
		expect(await readAnnouncementNotifications(delegate)).toEqual([
			expectedNotification(organiser.conferenceSlug, announcementId)
		]);
	});

	it('shortens a long title for the bell and leaves the announcement whole', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			title: LONG_ANNOUNCEMENT_TITLE
		});

		const [notification] = await readAnnouncementNotifications(delegate);

		expect(notification.title).toHaveLength(99);
		expect(notification.title.endsWith('…')).toBe(true);
		expect(notification.title.slice(0, 98)).toBe(LONG_ANNOUNCEMENT_TITLE.slice(0, 98));

		// Only the line in the bell is cut. The announcement the delegate opens
		// still says everything the organiser typed.
		expect(await readAnnouncementTitles(delegate.supabase, announcementId)).toEqual([
			LONG_ANNOUNCEMENT_TITLE
		]);
	});

	it("reaches a committee's delegates and chairs and nobody else", async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const otherCommitteeId = await addCommittee(
			organiser.supabase,
			organiser.conferenceId,
			'General Assembly'
		);
		const delegate = await createSeatedDelegate(organiser, committeeId);
		const chair = await createChair(organiser, committeeId);
		const otherDelegate = await createSeatedDelegate(organiser, otherCommitteeId);
		const volunteer = await createVolunteer(organiser);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId, {
			audience: 'committee',
			committeeId
		});

		const expected = [expectedNotification(organiser.conferenceSlug, announcementId)];

		expect(await readAnnouncementNotifications(delegate)).toEqual(expected);
		expect(await readAnnouncementNotifications(chair)).toEqual(expected);

		// The volunteer is staff of the same conference and the other delegate
		// takes part in it, and neither of them is in this committee.
		expect(await readAnnouncementNotifications(otherDelegate)).toEqual([]);
		expect(await readAnnouncementNotifications(volunteer)).toEqual([]);
	});

	it('writes nothing new when the announcement is edited afterwards', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId);

		await organiser.supabase
			.from('announcements')
			.update({ title: 'Registration opens at 09:00 instead' })
			.eq('id', announcementId);

		// The trigger fires after an insert and after nothing else, which is what
		// specs/06-features/schedule-and-announcements.md means by "editing does
		// not re-notify". The one notification still carries the published title.
		expect(await readAnnouncementNotifications(delegate)).toEqual([
			expectedNotification(organiser.conferenceSlug, announcementId)
		]);
	});

	it('keeps the notification, and the link naming the announcement, after it is deleted', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSeatedDelegate(organiser, committeeId);

		const announcementId = await publishAnnouncement(organiser, organiser.conferenceId);

		const { error } = await organiser.supabase
			.from('announcements')
			.delete()
			.eq('id', announcementId);

		expect(error).toBeNull();

		// Notifications are never deleted by triggers (notifications.md). The id in
		// the link is what the notifications page asks about, and the delegate can
		// no longer read an announcement by that id, which is how it knows.
		expect(await readAnnouncementNotifications(delegate)).toEqual([
			expectedNotification(organiser.conferenceSlug, announcementId)
		]);
		expect(await readAnnouncementTitles(delegate.supabase, announcementId)).toEqual([]);
	});
});
