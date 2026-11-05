import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addApplication,
	addCommittee,
	addDelegation,
	addRole,
	addSeat,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveRole,
	giveSeatTo,
	whileTheConferenceIsJoinable,
	type ConferenceFixture
} from './conference-fixtures';

// Findings M5, M6, M14, L15, L23, L24 and L28 of the security review of
// 2026-10-10, closed by migrations 20261022140000_applications_delegations_windows
// and 20261022140100_delegation_window:
//
//   * `conference_takes_applications(conference_id, route)` is the one answer
//     to "may somebody apply right now", and it knows that a `manual`
//     conference nobody has opened is shut (M6);
//   * `guard_application_update` lets an applicant only withdraw while the
//     conference is not taking applications (M14), and lets a decider make
//     only the moves the review pages make, none of them to `accepted`, which
//     is `accept_application`'s (L28);
//   * `guard_delegation_update` holds a head to the same window, so a draft
//     delegation cannot be sent, nor a sent one edited, once the window has
//     shut (M6, M14), and gives a decider the same short list of moves (L28);
//   * `read_applications` readers and `decide_applications` deciders never see
//     a draft, and nor does `application_team_names` answer them with one
//     (L15);
//   * `is_conference_participant` and `participant_conference_ids` count out
//     drafts, withdrawals and rejections, on both routes, and the `delegates`
//     audience asks `is_conference_admitted` instead (M5);
//   * `conference_audience_user_ids`, which says who the bell tells about an
//     announcement, a document or a programme change, asks the same two
//     questions of a delegation (M5);
//   * the only way into `delegations` is `create_delegation`, whose join code
//     is ten characters from `gen_random_bytes` (L23, L24).
//
// Every test makes its own conference, so nothing one test decides is seen by
// another.

type ApplicationStatus =
	'draft' | 'submitted' | 'accepted' | 'rejected' | 'waitlisted' | 'withdrawn';

type DelegationStatus = 'draft' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn';

/** A day, for moving a window's edges into yesterday or tomorrow. */
const ONE_DAY = 86_400_000;

/**
 * Publishes the conference the way the creation flow leaves one whose
 * organiser said "I will open applications myself" and has not yet: `manual`
 * mode and no opening date. Before the fix every database check read the
 * missing date as "open since forever".
 */
async function publishWaitingForTheOrganiser(conference: ConferenceFixture): Promise<void> {
	const { error } = await conference.supabase
		.from('conferences')
		.update({
			status: 'published',
			application_open_mode: 'manual',
			applications_open_at: null,
			applications_close_at: null,
			accepts_individual_applications: true,
			accepts_delegations: true
		})
		.eq('id', conference.conferenceId);

	if (error) {
		throw new Error(`Could not publish the fixture conference: ${error.message}`);
	}
}

/** The organiser opens applications by hand: the opening moment is written and is in the past. */
async function openByHand(conference: ConferenceFixture): Promise<void> {
	const { error } = await conference.supabase
		.from('conferences')
		.update({ applications_open_at: new Date(Date.now() - ONE_DAY).toISOString() })
		.eq('id', conference.conferenceId);

	if (error) {
		throw new Error(`Could not open the fixture conference: ${error.message}`);
	}
}

/** Moves the closing moment into yesterday, so the window has just shut. */
async function closeTheWindow(conference: ConferenceFixture): Promise<void> {
	const { error } = await conference.supabase
		.from('conferences')
		.update({ applications_close_at: new Date(Date.now() - ONE_DAY).toISOString() })
		.eq('id', conference.conferenceId);

	if (error) {
		throw new Error(`Could not close the fixture conference: ${error.message}`);
	}
}

/**
 * The organiser goes back to "I will open applications myself" with no opening
 * date, which shuts the window again however long it had been open.
 */
async function goBackToOpeningByHand(conference: ConferenceFixture): Promise<void> {
	const { error } = await conference.supabase
		.from('conferences')
		.update({ application_open_mode: 'manual', applications_open_at: null })
		.eq('id', conference.conferenceId);

	if (error) {
		throw new Error(`Could not reset the fixture conference: ${error.message}`);
	}
}

