import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addApplication,
	addCommittee,
	addDelegation,
	addRole,
	addSeat,
	createCommitteeRoom,
	createOpenConferenceOwnedByMe,
	giveRole,
	whileTheConferenceIsJoinable,
	type CommitteeRoomFixture,
	type ConferenceFixture
} from './conference-fixtures';

// Migration 20261022132000_internal_notes_grants.sql, which closes four findings
// of the security review of 10 October 2026 (docs/security-review-2026-10-10.md):
//
//   * M7: an applicant could read the organisers' `internal_note` and
//     `decided_by` on their own application, because a policy decides rows and
//     not columns.
//   * M8: every member of a delegation, and every chair with `read_participants`
//     over one of its seats, could read the delegation's `internal_note`.
//   * L4: every signed-in user could read everybody's `is_platform_admin` and
//     `onboarding_completed_at`.
//   * L14: every signed-in account could read the `user_id`, `seat_id` and
//     `created_by` of every published award.
//
// The notes now live in `application_internal_notes` and
// `delegation_internal_notes`, whose policies ask `read_applications` and
// `decide_applications`; the old columns are retired (always null, and
// `retire_internal_note_column` refuses a value). `decided_by` and the two
// profile columns are hidden with column-level grants, which PostgREST honours
// as long as a query names its columns, and given back to the people entitled
// to them through `staff_application_deciders` and `my_profile_state`. Awards
// reach the public through `published_awards`, which carries display fields only.

/** What Postgres answers a role that lacks a privilege on a column or a view. */
const PERMISSION_DENIED = '42501';

/** What Postgres answers for a column that is not there to ask for. */
const NO_SUCH_COLUMN = '42703';

// A minute in milliseconds. Publishing awards "now" is really publishing them a
// moment ago, so the view's `<= now()` is already true.
const ONE_MINUTE_IN_MILLISECONDS = 60_000;

function minutesAgo(minutes: number): string {
	return new Date(Date.now() - minutes * ONE_MINUTE_IN_MILLISECONDS).toISOString();
}

/** An open conference with one committee, and one submitted application to it. */
async function createConferenceWithOneApplication() {
	const conference = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(conference.supabase, conference.conferenceId);
	const applicant = await createSignedInClient('Fixture Applicant');
	const applicationId = await addApplication(applicant.supabase, conference.conferenceId, {
		committeePreferences: [committeeId]
	});

	return { conference, committeeId, applicant, applicationId };
}

/**
 * Somebody on the conference's team holding exactly these permissions, through
 * a role made for them, so that a test can tell `read_applications` apart from
 * `decide_applications`.
 */
async function addTeamMemberWith(
	conference: ConferenceFixture,
	permissions: string[]
): Promise<SignedInClient> {
	const person = await createSignedInClient('Fixture Team Member');
	const roleId = await addRole(conference.supabase, conference.conferenceId, {
		name: `Role ${crypto.randomUUID().slice(0, 8)}`,
		permissions
	});

	await giveRole(conference.supabase, conference.conferenceId, person.userId, roleId);

	return person;
}

/** The organisers' note on one application, as one reader sees it. */
function readApplicationNote(reader: SupabaseClient, applicationId: string) {
	return reader
		.from('application_internal_notes')
		.select('note')
		.eq('application_id', applicationId);
}

/** The organisers' note on one delegation, as one reader sees it. */
function readDelegationNote(reader: SupabaseClient, delegationId: string) {
	return reader.from('delegation_internal_notes').select('note').eq('delegation_id', delegationId);
}

/** The join code of a delegation, read by its head, who may read their own row. */
async function joinCodeOf(head: SupabaseClient, delegationId: string): Promise<string> {
	const { data, error } = await head
		.from('delegations')
		.select('join_code')
		.eq('id', delegationId)
		.single();

	if (error || !data) {
		throw new Error(`Could not read the fixture join code: ${error?.message}`);
	}

	return data.join_code;
}

