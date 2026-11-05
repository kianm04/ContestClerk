import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addApplication,
	addChair,
	addCommittee,
	addDelegation,
	addSeat,
	addStaff,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveSeatTo,
	whileTheConferenceIsJoinable,
	type ConferenceFixture
} from './conference-fixtures';

// The notification triggers migration 20260918120000_applications_delegations_seat_links.sql
// adds, and the three select policies it widens now that "a participant" has a
// meaning. See specs/02-architecture/notifications.md for the table of who
// gets told what, and specs/02-architecture/permissions.md for the three
// policies.
//
// The five triggers under test, by their function and trigger name:
//   notify_application_decided / applications_notify_decided
//   notify_delegation_decided / delegations_notify_decided
//   notify_seat_allocated / seats_notify_allocated
//   notify_delegation_seat_assigned / seats_notify_delegation_seat_assigned
//   notify_delegation_seats / seats_notify_delegation_seats
// plus the function both an announcement and a schedule change will use later,
// conference_audience_user_ids.
//
// Every test reads a notification through the recipient's own signed-in
// client, the same way notifications.test.ts does, because that is what
// proves the select policy really lets them see it. Nobody in these tests is
// reused across two `it` blocks, so a fresh account's notifications are
// exactly the ones this one test caused.

/**
 * Turns a second person into a head of an existing delegation, the way a real
 * co-head is added: they join with the code, and a head who is already in
 * promotes them. Several tests below need two heads, to prove a notification
 * reaches all of them and not only whoever registered the delegation first.
 */
async function addSecondHead(
	conference: ConferenceFixture,
	firstHead: SignedInClient,
	delegationId: string
): Promise<SignedInClient> {
	const joinCode = await readJoinCode(firstHead, delegationId);
	const secondHead = await createSignedInClient();

	// Every fixture conference is dated 2020, which `join_delegation` now reads
	// as "already taken place"; `whileTheConferenceIsJoinable` lifts that for
	// this one call and puts it straight back.
	await whileTheConferenceIsJoinable(conference, () =>
		secondHead.supabase.rpc('join_delegation', { code: joinCode })
	);
	await firstHead.supabase
		.from('delegation_members')
		.update({ role: 'head' })
		.eq('delegation_id', delegationId)
		.eq('user_id', secondHead.userId);

	return secondHead;
}

/** Adds a new person to a delegation as a plain member, through the join code. */
async function addMember(
	conference: ConferenceFixture,
	head: SignedInClient,
	delegationId: string
): Promise<SignedInClient> {
	const joinCode = await readJoinCode(head, delegationId);
	const member = await createSignedInClient();

	await whileTheConferenceIsJoinable(conference, () =>
		member.supabase.rpc('join_delegation', { code: joinCode })
	);

	return member;
}

/** The join code of a delegation, read the way its own head would. */
async function readJoinCode(head: SignedInClient, delegationId: string): Promise<string> {
	const { data, error } = await head.supabase
		.from('delegations')
		.select('join_code')
		.eq('id', delegationId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the fixture delegation's join code: ${error?.message}`);
	}

	return data.join_code;
}