/**
 * Marks a row `accepted` the way `accept_application` and
 * `allocate_delegation_seats` do, as the database's owner, but without the
 * seat they hand out with it. A decider's own update may no longer make this
 * move, so the tests that need somebody accepted, and do not care about the
 * seat, set the row up this way; nothing here uses it to show a move is allowed.
 */
async function acceptAsTheServer(
	table: 'applications' | 'delegations',
	rowId: string
): Promise<void> {
	const { error } = await createServiceRoleClient()
		.from(table)
		.update({ status: 'accepted' })
		.eq('id', rowId);

	if (error) {
		throw new Error(`Could not accept the fixture row: ${error.message}`);
	}
}

/** A new team member holding one conference-wide role with these permissions. */
async function teamMemberWith(
	conference: ConferenceFixture,
	permissions: string[]
): Promise<SignedInClient> {
	const person = await createSignedInClient('Team Member');
	const roleId = await addRole(conference.supabase, conference.conferenceId, {
		name: `Role ${crypto.randomUUID().slice(0, 8)}`,
		permissions
	});

	await giveRole(conference.supabase, conference.conferenceId, person.userId, roleId);

	return person;
}

/**
 * The organiser moves an application to `status` through the table, the way
 * the bulk decisions and "Revoke acceptance" do, and this answers the error
 * message or `null` when the move went through.
 */
async function decide(
	organiser: ConferenceFixture,
	applicationId: string,
	status: ApplicationStatus
): Promise<string | null> {
	const { error } = await organiser.supabase
		.from('applications')
		.update({ status })
		.eq('id', applicationId);

	return error?.message ?? null;
}

/**
 * The organiser moves a delegation to `status` through the table, the way
 * "Reject" on the review page does, and this answers the error message or
 * `null` when the move went through.
 */
async function decideDelegation(
	organiser: ConferenceFixture,
	delegationId: string,
	status: DelegationStatus
): Promise<string | null> {
	const { error } = await organiser.supabase
		.from('delegations')
		.update({ status })
		.eq('id', delegationId);

	return error?.message ?? null;
}

/**
 * The head writes these columns of their own delegation, the way the
 * dashboard's three buttons and its "Details" form do, and this answers the
 * error message or `null` when the write went through.
 */
async function headWrites(
	head: SignedInClient,
	delegationId: string,
	changes: { status?: DelegationStatus; name?: string; note?: string; requested_seats?: number }
): Promise<string | null> {
	const { data, error } = await head.supabase
		.from('delegations')
		.update(changes)
		.eq('id', delegationId)
		.select('id');

	if (error) {
		return error.message;
	}

	// A write the head's own update policy did not match changes nothing and
	// raises nothing, and that is not what any test here means by "went through".
	return (data ?? []).length === 1 ? null : 'No row was changed';
}

/** One announcement by the organiser, titled after its audience. */
async function publishAnnouncement(
	organiser: ConferenceFixture,
	audience: 'everyone' | 'delegates'
): Promise<void> {
	const { error } = await organiser.supabase.from('announcements').insert({
		conference_id: organiser.conferenceId,
		author_id: organiser.userId,
		title: audience === 'everyone' ? 'To everyone' : 'To the delegates',
		body: 'A fixture announcement.',
		audience
	});

	if (error) {
		throw new Error(`Could not publish the fixture announcement: ${error.message}`);
	}
}