describe('application_internal_notes (M7)', () => {
	it('keeps internal_note and decided_by from the applicant, who still reads the rest of their row', async () => {
		const { conference, applicant, applicationId } = await createConferenceWithOneApplication();

		const { error: writeError } = await conference.supabase
			.from('application_internal_notes')
			.upsert({ application_id: applicationId, note: 'Strong on procedure.' });

		expect(writeError).toBeNull();

		// The applicant's own page asks for these and must keep getting them.
		const { data: ownRow, error: ownError } = await applicant.supabase
			.from('applications')
			.select('id, status, decision_note')
			.eq('id', applicationId);

		expect(ownError).toBeNull();
		expect(ownRow).toEqual([{ id: applicationId, status: 'submitted', decision_note: null }]);

		// Naming either hidden column is refused outright, because the grant on
		// `applications` no longer covers it. The same goes through the view,
		// which no longer carries them at all.
		for (const column of ['internal_note', 'decided_by']) {
			const { error } = await applicant.supabase
				.from('applications')
				.select(column)
				.eq('id', applicationId);

			expect(error?.code, column).toBe(PERMISSION_DENIED);

			const { error: viewError } = await applicant.supabase
				.from('applications_with_applicant')
				.select(column)
				.eq('id', applicationId);

			expect(viewError?.code, `${column} through the view`).toBe(NO_SUCH_COLUMN);
		}

		// The note itself is in a table whose policy the applicant does not pass.
		const { data: note, error: noteError } = await readApplicationNote(
			applicant.supabase,
			applicationId
		);

		expect(noteError).toBeNull();
		expect(note).toEqual([]);
	});

	it('lets read_applications read a note, decide_applications write one, and nobody else either', async () => {
		const { conference, applicationId } = await createConferenceWithOneApplication();
		const reader = await addTeamMemberWith(conference, ['read_applications']);
		const decider = await addTeamMemberWith(conference, [
			'read_applications',
			'decide_applications'
		]);
		const stranger = await createSignedInClient('Fixture Stranger');

		const { error: deciderWrite } = await decider.supabase
			.from('application_internal_notes')
			.upsert({ application_id: applicationId, note: 'Call her school.' });

		expect(deciderWrite).toBeNull();

		expect((await readApplicationNote(reader.supabase, applicationId)).data).toEqual([
			{ note: 'Call her school.' }
		]);
		expect((await readApplicationNote(stranger.supabase, applicationId)).data).toEqual([]);

		// Reading is not writing: the reader's upsert is turned away by the
		// insert and update policies, and the note is as the decider left it.
		const { error: readerWrite } = await reader.supabase
			.from('application_internal_notes')
			.upsert({ application_id: applicationId, note: 'Overwritten by a reader' });

		expect(readerWrite?.code).toBe(PERMISSION_DENIED);
		expect((await readApplicationNote(decider.supabase, applicationId)).data).toEqual([
			{ note: 'Call her school.' }
		]);

		// An emptied box is a null note, not a missing row, so "no note" reads
		// one way whether or not the organisers ever wrote one.
		await decider.supabase
			.from('application_internal_notes')
			.upsert({ application_id: applicationId, note: null });

		expect((await readApplicationNote(reader.supabase, applicationId)).data).toEqual([
			{ note: null }
		]);
	});

	it('stamps a note with when it last changed (application_internal_notes_set_updated_at, delegation_internal_notes_set_updated_at)', async () => {
		const { conference, applicationId } = await createConferenceWithOneApplication();
		const head = await createSignedInClient('Fixture Head');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);

		/**
		 * `updated_at` of one note after a write, as the organiser reads it back.
		 * The note is read back by its own id, so that a second note in the same
		 * table (written by another test, or by this one some day) is not it.
		 */
		async function stampAfterWriting(
			table: 'application_internal_notes' | 'delegation_internal_notes',
			idColumn: 'application_id' | 'delegation_id',
			id: string,
			note: string
		): Promise<string> {
			const { error: writeError } = await conference.supabase
				.from(table)
				.upsert({ [idColumn]: id, note });

			expect(writeError).toBeNull();

			const { data, error } = await conference.supabase
				.from(table)
				.select('updated_at')
				.eq(idColumn, id)
				.single();

			expect(error).toBeNull();

			return (data as { updated_at: string }).updated_at;
		}

		const applicationFirst = await stampAfterWriting(
			'application_internal_notes',
			'application_id',
			applicationId,
			'First thoughts.'
		);
		const applicationSecond = await stampAfterWriting(
			'application_internal_notes',
			'application_id',
			applicationId,
			'Second thoughts.'
		);
		const delegationFirst = await stampAfterWriting(
			'delegation_internal_notes',
			'delegation_id',
			delegationId,
			'First thoughts.'
		);
		const delegationSecond = await stampAfterWriting(
			'delegation_internal_notes',
			'delegation_id',
			delegationId,
			'Second thoughts.'
		);

		// The second write is an update of the row the first one made, and the
		// trigger moves the stamp on; the two tables keep it the same way.
		expect(new Date(applicationSecond).getTime()).toBeGreaterThan(
			new Date(applicationFirst).getTime()
		);
		expect(new Date(delegationSecond).getTime()).toBeGreaterThan(
			new Date(delegationFirst).getTime()
		);
	});

	it('refuses a value in the retired applications.internal_note column (applications_retire_internal_note, retire_internal_note_column)', async () => {
		const { conference, applicationId } = await createConferenceWithOneApplication();

		// `guard_application_update` lets an organiser write the column, so the
		// refusal has to come from the retirement trigger behind it.
		const { error: organiserError } = await conference.supabase
			.from('applications')
			.update({ internal_note: 'Written to the old column' })
			.eq('id', applicationId);

		expect(organiserError?.message).toContain('retired');

		// Not even the server may put a note back there: a value in the old
		// column would be readable by whoever reads the row.
		const { error: serviceRoleError } = await createServiceRoleClient()
			.from('applications')
			.update({ internal_note: 'Written to the old column' })
			.eq('id', applicationId);

		expect(serviceRoleError?.message).toContain('retired');
	});

	it('shows who decided through staff_application_deciders to the organisers and to nobody else', async () => {
		const { conference, applicant, applicationId } = await createConferenceWithOneApplication();
		const reader = await addTeamMemberWith(conference, ['read_applications']);

		// The waitlist and reject buttons write the decision this way.
		const { error: decideError } = await conference.supabase
			.from('applications')
			.update({
				status: 'rejected',
				decided_at: new Date().toISOString(),
				decided_by: conference.userId
			})
			.eq('id', applicationId);

		expect(decideError).toBeNull();

		const readDecider = (who: SupabaseClient) =>
			who
				.from('staff_application_deciders')
				.select('application_id, decided_by')
				.eq('application_id', applicationId);

		expect((await readDecider(reader.supabase)).data).toEqual([
			{ application_id: applicationId, decided_by: conference.userId }
		]);
		expect((await readDecider(applicant.supabase)).data).toEqual([]);
	});

	it('gives an applicant no way to learn who decided from their own write: a withdrawal naming the right decider and one naming a wrong one behave the same (applications_applicant_keeps_decision, keep_decision_from_applicant)', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(conference.supabase, conference.conferenceId);

		// A waitlisted application is the one an applicant may still write (to
		// withdraw it) that carries a decider, so it is where a guess about
		// `decided_by` could be checked against the real value.
		async function waitlistedApplication() {
			const applicant = await createSignedInClient('Fixture Applicant');
			const applicationId = await addApplication(applicant.supabase, conference.conferenceId, {
				committeePreferences: [committeeId]
			});
			const { error } = await conference.supabase
				.from('applications')
				.update({
					status: 'waitlisted',
					decided_at: new Date().toISOString(),
					decided_by: conference.userId,
					decision_note: 'Second round.'
				})
				.eq('id', applicationId);

			expect(error).toBeNull();

			return { applicant, applicationId };
		}

		const rightGuess = await waitlistedApplication();
		const wrongGuess = await waitlistedApplication();

		// The probe: withdraw, and name a decider in the same request.
		// `guard_application_update` used to compare what was sent with what
		// was there and refuse a wrong name, which told the applicant it was
		// wrong, while a right name went through. Now the decision columns are
		// put back as they were before the guard looks, so both requests do
		// exactly one thing: withdraw.
		const probes = [
			{ ...rightGuess, decidedBy: conference.userId },
			{ ...wrongGuess, decidedBy: crypto.randomUUID() }
		];

		for (const probe of probes) {
			const { error } = await probe.applicant.supabase
				.from('applications')
				.update({
					status: 'withdrawn',
					decided_by: probe.decidedBy,
					decision_note: 'Rewritten by the applicant'
				})
				.eq('id', probe.applicationId);

			expect(error, `withdrawing while naming ${probe.decidedBy}`).toBeNull();
		}

		const applicationIds = probes.map((probe) => probe.applicationId).sort();

		// The decision is as the organiser left it: who decided, read through
		// the organisers' view, and what they told the applicant.
		const { data: deciders } = await conference.supabase
			.from('staff_application_deciders')
			.select('application_id, decided_by')
			.in('application_id', applicationIds)
			.order('application_id');

		expect(deciders).toEqual(
			applicationIds.map((applicationId) => ({
				application_id: applicationId,
				decided_by: conference.userId
			}))
		);

		const { data: rows } = await conference.supabase
			.from('applications')
			.select('id, status, decision_note')
			.in('id', applicationIds)
			.order('id');

		expect(rows).toEqual(
			applicationIds.map((id) => ({ id, status: 'withdrawn', decision_note: 'Second round.' }))
		);
	});
});