describe('notify_application_decided, applications_notify_decided', () => {
	it('tells the applicant their application was accepted', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});

		// Accepting is accept_application's, which runs as the database's owner,
		// and the trigger fires for it the same; the seat it also hands out is
		// beside the point here.
		await createServiceRoleClient()
			.from('applications')
			.update({ status: 'accepted' })
			.eq('id', applicationId);

		const { data } = await applicant.supabase
			.from('notifications')
			.select('kind, title, link_path');

		expect(data).toEqual([
			{
				kind: 'application_decided',
				title: 'Your application to Fixture Conference was accepted',
				link_path: `/applications/${applicationId}`
			}
		]);
	});

	it('tells the applicant their application was not accepted, when it is rejected', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});

		await organiser.supabase
			.from('applications')
			.update({ status: 'rejected' })
			.eq('id', applicationId);

		const { data } = await applicant.supabase.from('notifications').select('title, link_path');

		expect(data).toEqual([
			{
				title: 'Your application to Fixture Conference was not accepted',
				link_path: `/applications/${applicationId}`
			}
		]);
	});

	it('tells the applicant their application was waitlisted', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});

		await organiser.supabase
			.from('applications')
			.update({ status: 'waitlisted' })
			.eq('id', applicationId);

		const { data } = await applicant.supabase.from('notifications').select('title');

		expect(data).toEqual([{ title: 'Your application to Fixture Conference was waitlisted' }]);
	});

	it('sends nothing when the status moves to something that is not a decision', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});

		// The applicant withdrawing their own submitted application is a status
		// change, but withdrawn is not a decision an organiser made.
		await applicant.supabase
			.from('applications')
			.update({ status: 'withdrawn' })
			.eq('id', applicationId);

		const { data } = await applicant.supabase.from('notifications').select('title');

		expect(data).toEqual([]);
	});

	it('sends nothing when a save does not change the status', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const applicant = await createSignedInClient();
		const applicationId = await addApplication(applicant.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});

		// The update names "submitted" again, the status the row already has, so
		// the trigger runs but the "status changed" check inside it says no.
		await organiser.supabase
			.from('applications')
			.update({ status: 'submitted', decision_note: 'Still reviewing this one.' })
			.eq('id', applicationId);

		const { data } = await applicant.supabase.from('notifications').select('title');

		expect(data).toEqual([]);
	});
});

describe('notify_delegation_decided, delegations_notify_decided', () => {
	it('tells every head their delegation was accepted', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const firstHead = await createSignedInClient();
		const delegationId = await addDelegation(firstHead.supabase, organiser.conferenceId);
		const secondHead = await addSecondHead(organiser, firstHead, delegationId);

		// Accepting is allocate_delegation_seats', which runs as the database's
		// owner, and the trigger fires for it the same.
		await firstHead.supabase
			.from('delegations')
			.update({ status: 'submitted' })
			.eq('id', delegationId);
		await createServiceRoleClient()
			.from('delegations')
			.update({ status: 'accepted' })
			.eq('id', delegationId);

		const expected = [
			{
				kind: 'delegation_decided',
				title: 'Your delegation request for Fixture Conference was accepted',
				link_path: `/delegations/${delegationId}`
			}
		];

		const { data: firstHeadNotifications } = await firstHead.supabase
			.from('notifications')
			.select('kind, title, link_path');
		const { data: secondHeadNotifications } = await secondHead.supabase
			.from('notifications')
			.select('kind, title, link_path');

		expect(firstHeadNotifications).toEqual(expected);
		expect(secondHeadNotifications).toEqual(expected);
	});

	it('tells every head their delegation was not accepted, when it is rejected', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const firstHead = await createSignedInClient();
		const delegationId = await addDelegation(firstHead.supabase, organiser.conferenceId);
		const secondHead = await addSecondHead(organiser, firstHead, delegationId);

		// The organisers decide only what was sent to them.
		await firstHead.supabase
			.from('delegations')
			.update({ status: 'submitted' })
			.eq('id', delegationId);
		await organiser.supabase
			.from('delegations')
			.update({ status: 'rejected' })
			.eq('id', delegationId);

		const expected = [{ title: 'Your delegation request for Fixture Conference was not accepted' }];

		const { data: firstHeadNotifications } = await firstHead.supabase
			.from('notifications')
			.select('title');
		const { data: secondHeadNotifications } = await secondHead.supabase
			.from('notifications')
			.select('title');

		expect(firstHeadNotifications).toEqual(expected);
		expect(secondHeadNotifications).toEqual(expected);
	});

	it('says nothing to a plain member, only to the heads', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);
		const member = await addMember(organiser, head, delegationId);

		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);
		await createServiceRoleClient()
			.from('delegations')
			.update({ status: 'accepted' })
			.eq('id', delegationId);

		const { data } = await member.supabase.from('notifications').select('title');

		expect(data).toEqual([]);
	});
});