/** The announcement titles of one conference this client may read, sorted. */
async function readableAnnouncements(
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

/**
 * Who `conference_audience_user_ids` says an audience is, asked the way the
 * notification triggers ask it: by the organiser, about their own conference.
 */
async function audienceOf(
	organiser: ConferenceFixture,
	audience: 'everyone' | 'delegates'
): Promise<string[]> {
	const { data, error } = await organiser.supabase.rpc('conference_audience_user_ids', {
		conference_id: organiser.conferenceId,
		audience
	});

	if (error) {
		throw new Error(`conference_audience_user_ids failed: ${error.message}`);
	}

	return [...((data ?? []) as string[])].sort();
}

/** The titles in this person's bell about one conference, read through their own client, sorted. */
async function notificationTitles(person: SignedInClient, conferenceId: string): Promise<string[]> {
	const { data } = await person.supabase
		.from('notifications')
		.select('title')
		.eq('conference_id', conferenceId);
	const rows = (data ?? []) as { title: string }[];

	return rows.map((row) => row.title).sort();
}

/** A conference with both announcements published, so a reader's standing shows as a list of titles. */
async function conferenceWithBothAnnouncements(): Promise<
	ConferenceFixture & { committeeId: string }
> {
	const organiser = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

	await publishAnnouncement(organiser, 'everyone');
	await publishAnnouncement(organiser, 'delegates');

	return { ...organiser, committeeId };
}

describe('conference_takes_applications, a manual conference nobody has opened', () => {
	it('refuses an individual application and a delegation until the organiser opens applications', async () => {
		const organiser = await createConferenceOwnedByMe();
		await publishWaitingForTheOrganiser(organiser);
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		const applicant = await createSignedInClient('Early Applicant');
		const { error: applicationError } = await applicant.supabase.from('applications').insert({
			conference_id: organiser.conferenceId,
			user_id: applicant.userId,
			status: 'submitted',
			committee_preferences: [committeeId],
			motivation: 'I would like to come, because this is a fixture.'
		});

		expect(applicationError?.message).toContain('row-level security');

		const head = await createSignedInClient('Early Head');
		const { error: delegationError } = await head.supabase.rpc('create_delegation', {
			conference_id: organiser.conferenceId,
			name: 'Early Delegation',
			institution_name: 'Early School',
			country_code: 'NL',
			requested_seats: 4,
			note: null
		});

		expect(delegationError?.message).toContain('not opened yet');

		// Opening by hand writes the date, and both doors open with it.
		await openByHand(organiser);

		await expect(
			addApplication(applicant.supabase, organiser.conferenceId, {
				committeePreferences: [committeeId]
			})
		).resolves.toEqual(expect.any(String));
		await expect(addDelegation(head.supabase, organiser.conferenceId)).resolves.toEqual(
			expect.any(String)
		);
	});
});

describe('guard_application_update, once the window has shut', () => {
	it('refuses a late edit and a late submission, and still lets the applicant withdraw', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		const sender = await createSignedInClient('Late Editor');
		const sentId = await addApplication(sender.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});
		const drafter = await createSignedInClient('Late Submitter');
		const draftId = await addApplication(drafter.supabase, organiser.conferenceId, {
			status: 'draft',
			committeePreferences: [committeeId]
		});

		// While it is open an edit is an ordinary edit.
		const { data: timelyEdit } = await sender.supabase
			.from('applications')
			.update({ seat_preferences: 'Any P5 country' })
			.eq('id', sentId)
			.select('seat_preferences');

		expect(timelyEdit).toEqual([{ seat_preferences: 'Any P5 country' }]);

		await closeTheWindow(organiser);

		const { error: lateEdit } = await sender.supabase
			.from('applications')
			.update({ seat_preferences: 'Brazil' })
			.eq('id', sentId);

		expect(lateEdit?.message).toContain('can only be withdrawn');

		const { error: lateSubmission } = await drafter.supabase
			.from('applications')
			.update({ status: 'submitted' })
			.eq('id', draftId);

		expect(lateSubmission?.message).toContain('can only be withdrawn');

		const { data: withdrawn } = await sender.supabase
			.from('applications')
			.update({ status: 'withdrawn' })
			.eq('id', sentId)
			.select('status');

		expect(withdrawn).toEqual([{ status: 'withdrawn' }]);
	});

	it('refuses a withdrawal that changes anything else on the way out', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
		const applicant = await createSignedInClient('Late Editor');
		const applicationId = await addApplication(applicant.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});

		await closeTheWindow(organiser);

		const { error } = await applicant.supabase
			.from('applications')
			.update({ status: 'withdrawn', motivation: 'Changed my mind, and my words.' })
			.eq('id', applicationId);

		expect(error?.message).toContain('can only be withdrawn');
	});
});