describe('delegation_internal_notes (M8)', () => {
	it('keeps the note from the head and from a member of the delegation', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Fixture Head');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);
		const member = await createSignedInClient('Fixture Member');
		const joinCode = await joinCodeOf(head.supabase, delegationId);

		const { error: joinError } = await whileTheConferenceIsJoinable(conference, () =>
			member.supabase.rpc('join_delegation', { code: joinCode })
		);

		expect(joinError).toBeNull();

		const { error: writeError } = await conference.supabase
			.from('delegation_internal_notes')
			.upsert({ delegation_id: delegationId, note: 'Check that a teacher is coming with them.' });

		expect(writeError).toBeNull();

		for (const person of [head, member]) {
			const { data, error } = await readDelegationNote(person.supabase, delegationId);

			expect(error).toBeNull();
			expect(data).toEqual([]);

			// The old column is still a column of the row they may read, and it
			// is empty for good.
			const { data: oldColumn } = await person.supabase
				.from('delegations')
				.select('internal_note')
				.eq('id', delegationId);

			expect(oldColumn).toEqual([{ internal_note: null }]);
		}
	});

	it('keeps the note from a chair with read_participants, who can read the delegation itself', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const committeeId = await addCommittee(conference.supabase, conference.conferenceId);
		const seatId = await addSeat(conference.supabase, committeeId);
		const head = await createSignedInClient('Fixture Head');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);

		// The seat is the delegation's and the head sits in it, as allocation
		// leaves it. Only the service role may write both columns at once here.
		const { error: seatError } = await createServiceRoleClient()
			.from('seats')
			.update({ delegation_id: delegationId, user_id: head.userId })
			.eq('id', seatId);

		expect(seatError).toBeNull();

		const chair = await createSignedInClient('Fixture Chair');
		const roleId = await addRole(conference.supabase, conference.conferenceId, {
			name: `Chair ${crypto.randomUUID().slice(0, 8)}`,
			scope: 'committees',
			permissions: ['read_participants']
		});
		await giveRole(conference.supabase, conference.conferenceId, chair.userId, roleId);
		await conference.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: chair.userId });

		await conference.supabase
			.from('delegation_internal_notes')
			.upsert({ delegation_id: delegationId, note: 'Ask about their travel dates.' });

		// The participants page names the delegation, so the row is theirs to read
		// (through participant_delegations, since the M18 fix keeps the table and
		// its join code from chairs)...
		const { data: delegation } = await chair.supabase
			.from('participant_delegations')
			.select('id')
			.eq('id', delegationId);

		expect(delegation).toEqual([{ id: delegationId }]);

		// ...and the organisers' note is not.
		expect((await readDelegationNote(chair.supabase, delegationId)).data).toEqual([]);
	});

	it('lets read_applications read a note and decide_applications write one', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Fixture Head');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);
		const reader = await addTeamMemberWith(conference, ['read_applications']);
		const decider = await addTeamMemberWith(conference, [
			'read_applications',
			'decide_applications'
		]);

		const { error: deciderWrite } = await decider.supabase
			.from('delegation_internal_notes')
			.upsert({ delegation_id: delegationId, note: 'Ask about their travel dates.' });

		expect(deciderWrite).toBeNull();
		expect((await readDelegationNote(reader.supabase, delegationId)).data).toEqual([
			{ note: 'Ask about their travel dates.' }
		]);

		const { error: readerWrite } = await reader.supabase
			.from('delegation_internal_notes')
			.upsert({ delegation_id: delegationId, note: 'Overwritten by a reader' });

		expect(readerWrite?.code).toBe(PERMISSION_DENIED);
	});

	it('refuses a value in the retired delegations.internal_note column (delegations_retire_internal_note)', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Fixture Head');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);
		// The organisers may not touch a draft at all (guard_delegation_update,
		// migration 20261022140100), so the head sends it first and the write
		// below reaches the trigger this test is about.
		const { error: submitError } = await head.supabase
			.from('delegations')
			.update({ status: 'submitted' })
			.eq('id', delegationId);
		expect(submitError).toBeNull();

		const { error } = await conference.supabase
			.from('delegations')
			.update({ internal_note: 'Written to the old column' })
			.eq('id', delegationId);

		expect(error?.message).toContain('retired');
	});
});