describe('notify_seat_allocated, seats_notify_allocated', () => {
	it('tells an individually seated delegate they represent their seat, once', async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const { data: committee } = await organiser.supabase
			.from('committees')
			.select('slug')
			.eq('id', committeeId)
			.single();
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		const delegate = await createSignedInClient();

		// A seat with no delegation_id, filled directly, is the individual-
		// applicant road. Only notify_seat_allocated should speak here. The plain
		// write is the service role's: a browser may not write user_id any more
		// (protect_seats_columns), and accept_application would add the decision's
		// own notification to the one this trigger sends.
		await createServiceRoleClient()
			.from('seats')
			.update({ user_id: delegate.userId })
			.eq('id', seatId);

		const { data } = await delegate.supabase.from('notifications').select('kind, title, link_path');

		expect(data).toEqual([
			{
				kind: 'seat_allocated',
				title: 'You represent France in Security Council',
				link_path: `/conferences/${organiser.conferenceSlug}/committees/${committee?.slug}`
			}
		]);
	});
});

describe('notify_delegation_seat_assigned, seats_notify_delegation_seat_assigned', () => {
	it('tells a delegation member they were assigned their seat, and only that once', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const { data: committee } = await organiser.supabase
			.from('committees')
			.select('slug')
			.eq('id', committeeId)
			.single();
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);
		const member = await addMember(organiser, head, delegationId);

		// Reserving the seat for the delegation first (delegation_id set, user_id
		// still empty) is what notify_delegation_seats below reacts to, not this
		// trigger, because it fires on user_id.
		// Both writes are the service role's, for the reason given in the test above.
		await createServiceRoleClient()
			.from('seats')
			.update({ delegation_id: delegationId })
			.eq('id', seatId);

		await createServiceRoleClient()
			.from('seats')
			.update({ user_id: member.userId })
			.eq('id', seatId);

		const { data } = await member.supabase.from('notifications').select('kind, title, link_path');

		// Exactly one row: the delegation_seat_assigned notification. If
		// notify_seat_allocated had also fired, this member would have two.
		expect(data).toEqual([
			{
				kind: 'delegation_seat_assigned',
				title: 'You were assigned France in Security Council',
				link_path: `/conferences/${organiser.conferenceSlug}/committees/${committee?.slug}`
			}
		]);
	});
});

describe('notify_delegation_seats, seats_notify_delegation_seats', () => {
	it('tells every head one notification for the whole batch, not one per seat', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const seatIds = [
			await addSeat(organiser.supabase, committeeId, 'France', 'FR'),
			await addSeat(organiser.supabase, committeeId, 'Japan', 'JP'),
			await addSeat(organiser.supabase, committeeId, 'Brazil', 'BR')
		];
		const firstHead = await createSignedInClient();
		const delegationId = await addDelegation(
			firstHead.supabase,
			organiser.conferenceId,
			'Lycee Francais Delegation'
		);
		const secondHead = await addSecondHead(organiser, firstHead, delegationId);

		// allocate_delegation_seats reserves all three seats in one statement,
		// which is what makes the statement-level trigger fire once instead of
		// three times.
		const { error } = await organiser.supabase.rpc('allocate_delegation_seats', {
			delegation_id: delegationId,
			seat_ids: seatIds
		});

		expect(error).toBeNull();

		const expected = [
			{
				title: '3 seats were allocated to Lycee Francais Delegation',
				link_path: `/delegations/${delegationId}/seats`
			}
		];

		const { data: firstHeadNotifications } = await firstHead.supabase
			.from('notifications')
			.select('title, link_path');
		const { data: secondHeadNotifications } = await secondHead.supabase
			.from('notifications')
			.select('title, link_path');

		expect(firstHeadNotifications).toEqual(expected);
		expect(secondHeadNotifications).toEqual(expected);
	});

	it('says "1 seat was" when the allocation is a single seat', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		const head = await createSignedInClient();
		const delegationId = await addDelegation(
			head.supabase,
			organiser.conferenceId,
			'Lycee Francais Delegation'
		);

		const { error } = await organiser.supabase.rpc('allocate_delegation_seats', {
			delegation_id: delegationId,
			seat_ids: [seatId]
		});

		expect(error).toBeNull();

		const { data } = await head.supabase.from('notifications').select('title');

		// The other branch of the same `case`, which the test above covers with
		// three seats. A count of one has to read as a sentence, not as
		// "1 seats were".
		expect(data).toEqual([{ title: '1 seat was allocated to Lycee Francais Delegation' }]);
	});
});