describe('guard_delegation_update, once the window has shut', () => {
	it('refuses a late submission and a late edit, and still lets the head withdraw', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const drafter = await createSignedInClient('Late Head');
		const draftId = await addDelegation(drafter.supabase, organiser.conferenceId, 'Late School');
		const sender = await createSignedInClient('Timely Head');
		const sentId = await addDelegation(sender.supabase, organiser.conferenceId, 'Timely School');

		// While the window is open, sending and editing are ordinary writes.
		expect(await headWrites(sender, sentId, { status: 'submitted' })).toBeNull();
		expect(await headWrites(sender, sentId, { note: 'Two of us are vegetarian.' })).toBeNull();

		await closeTheWindow(organiser);

		expect(await headWrites(drafter, draftId, { status: 'submitted' })).toContain(
			'can only be withdrawn'
		);
		expect(await headWrites(drafter, draftId, { requested_seats: 20 })).toContain(
			'can only be withdrawn'
		);
		expect(await headWrites(sender, sentId, { name: 'Renamed School' })).toContain(
			'can only be withdrawn'
		);
		// Taking a sent delegation back to a draft is not leaving: it is the
		// first half of editing it and sending it again.
		expect(await headWrites(sender, sentId, { status: 'draft' })).toContain(
			'can only be withdrawn'
		);

		expect(await headWrites(sender, sentId, { status: 'withdrawn' })).toBeNull();
		expect(await headWrites(drafter, draftId, { status: 'withdrawn' })).toBeNull();
	});

	it('refuses a submission once the organiser goes back to opening applications by hand', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Early Head');
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);

		// `manual` with no opening date is shut, however long it was open before.
		await goBackToOpeningByHand(organiser);

		expect(await headWrites(head, delegationId, { status: 'submitted' })).toContain(
			'can only be withdrawn'
		);

		await openByHand(organiser);

		expect(await headWrites(head, delegationId, { status: 'submitted' })).toBeNull();
	});

	it('refuses a withdrawal that changes anything else on the way out', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Late Head');
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);
		expect(await headWrites(head, delegationId, { status: 'submitted' })).toBeNull();

		await closeTheWindow(organiser);

		expect(
			await headWrites(head, delegationId, { status: 'withdrawn', note: 'And another thing.' })
		).toContain('can only be withdrawn');
	});
});

describe('read_applications, drafts stay private', () => {
	it('shows a reader the applications somebody sent and none of the drafts, which a decider cannot touch either', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		const sender = await createSignedInClient('Sender');
		const sentId = await addApplication(sender.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});
		const drafter = await createSignedInClient('Drafter');
		const draftId = await addApplication(drafter.supabase, organiser.conferenceId, {
			status: 'draft',
			committeePreferences: [committeeId]
		});

		const reader = await teamMemberWith(organiser, ['read_applications', 'decide_applications']);

		const { data: visible } = await reader.supabase
			.from('applications')
			.select('id')
			.eq('conference_id', organiser.conferenceId);

		expect((visible ?? []).map((row) => row.id)).toEqual([sentId]);

		// The owner of the organisation reads through the same policy.
		const { data: ownerSees } = await organiser.supabase
			.from('applications')
			.select('id')
			.eq('id', draftId);

		expect(ownerSees).toEqual([]);

		// An update that matches no visible row is a silent no-op, which is what
		// the policy's `using` clause does to a draft.
		const { data: touched } = await reader.supabase
			.from('applications')
			.update({ decision_note: 'Seen before it was sent' })
			.eq('id', draftId)
			.select('id');

		expect(touched).toEqual([]);
	});
});

describe('application_team_names, drafts stay private', () => {
	it('names a draft only to the team it joined, never to a reader of the applications', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		const sender = await createSignedInClient('Sent Teammate');
		const sentId = await addApplication(sender.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});
		const drafter = await createSignedInClient('Draft Teammate');
		const draftId = await addApplication(drafter.supabase, organiser.conferenceId, {
			status: 'draft',
			committeePreferences: [committeeId]
		});

		const { data: code } = await sender.supabase.rpc('start_application_team', {
			application_id: sentId
		});
		const { data: teamId, error: joinError } = await drafter.supabase.rpc('join_application_team', {
			application_id: draftId,
			code: code ?? ''
		});
		expect(joinError).toBeNull();

		const namesFor = async (client: SignedInClient['supabase']) => {
			const { data } = await client.rpc('application_team_names', { team_id: teamId ?? '' });
			return (data ?? []).map((row: { full_name: string }) => row.full_name);
		};

		// The friends see each other, the unsent one included: they made the team.
		expect(await namesFor(sender.supabase)).toEqual(['Sent Teammate', 'Draft Teammate']);
		expect(await namesFor(drafter.supabase)).toEqual(['Sent Teammate', 'Draft Teammate']);

		// The organisers read only what was sent to them, as the table does.
		expect(await namesFor(organiser.supabase)).toEqual(['Sent Teammate']);
		const reader = await teamMemberWith(organiser, ['read_applications']);
		expect(await namesFor(reader.supabase)).toEqual(['Sent Teammate']);
	});
});