describe('profiles, is_platform_admin and onboarding_completed_at (L4)', () => {
	it('keeps both from other users, who still read the public columns', async () => {
		const person = await createSignedInClient('Amira Haddad');
		const other = await createSignedInClient('Somebody Else');

		const { data: publicColumns, error: publicError } = await other.supabase
			.from('profiles')
			.select('full_name, institution_name')
			.eq('id', person.userId);

		expect(publicError).toBeNull();
		expect(publicColumns).toEqual([{ full_name: 'Amira Haddad', institution_name: null }]);

		for (const column of ['is_platform_admin', 'onboarding_completed_at']) {
			const { error } = await other.supabase
				.from('profiles')
				.select(column)
				.eq('id', person.userId);

			expect(error?.code, column).toBe(PERMISSION_DENIED);
		}
	});

	it('shows a person their own two columns through my_profile_state, and nobody else theirs', async () => {
		const person = await createSignedInClient();
		const other = await createSignedInClient();

		const readState = (who: SupabaseClient) =>
			who
				.from('my_profile_state')
				.select('id, is_platform_admin, onboarding_completed_at')
				.eq('id', person.userId);

		expect((await readState(person.supabase)).data).toEqual([
			{ id: person.userId, is_platform_admin: false, onboarding_completed_at: null }
		]);
		expect((await readState(other.supabase)).data).toEqual([]);

		// The view is for the signed-in only.
		const { error: visitorError } = await createVisitorClient()
			.from('my_profile_state')
			.select('id');

		expect(visitorError?.code).toBe(PERMISSION_DENIED);
	});
});