// Who an audience name resolves to. announcements and schedule_events, which
// call this function, both arrive in a later task; this only tests the
// function itself, as the organiser of the conference it is asked about.
type Audience = 'everyone' | 'delegates' | 'staff' | 'committee' | 'delegation';

/**
 * Calls conference_audience_user_ids and returns the ids sorted, because a
 * SQL "union" has no order and two runs could list the same set differently.
 */
async function readAudience(
	organiser: SignedInClient,
	conferenceId: string,
	audience: Audience,
	committeeId: string | null = null,
	delegationId: string | null = null
): Promise<string[]> {
	const { data, error } = await organiser.supabase.rpc('conference_audience_user_ids', {
		conference_id: conferenceId,
		audience,
		committee_id: committeeId,
		delegation_id: delegationId
	});

	if (error) {
		throw new Error(`conference_audience_user_ids failed: ${error.message}`);
	}

	return [...((data ?? []) as string[])].sort();
}

describe('conference_audience_user_ids', () => {
	it('resolves each audience to the right set of people', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		const delegate = await createSignedInClient();
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		await giveSeatTo(organiser.supabase, seatId, delegate.userId);

		// A chair is on the conference team, which is where their invitation put
		// them and where addChair puts them, so they count for "staff" and
		// "everyone" too, and not only for "committee".
		const chair = await createSignedInClient();
		await addChair(organiser.supabase, committeeId, chair.userId);

		const volunteer = await createSignedInClient();
		await addStaff(organiser.supabase, organiser.conferenceId, volunteer.userId);

		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);
		const member = await addMember(organiser, head, delegationId);

		// A delegation counts for "everyone" once it is sent and for "delegates"
		// once it is accepted, the two questions the read policies ask since
		// migration 20261022140000 (security review M5); a draft counts for
		// neither. security-applications-windows.test.ts walks through each step.
		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);
		// Accepting is allocate_delegation_seats', as the database's owner.
		await createServiceRoleClient()
			.from('delegations')
			.update({ status: 'accepted' })
			.eq('id', delegationId);

		const sorted = (ids: string[]): string[] => [...ids].sort();

		// The organiser is a member of the organisation running the conference,
		// which the function counts as staff too, alongside the chair and the
		// volunteer.
		expect(await readAudience(organiser, organiser.conferenceId, 'everyone')).toEqual(
			sorted([
				organiser.userId,
				delegate.userId,
				chair.userId,
				volunteer.userId,
				head.userId,
				member.userId
			])
		);

		expect(await readAudience(organiser, organiser.conferenceId, 'delegates')).toEqual(
			sorted([delegate.userId, head.userId, member.userId])
		);

		expect(await readAudience(organiser, organiser.conferenceId, 'staff')).toEqual(
			sorted([organiser.userId, chair.userId, volunteer.userId])
		);

		expect(await readAudience(organiser, organiser.conferenceId, 'committee', committeeId)).toEqual(
			sorted([delegate.userId, chair.userId])
		);

		expect(
			await readAudience(organiser, organiser.conferenceId, 'delegation', null, delegationId)
		).toEqual(sorted([head.userId, member.userId]));
	});

	it('refuses anybody who is not on the team of that conference', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const delegate = await createSignedInClient();
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		await giveSeatTo(organiser.supabase, seatId, delegate.userId);

		// A stranger sees no seats, which is the whole point of the seats policy
		// and of the public_seats view. Without the check inside the function
		// they could ask it for the same list of ids and turn each one into a
		// name through profiles, which everybody signed in may read.
		const stranger = await createSignedInClient();

		const { data: seatsVisible } = await stranger.supabase.from('seats').select('id');
		expect(seatsVisible).toEqual([]);

		const { error } = await stranger.supabase.rpc('conference_audience_user_ids', {
			conference_id: organiser.conferenceId,
			audience: 'delegates',
			committee_id: null,
			delegation_id: null
		});

		expect(error?.message).toContain('Only the organisers of a conference');

		// The delegate is inside the conference but not on its team, so they are
		// refused as well: this is a staff question, not a participant one.
		const { error: delegateError } = await delegate.supabase.rpc('conference_audience_user_ids', {
			conference_id: organiser.conferenceId,
			audience: 'delegates',
			committee_id: null,
			delegation_id: null
		});

		expect(delegateError?.message).toContain('Only the organisers of a conference');
	});

	it('refuses a chair and a volunteer, who are staff but not organisers', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);

		// Adding a chair gives them a conference_staff row through
		// ensure_chair_is_staff, so both of these are staff of the conference and
		// neither can manage it.
		const chair = await createSignedInClient();
		await organiser.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: chair.userId });

		const volunteer = await createSignedInClient();
		await addStaff(organiser.supabase, organiser.conferenceId, volunteer.userId);

		// Neither of them reads a single delegation_members row, which is the
		// table the delegation branches of this function return. That is why the
		// gate asks has_permission(id, 'administrator') and not is_conference_staff.
		const { data: chairSeesMembers } = await chair.supabase
			.from('delegation_members')
			.select('user_id');
		expect(chairSeesMembers).toEqual([]);

		const { error: chairError } = await chair.supabase.rpc('conference_audience_user_ids', {
			conference_id: organiser.conferenceId,
			audience: 'delegation',
			committee_id: null,
			delegation_id: delegationId
		});

		expect(chairError?.message).toContain('Only the organisers of a conference');

		const { error: volunteerError } = await volunteer.supabase.rpc('conference_audience_user_ids', {
			conference_id: organiser.conferenceId,
			audience: 'delegates',
			committee_id: null,
			delegation_id: null
		});

		expect(volunteerError?.message).toContain('Only the organisers of a conference');
	});

	it('refuses a committee or a delegation that belongs to another conference', async () => {
		// Anybody signed in may create an organisation and a conference of their
		// own, which makes them staff of it. Without the two checks that scope
		// these parameters, that is enough to satisfy the staff check above and
		// then read any committee's delegates and any delegation's members by id.
		const outsider = await createOpenConferenceOwnedByMe();

		const theirs = await createOpenConferenceOwnedByMe();
		const theirCommitteeId = await addCommittee(theirs.supabase, theirs.conferenceId);
		const delegate = await createSignedInClient();
		const seatId = await addSeat(theirs.supabase, theirCommitteeId, 'France', 'FR');
		await giveSeatTo(theirs.supabase, seatId, delegate.userId);
		const head = await createSignedInClient();
		const theirDelegationId = await addDelegation(head.supabase, theirs.conferenceId);

		const { error: committeeError } = await outsider.supabase.rpc('conference_audience_user_ids', {
			conference_id: outsider.conferenceId,
			audience: 'committee',
			committee_id: theirCommitteeId,
			delegation_id: null
		});

		expect(committeeError?.message).toContain('not part of this conference');

		const { error: delegationError } = await outsider.supabase.rpc('conference_audience_user_ids', {
			conference_id: outsider.conferenceId,
			audience: 'delegation',
			committee_id: null,
			delegation_id: theirDelegationId
		});

		expect(delegationError?.message).toContain('not part of this conference');
	});
});