describe('is_conference_participant and is_conference_admitted', () => {
	it('counts a rejected applicant out again, everywhere', async () => {
		const organiser = await conferenceWithBothAnnouncements();
		const applicant = await createSignedInClient('Applicant');
		const applicationId = await addApplication(applicant.supabase, organiser.conferenceId, {
			committeePreferences: [organiser.committeeId]
		});

		// Sent and undecided: inside the conference, but not yet one of its
		// delegates.
		expect(await readableAnnouncements(applicant.supabase, organiser.conferenceId)).toEqual([
			'To everyone'
		]);

		expect(await decide(organiser, applicationId, 'rejected')).toBeNull();

		expect(await readableAnnouncements(applicant.supabase, organiser.conferenceId)).toEqual([]);

		const { data: conferences } = await applicant.supabase.rpc('participant_conference_ids');
		expect(conferences).toEqual([]);
	});

	it('counts a withdrawn applicant out as well', async () => {
		const organiser = await conferenceWithBothAnnouncements();
		const applicant = await createSignedInClient('Applicant');
		const applicationId = await addApplication(applicant.supabase, organiser.conferenceId, {
			committeePreferences: [organiser.committeeId]
		});

		await applicant.supabase
			.from('applications')
			.update({ status: 'withdrawn' })
			.eq('id', applicationId);

		expect(await readableAnnouncements(applicant.supabase, organiser.conferenceId)).toEqual([]);
	});

	it('lets an accepted applicant and a seated delegate read what is meant for the delegates', async () => {
		const organiser = await conferenceWithBothAnnouncements();

		const accepted = await createSignedInClient('Accepted Applicant');
		const applicationId = await addApplication(accepted.supabase, organiser.conferenceId, {
			committeePreferences: [organiser.committeeId]
		});
		await acceptAsTheServer('applications', applicationId);

		expect(await readableAnnouncements(accepted.supabase, organiser.conferenceId)).toEqual([
			'To everyone',
			'To the delegates'
		]);

		const seated = await createSignedInClient('Seated Delegate');
		const seatId = await addSeat(organiser.supabase, organiser.committeeId, 'France', 'FR');
		await giveSeatTo(organiser.supabase, seatId, seated.userId);

		expect(await readableAnnouncements(seated.supabase, organiser.conferenceId)).toEqual([
			'To everyone',
			'To the delegates'
		]);
	});

	it('makes nobody a participant for a delegation they only drafted', async () => {
		const organiser = await conferenceWithBothAnnouncements();
		const head = await createSignedInClient('Head');
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);

		// One `create_delegation` call used to be enough to read every
		// announcement of the conference.
		expect(await readableAnnouncements(head.supabase, organiser.conferenceId)).toEqual([]);

		const { data: conferences } = await head.supabase.rpc('participant_conference_ids');
		expect(conferences).toEqual([]);

		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

		expect(await readableAnnouncements(head.supabase, organiser.conferenceId)).toEqual([
			'To everyone'
		]);

		await acceptAsTheServer('delegations', delegationId);

		expect(await readableAnnouncements(head.supabase, organiser.conferenceId)).toEqual([
			'To everyone',
			'To the delegates'
		]);
	});
});