// The awards half. The chair proposes, the organiser confirms and publishes,
// through their own clients, so the policies have to allow each step.

async function proposeAward(room: CommitteeRoomFixture): Promise<string> {
	const { data, error } = await room.chair.supabase
		.from('awards')
		.insert({
			committee_id: room.committeeId,
			seat_id: room.seatId,
			kind: 'best_delegate',
			title: 'Best Delegate'
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Could not propose the fixture award: ${error?.message}`);
	}

	return data.id;
}

async function confirmAward(room: CommitteeRoomFixture, awardId: string): Promise<void> {
	const { error } = await room.supabase
		.from('awards')
		.update({ status: 'confirmed' })
		.eq('id', awardId);

	if (error) {
		throw new Error(`Could not confirm the fixture award: ${error.message}`);
	}
}

/** Publishes the conference itself, and then its awards at `moment`. */
async function publishAwards(room: CommitteeRoomFixture, moment: string | null): Promise<void> {
	const { error } = await room.supabase
		.from('conferences')
		.update({ status: 'published', awards_published_at: moment })
		.eq('id', room.conferenceId);

	if (error) {
		throw new Error(`Could not publish the fixture awards: ${error.message}`);
	}
}

/** The published awards of the room's committee, as one reader sees them. */
function readPublishedAwards(reader: SupabaseClient, committeeId: string) {
	return reader
		.from('published_awards')
		.select('id, committee_id, kind, title, seat_name, seat_country_code, holder_name, is_mine')
		.eq('committee_id', committeeId);
}

describe('published_awards (L14)', () => {
	it('shows a published, confirmed award with its display fields and none of the ids', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room);
		await confirmAward(room, awardId);
		await publishAwards(room, minutesAgo(1));
		const stranger = await createSignedInClient('Fixture Stranger');

		const { data, error } = await readPublishedAwards(stranger.supabase, room.committeeId);

		expect(error).toBeNull();
		expect(data).toEqual([
			{
				id: awardId,
				committee_id: room.committeeId,
				kind: 'best_delegate',
				title: 'Best Delegate',
				seat_name: 'France',
				seat_country_code: 'FR',
				// `freeze_award_user` wrote the delegate onto the award at publish.
				holder_name: 'Fixture Delegate',
				is_mine: false
			}
		]);

		// The three ids the review named are not columns of the view.
		for (const column of ['user_id', 'seat_id', 'created_by']) {
			const { error: columnError } = await stranger.supabase
				.from('published_awards')
				.select(column)
				.eq('id', awardId);

			expect(columnError?.code, column).toBe(NO_SUCH_COLUMN);
		}

		// The table itself no longer answers a stranger at all: the view is the
		// only way in for somebody who neither proposes nor confirms awards.
		const { data: tableRows } = await stranger.supabase
			.from('awards')
			.select('title')
			.eq('id', awardId);

		expect(tableRows).toEqual([]);

		// The holder sees that it is theirs, which is what /profile asks.
		const { data: ownAward } = await readPublishedAwards(room.delegate.supabase, room.committeeId);

		expect(ownAward?.map((award) => award.is_mine)).toEqual([true]);

		// And a visitor who is not signed in is refused the view, as the old
		// policy refused them the table.
		const { error: visitorError } = await createVisitorClient()
			.from('published_awards')
			.select('id');

		expect(visitorError?.code).toBe(PERMISSION_DENIED);
	});

	it('shows nothing that is a proposal, unpublished, or published for later', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room);
		const stranger = await createSignedInClient('Fixture Stranger');

		await publishAwards(room, minutesAgo(1));
		expect((await readPublishedAwards(stranger.supabase, room.committeeId)).data).toEqual([]);

		await confirmAward(room, awardId);
		await publishAwards(room, null);
		expect((await readPublishedAwards(stranger.supabase, room.committeeId)).data).toEqual([]);

		await publishAwards(room, new Date(Date.now() + 60 * ONE_MINUTE_IN_MILLISECONDS).toISOString());
		expect((await readPublishedAwards(stranger.supabase, room.committeeId)).data).toEqual([]);

		await publishAwards(room, minutesAgo(1));
		expect((await readPublishedAwards(stranger.supabase, room.committeeId)).data).toHaveLength(1);
	});

	it('brings the committee and its conference along, which /profile lists an award by', async () => {
		const room = await createCommitteeRoom();
		const awardId = await proposeAward(room);
		await confirmAward(room, awardId);
		await publishAwards(room, minutesAgo(1));

		const { data, error } = await room.delegate.supabase
			.from('published_awards')
			.select('title, committee:committees(name, conference:conferences(name))')
			.eq('is_mine', true)
			.eq('id', awardId);

		expect(error).toBeNull();
		expect(data).toEqual([
			{
				title: 'Best Delegate',
				committee: { name: room.committeeName, conference: { name: 'Fixture Conference' } }
			}
		]);
	});
});