// The organiser's half of this migration's readers was replaced by the two views
// in 20261007140000_private_details.sql; tests/db/private-details.test.ts covers
// them by permission. The head's half was replaced by the `delegation_member_details`
// view in 20261022111000_delegation_private_reads.sql, which
// security-delegation-private-reads.test.ts covers column by column. These say
// an organiser and a head still reach the same people.
describe('profile_details, the two readers this migration adds', () => {
	it('lets an organiser read the private details of somebody with a submitted application', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const applicant = await createSignedInClient();
		await addApplication(applicant.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});

		const { data } = await organiser.supabase
			.from('staff_contact_details')
			.select('email')
			.eq('user_id', applicant.userId);

		expect(data).toEqual([{ email: applicant.email }]);
	});

	it('lets an organiser read the private details of somebody holding a seat', async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		const seatHolder = await createSignedInClient();
		await giveSeatTo(organiser.supabase, seatId, seatHolder.userId);

		const { data } = await organiser.supabase
			.from('staff_contact_details')
			.select('email')
			.eq('user_id', seatHolder.userId);

		expect(data).toEqual([{ email: seatHolder.email }]);
	});

	it('lets an organiser read the private details of a delegation member', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);
		const member = await addMember(organiser, head, delegationId);

		const { data } = await organiser.supabase
			.from('staff_contact_details')
			.select('email')
			.eq('user_id', member.userId);

		expect(data).toEqual([{ email: member.email }]);
	});

	it("lets a delegation head read their own members' details", async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);
		const member = await addMember(organiser, head, delegationId);

		// Through the head's view, which has a phone number and dietary
		// requirements and no email: the member gave neither yet, so the row is
		// there with two empty columns.
		const { data } = await head.supabase
			.from('delegation_member_details')
			.select('user_id, phone, dietary_requirements')
			.eq('user_id', member.userId);

		expect(data).toEqual([{ user_id: member.userId, phone: null, dietary_requirements: null }]);
	});

	it("shows the head of another delegation nothing of this delegation's members", async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);
		const member = await addMember(organiser, head, delegationId);

		// A head of a group at the same conference, which is the shape the view
		// could get wrong: being a head of anything is not being a head of this
		// membership's own delegation.
		const otherHead = await createSignedInClient();
		await addDelegation(otherHead.supabase, organiser.conferenceId, 'Another School');

		const { data } = await otherHead.supabase
			.from('delegation_member_details')
			.select('user_id')
			.eq('user_id', member.userId);

		expect(data).toEqual([]);
	});

	it("shows a stranger nobody's private details", async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		const seatHolder = await createSignedInClient();
		await giveSeatTo(organiser.supabase, seatId, seatHolder.userId);

		const stranger = await createSignedInClient();
		const { data } = await stranger.supabase
			.from('profile_details')
			.select('email')
			.eq('user_id', seatHolder.userId);

		expect(data).toEqual([]);
	});

	it('shows an organiser of an unrelated conference nothing', async () => {
		const organiser = await createConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
		const seatHolder = await createSignedInClient();
		await giveSeatTo(organiser.supabase, seatId, seatHolder.userId);

		const otherOrganiser = await createConferenceOwnedByMe();
		const { data } = await otherOrganiser.supabase
			.from('profile_details')
			.select('email')
			.eq('user_id', seatHolder.userId);

		expect(data).toEqual([]);
	});
});