describe('conference_audience_user_ids, who the bell tells', () => {
	it('tells a draft delegation nothing, a sent one what is said to everyone, and an accepted one the rest', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Head');
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);

		// One `create_delegation` call used to put the head on both lists, so the
		// bell showed them the title of everything said to the delegates.
		await publishAnnouncement(organiser, 'everyone');
		await publishAnnouncement(organiser, 'delegates');

		expect(await audienceOf(organiser, 'everyone')).not.toContain(head.userId);
		expect(await audienceOf(organiser, 'delegates')).not.toContain(head.userId);
		expect(await notificationTitles(head, organiser.conferenceId)).toEqual([]);

		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

		expect(await audienceOf(organiser, 'everyone')).toContain(head.userId);
		expect(await audienceOf(organiser, 'delegates')).not.toContain(head.userId);

		await acceptAsTheServer('delegations', delegationId);

		expect(await audienceOf(organiser, 'everyone')).toContain(head.userId);
		expect(await audienceOf(organiser, 'delegates')).toContain(head.userId);
	});

	it('stops telling a delegation the organisers rejected', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Head');
		const delegationId = await addDelegation(head.supabase, organiser.conferenceId);

		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);
		expect(await decideDelegation(organiser, delegationId, 'rejected')).toBeNull();

		expect(await audienceOf(organiser, 'everyone')).not.toContain(head.userId);
		expect(await audienceOf(organiser, 'delegates')).not.toContain(head.userId);
	});
});

describe('delegations, create_delegation is the only door', () => {
	it('refuses a direct insert at an open conference', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Head');

		const { error } = await head.supabase.from('delegations').insert({
			conference_id: organiser.conferenceId,
			name: 'Lycee Francais Delegation',
			institution_name: 'Lycee Francais',
			requested_seats: 4,
			join_code: 'ABCDEFGHJK'
		});

		expect(error?.message).toContain('row-level security');
	});

	it('mints a ten-character join code from the alphabet without 0, O, 1 and I', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const firstHead = await createSignedInClient('First Head');
		const secondHead = await createSignedInClient('Second Head');
		const firstId = await addDelegation(firstHead.supabase, organiser.conferenceId, 'First');
		const secondId = await addDelegation(secondHead.supabase, organiser.conferenceId, 'Second');

		const { data: first } = await firstHead.supabase
			.from('delegations')
			.select('join_code')
			.eq('id', firstId)
			.single();
		const { data: second } = await secondHead.supabase
			.from('delegations')
			.select('join_code')
			.eq('id', secondId)
			.single();

		expect(first?.join_code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
		expect(second?.join_code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
		expect(first?.join_code).not.toEqual(second?.join_code);
	});
});

describe('guard_application_update, the moves a decider may make', () => {
	it('allows the ones the review pages make', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		const first = await createSignedInClient('First Applicant');
		const firstId = await addApplication(first.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});
		// Waitlisted, then not accepted, then "Revoke acceptance" leaving it
		// withdrawn: the second write of revokeAcceptance.
		expect(await decide(organiser, firstId, 'waitlisted')).toBeNull();
		expect(await decide(organiser, firstId, 'rejected')).toBeNull();
		expect(await decide(organiser, firstId, 'withdrawn')).toBeNull();

		// The bulk "Reject" straight from review.
		const second = await createSignedInClient('Second Applicant');
		const secondId = await addApplication(second.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});
		expect(await decide(organiser, secondId, 'rejected')).toBeNull();
	});

	it('refuses accepting by a column write, which would admit somebody without a seat', async () => {
		const organiser = await conferenceWithBothAnnouncements();

		const sent = await createSignedInClient('Sent Applicant');
		const sentId = await addApplication(sent.supabase, organiser.conferenceId, {
			committeePreferences: [organiser.committeeId]
		});
		const waiting = await createSignedInClient('Waitlisted Applicant');
		const waitingId = await addApplication(waiting.supabase, organiser.conferenceId, {
			committeePreferences: [organiser.committeeId]
		});
		expect(await decide(organiser, waitingId, 'waitlisted')).toBeNull();

		// Accepting is accept_application's, which seats the person and raises
		// their invoice in the same step. A plain update used to do the first
		// half of that and none of the rest, and still let them read what is
		// said to the delegates.
		expect(await decide(organiser, sentId, 'accepted')).toContain('cannot be marked');
		expect(await decide(organiser, waitingId, 'accepted')).toContain('cannot be marked');
		expect(await readableAnnouncements(sent.supabase, organiser.conferenceId)).toEqual([
			'To everyone'
		]);
	});

	it('refuses undoing a decision or sending an application back', async () => {
		const organiser = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);

		const accepted = await createSignedInClient('Accepted Applicant');
		const acceptedId = await addApplication(accepted.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});
		await acceptAsTheServer('applications', acceptedId);

		// Taking an acceptance back frees a seat and voids an invoice, which is
		// revoke_seat's job and not a column write's.
		expect(await decide(organiser, acceptedId, 'rejected')).toContain('cannot be marked');
		expect(await decide(organiser, acceptedId, 'withdrawn')).toContain('cannot be marked');
		expect(await decide(organiser, acceptedId, 'draft')).toContain('cannot be marked');
		expect(await decide(organiser, acceptedId, 'submitted')).toContain('cannot be marked');

		const rejected = await createSignedInClient('Rejected Applicant');
		const rejectedId = await addApplication(rejected.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});
		expect(await decide(organiser, rejectedId, 'rejected')).toBeNull();
		expect(await decide(organiser, rejectedId, 'accepted')).toContain('cannot be marked');
		expect(await decide(organiser, rejectedId, 'submitted')).toContain('cannot be marked');

		const withdrawn = await createSignedInClient('Withdrawn Applicant');
		const withdrawnId = await addApplication(withdrawn.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});
		await withdrawn.supabase
			.from('applications')
			.update({ status: 'withdrawn' })
			.eq('id', withdrawnId);
		expect(await decide(organiser, withdrawnId, 'accepted')).toContain('cannot be marked');

		const sent = await createSignedInClient('Sent Applicant');
		const sentId = await addApplication(sent.supabase, organiser.conferenceId, {
			committeePreferences: [committeeId]
		});
		expect(await decide(organiser, sentId, 'draft')).toContain('cannot be marked');
		expect(await decide(organiser, sentId, 'withdrawn')).toContain('cannot be marked');
	});
});