describe("conference_staff, the participant's half", () => {
	it('lets a participant see the organisers and chairs of their conference, but not the volunteers', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		const secondOrganiser = await createSignedInClient();
		await addStaff(organiser.supabase, organiser.conferenceId, secondOrganiser.userId, 'organiser');

		// A chair is on the team through ensure_chair_is_staff and visible to a
		// participant through the Chair role, which the conference shows on its
		// public team page; `addChair` gives both.
		const chair = await createSignedInClient();
		await addChair(organiser.supabase, committeeId, chair.userId);

		const volunteer = await createSignedInClient();
		await addStaff(organiser.supabase, organiser.conferenceId, volunteer.userId);

		// Joining a delegation the head has sent is enough to count as a
		// participant, without ever holding a seat; a draft delegation is not
		// (migration 20261022140000, security review M5).
		const head = await createSignedInClient();
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);
		const member = await addMember(organiser, head, delegationId);
		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

		// The Organiser and Chair presets are public roles and Volunteer is not,
		// so the participant sees the first two people and not the third
		// (holds_public_role, which the read rule asks about each row).
		const { data } = await member.supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', organiser.conferenceId);

		const seen = (data ?? []).map((row: { user_id: string }) => row.user_id).sort();

		expect(seen).toEqual([chair.userId, secondOrganiser.userId].sort());
	});

	it('shows a signed-in stranger nothing', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { data } = await stranger.supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', organiser.conferenceId);

		expect(data).toEqual([]);
	});
});