describe('guard_delegation_update, the moves a decider may make', () => {
	it('allows rejecting a sent delegation, and an accepted one', async () => {
		const organiser = await createOpenConferenceOwnedByMe();

		const sentHead = await createSignedInClient('Sent Head');
		const sentId = await addDelegation(sentHead.supabase, organiser.conferenceId, 'Sent School');
		expect(await headWrites(sentHead, sentId, { status: 'submitted' })).toBeNull();
		expect(await decideDelegation(organiser, sentId, 'rejected')).toBeNull();

		// "Reject" on the review page also takes back an accepted delegation
		// that has no seats yet; rejectRefusal checks the seats first.
		const acceptedHead = await createSignedInClient('Accepted Head');
		const acceptedId = await addDelegation(
			acceptedHead.supabase,
			organiser.conferenceId,
			'Accepted School'
		);
		expect(await headWrites(acceptedHead, acceptedId, { status: 'submitted' })).toBeNull();
		await acceptAsTheServer('delegations', acceptedId);
		expect(await decideDelegation(organiser, acceptedId, 'rejected')).toBeNull();
	});

	it('refuses accepting by a column write, undoing a decision, or deciding a draft', async () => {
		const organiser = await createOpenConferenceOwnedByMe();

		// Accepting is allocate_delegation_seats', which hands out the seats and
		// raises the invoice in the same step.
		const sentHead = await createSignedInClient('Sent Head');
		const sentId = await addDelegation(sentHead.supabase, organiser.conferenceId, 'Sent School');
		expect(await headWrites(sentHead, sentId, { status: 'submitted' })).toBeNull();
		expect(await decideDelegation(organiser, sentId, 'accepted')).toContain('cannot be marked');

		expect(await decideDelegation(organiser, sentId, 'rejected')).toBeNull();
		expect(await decideDelegation(organiser, sentId, 'submitted')).toContain('cannot be marked');
		expect(await decideDelegation(organiser, sentId, 'accepted')).toContain('cannot be marked');

		const acceptedHead = await createSignedInClient('Accepted Head');
		const acceptedId = await addDelegation(
			acceptedHead.supabase,
			organiser.conferenceId,
			'Accepted School'
		);
		expect(await headWrites(acceptedHead, acceptedId, { status: 'submitted' })).toBeNull();
		await acceptAsTheServer('delegations', acceptedId);
		expect(await decideDelegation(organiser, acceptedId, 'draft')).toContain('cannot be marked');
		expect(await decideDelegation(organiser, acceptedId, 'submitted')).toContain(
			'cannot be marked'
		);
		expect(await decideDelegation(organiser, acceptedId, 'withdrawn')).toContain(
			'cannot be marked'
		);

		// A draft is the head's own until they send it, and the organisers' pages
		// never show one, so there is nothing about it for them to decide or say.
		const draftHead = await createSignedInClient('Draft Head');
		const draftId = await addDelegation(draftHead.supabase, organiser.conferenceId, 'Draft School');
		expect(await decideDelegation(organiser, draftId, 'rejected')).toContain('nobody has sent');

		const { error: noteError } = await organiser.supabase
			.from('delegations')
			.update({ decision_note: 'Seen before it was sent' })
			.eq('id', draftId);
		expect(noteError?.message).toContain('nobody has sent');
	});
});

/**
 * A draft delegation with a head and one member, and a seat the organiser has
 * reserved for the delegation and put the member in. The head is no
 * participant while the delegation is a draft, so the head cannot read that
 * seat, which is what the tests below lean on.
 */
async function draftDelegationWithASeatedMember() {
	const organiser = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(organiser.supabase, organiser.conferenceId);
	const seatId = await addSeat(organiser.supabase, committeeId, 'France', 'FR');
	const head = await createSignedInClient('Head');
	const delegationId = await addDelegation(head.supabase, organiser.conferenceId);

	const { data: delegation } = await head.supabase
		.from('delegations')
		.select('join_code')
		.eq('id', delegationId)
		.single();
	const member = await createSignedInClient('Member');
	const { error: joinError } = await whileTheConferenceIsJoinable(organiser, () =>
		member.supabase.rpc('join_delegation', { code: delegation?.join_code ?? '' })
	);

	if (joinError) {
		throw new Error(`Could not join the fixture delegation: ${joinError.message}`);
	}

	// Only the allocation functions fill a seat now (migration 20261022110000),
	// and none of them seats a member of a draft delegation. The seat is the
	// starting point here, not what is tested, so the service role writes it.
	const { error: seatError } = await createServiceRoleClient()
		.from('seats')
		.update({ delegation_id: delegationId, user_id: member.userId })
		.eq('id', seatId);

	if (seatError) {
		throw new Error(`Could not seat the fixture member: ${seatError.message}`);
	}

	return { head, member, delegationId, seatId };
}

describe('delegation_member_holds_seat, behind leaving and removal', () => {
	it('keeps a seated member in a delegation whose head is not a participant', async () => {
		const { head, member, delegationId, seatId } = await draftDelegationWithASeatedMember();

		// The delete policy must know the seat is there even so.
		const { data: seatsVisibleToHead } = await head.supabase
			.from('seats')
			.select('id')
			.eq('id', seatId);
		expect(seatsVisibleToHead).toEqual([]);

		// A policy that matches no row is a silent no-op, for the head removing
		// the member and for the member leaving alike.
		const { error: removeError } = await head.supabase
			.from('delegation_members')
			.delete()
			.eq('delegation_id', delegationId)
			.eq('user_id', member.userId);
		const { error: leaveError } = await member.supabase
			.from('delegation_members')
			.delete()
			.eq('delegation_id', delegationId)
			.eq('user_id', member.userId);
		expect(removeError).toBeNull();
		expect(leaveError).toBeNull();

		const { data: membership } = await head.supabase
			.from('delegation_members')
			.select('user_id')
			.eq('delegation_id', delegationId)
			.eq('user_id', member.userId);
		expect(membership).toEqual([{ user_id: member.userId }]);
	});

	it('answers its own delegation, and nobody outside it', async () => {
		const { head, member, delegationId } = await draftDelegationWithASeatedMember();
		const outsider = await createSignedInClient('Outsider');

		const holdsSeat = async (client: SignedInClient['supabase']) => {
			const { data } = await client.rpc('delegation_member_holds_seat', {
				delegation_id: delegationId,
				user_id: member.userId
			});
			return data;
		};

		expect(await holdsSeat(head.supabase)).toBe(true);
		expect(await holdsSeat(member.supabase)).toBe(true);
		// Who sits where is the organisers' to say: somebody with a delegation's
		// id and a person's id learns nothing by asking.
		expect(await holdsSeat(outsider.supabase)).toBeNull();
	});
});
