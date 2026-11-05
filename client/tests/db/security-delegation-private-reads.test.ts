import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
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
	whileTheConferenceIsJoinable,
	type ConferenceFixture
} from './conference-fixtures';

// Findings M18 and M19 of docs/security-review-2026-10-10.md, closed by
// migration 20261022111000_delegation_private_reads.sql.
//
// M19: a delegation head read the whole `profile_details` row of every member
// (email, date of birth, emergency contact) for as long as the membership row
// existed. Now the head reads `delegation_member_details`, a view with the
// phone number and dietary requirements only, and only while the delegation is
// neither withdrawn nor rejected.
//
// M18: a chair holding `read_participants` read whole `delegations` rows, join
// code included, and `join_delegation` would let them use it to join and then
// read the delegation's drafts. Now a chair reads `participant_delegations`, a
// view with no join code column, and `join_delegation` turns the conference
// team away.
//
// Every refusal below is proved through a signed-in client or a visitor, never
// through the service role, so that it is the policy or the view saying no.

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

/** Joins the delegation as `person`, with the conference briefly made joinable. */
function joinAs(person: SignedInClient, conference: ConferenceFixture, joinCode: string) {
	// Every fixture conference is dated 2020, which `join_delegation` reads as
	// "already taken place"; `whileTheConferenceIsJoinable` lifts that for the
	// one call and puts it straight back.
	return whileTheConferenceIsJoinable(conference, () =>
		person.supabase.rpc('join_delegation', { code: joinCode })
	);
}

/** A new person joins the delegation as a plain member, through the join code. */
async function addMember(
	conference: ConferenceFixture,
	head: SignedInClient,
	delegationId: string
): Promise<SignedInClient> {
	const joinCode = await readJoinCode(head, delegationId);
	const member = await createSignedInClient('Delegation Member');
	const { error } = await joinAs(member, conference, joinCode);

	if (error) {
		throw new Error(`Could not add the fixture member: ${error.message}`);
	}

	return member;
}

/** Everything a member can type into the private half of their profile. */
const MEMBER_PRIVATE_DETAILS = {
	phone: '+31 6 1234 5678',
	dietary_requirements: 'Vegetarian',
	date_of_birth: '2008-04-12',
	emergency_contact_name: 'Marie Ortega',
	emergency_contact_phone: '+31 6 8765 4321'
};

/**
 * Fills in a person's own private details, through their own client, the way
 * the profile page does. `handle_new_user` made the row when they signed up,
 * so this is an update and not an insert.
 */
async function fillInPrivateDetails(person: SignedInClient): Promise<void> {
	const { data, error } = await person.supabase
		.from('profile_details')
		.update(MEMBER_PRIVATE_DETAILS)
		.eq('user_id', person.userId)
		.select('user_id');

	if (error || !data || data.length === 0) {
		throw new Error(`Could not fill in the fixture private details: ${error?.message}`);
	}
}

/** What `delegation_member_details` answers this reader about this member of this delegation. */
async function memberDetailsSeenBy(reader: SupabaseClient, delegationId: string, memberId: string) {
	const { data, error } = await reader
		.from('delegation_member_details')
		.select('user_id, delegation_id, phone, dietary_requirements')
		.eq('delegation_id', delegationId)
		.eq('user_id', memberId);

	if (error) {
		throw new Error(`Could not read delegation_member_details: ${error.message}`);
	}

	return data;
}

/** A head, their delegation at an open conference, and one member who filled in every private detail. */
async function delegationWithAMember() {
	const conference = await createOpenConferenceOwnedByMe();
	const head = await createSignedInClient('Delegation Head');
	const delegationId = await addDelegation(head.supabase, conference.conferenceId);
	const member = await addMember(conference, head, delegationId);

	await fillInPrivateDetails(member);

	return { conference, head, delegationId, member };
}

describe('delegation_member_details, what a head reads of their members (M19)', () => {
	it('answers the head with the phone number and dietary requirements', async () => {
		const { head, delegationId, member } = await delegationWithAMember();

		expect(await memberDetailsSeenBy(head.supabase, delegationId, member.userId)).toEqual([
			{
				user_id: member.userId,
				delegation_id: delegationId,
				phone: MEMBER_PRIVATE_DETAILS.phone,
				dietary_requirements: MEMBER_PRIVATE_DETAILS.dietary_requirements
			}
		]);
	});

	it('has no column for the email, the date of birth or the emergency contact', async () => {
		const { head } = await delegationWithAMember();

		// A column the view does not have is refused by Postgres, which is a
		// stronger answer than an empty one: there is nothing there to leak.
		for (const column of [
			'email',
			'date_of_birth',
			'emergency_contact_name',
			'emergency_contact_phone'
		]) {
			const { error } = await head.supabase.from('delegation_member_details').select(column);

			expect(error, `${column} should not be a column of the view`).not.toBeNull();
		}
	});

	it('answers the head nothing from profile_details itself', async () => {
		const { head, member } = await delegationWithAMember();

		const { data } = await head.supabase
			.from('profile_details')
			.select('email, date_of_birth, emergency_contact_name, emergency_contact_phone')
			.eq('user_id', member.userId);

		expect(data).toEqual([]);
	});

	it('answers a plain member nothing of another member', async () => {
		const { conference, head, delegationId, member } = await delegationWithAMember();
		const otherMember = await addMember(conference, head, delegationId);

		expect(await memberDetailsSeenBy(otherMember.supabase, delegationId, member.userId)).toEqual(
			[]
		);
	});

	it('answers the head of another delegation nothing', async () => {
		const { conference, delegationId, member } = await delegationWithAMember();

		// A head of a group at the same conference, which is the shape the rule
		// could get wrong: being a head of anything is not being a head of this.
		const otherHead = await createSignedInClient('Other Head');
		await addDelegation(otherHead.supabase, conference.conferenceId, 'Another School');

		expect(await memberDetailsSeenBy(otherHead.supabase, delegationId, member.userId)).toEqual([]);
	});

	it('answers a signed-in stranger nothing, and refuses a visitor', async () => {
		const { delegationId, member } = await delegationWithAMember();
		const stranger = await createSignedInClient('Stranger');

		expect(await memberDetailsSeenBy(stranger.supabase, delegationId, member.userId)).toEqual([]);

		const { error } = await createVisitorClient()
			.from('delegation_member_details')
			.select('user_id');

		expect(error).not.toBeNull();
	});

	it('stops answering once the head withdraws the delegation', async () => {
		const { head, delegationId, member } = await delegationWithAMember();

		const { error } = await head.supabase
			.from('delegations')
			.update({ status: 'withdrawn' })
			.eq('id', delegationId);

		expect(error).toBeNull();
		expect(await memberDetailsSeenBy(head.supabase, delegationId, member.userId)).toEqual([]);
	});

	it('stops answering once the organisers turn the delegation down', async () => {
		const { conference, head, delegationId, member } = await delegationWithAMember();

		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);

		const { error } = await conference.supabase
			.from('delegations')
			.update({ status: 'rejected' })
			.eq('id', delegationId);

		expect(error).toBeNull();
		expect(await memberDetailsSeenBy(head.supabase, delegationId, member.userId)).toEqual([]);
	});
});

/** The public columns of a delegation, as `participant_delegations` names them. */
const PARTICIPANT_DELEGATION_COLUMNS =
	'id, conference_id, name, institution_name, country_code, status';

/**
 * An open conference with two committees, a delegation holding a seat in the
 * first one, and a chair of that committee. The seat is reserved for the
 * delegation through `allocate_delegation_seats`, the way the organiser's own
 * review page does it, so the chair lists a participant of this delegation.
 */
async function conferenceWithAChair() {
	const conference = await createOpenConferenceOwnedByMe();
	const committeeId = await addCommittee(conference.supabase, conference.conferenceId);
	const otherCommitteeId = await addCommittee(conference.supabase, conference.conferenceId);
	const seatId = await addSeat(conference.supabase, committeeId, 'France', 'FR');
	const head = await createSignedInClient('Delegation Head');
	const delegationId = await addDelegation(head.supabase, conference.conferenceId);

	// Only a submitted delegation can be given seats.
	const { error: submitError } = await head.supabase
		.from('delegations')
		.update({ status: 'submitted' })
		.eq('id', delegationId);

	if (submitError) {
		throw new Error(`Could not submit the fixture delegation: ${submitError.message}`);
	}

	const { error: allocateError } = await conference.supabase.rpc('allocate_delegation_seats', {
		delegation_id: delegationId,
		seat_ids: [seatId]
	});

	if (allocateError) {
		throw new Error(`Could not reserve the fixture seat: ${allocateError.message}`);
	}

	const chair = await createSignedInClient('Committee Chair');
	await addChair(conference.supabase, committeeId, chair.userId);

	return { conference, committeeId, otherCommitteeId, delegationId, head, chair };
}

/** What `participant_delegations` answers this reader about this delegation. */
async function delegationSeenBy(reader: SupabaseClient, delegationId: string) {
	const { data, error } = await reader
		.from('participant_delegations')
		.select(PARTICIPANT_DELEGATION_COLUMNS)
		.eq('id', delegationId);

	if (error) {
		throw new Error(`Could not read participant_delegations: ${error.message}`);
	}

	return data;
}

describe('participant_delegations, what a chair reads of a delegation (M18)', () => {
	it('answers a chair with the delegation they list, and has no join code column', async () => {
		const { conference, delegationId, chair } = await conferenceWithAChair();

		expect(await delegationSeenBy(chair.supabase, delegationId)).toEqual([
			{
				id: delegationId,
				conference_id: conference.conferenceId,
				name: 'Fixture Delegation',
				institution_name: 'Fixture School',
				country_code: 'NL',
				status: 'accepted'
			}
		]);

		const { error } = await chair.supabase.from('participant_delegations').select('join_code');

		expect(error).not.toBeNull();
	});

	it('answers a chair nothing from the delegations table itself', async () => {
		const { delegationId, chair } = await conferenceWithAChair();

		const { data } = await chair.supabase
			.from('delegations')
			.select('id, join_code')
			.eq('id', delegationId);

		expect(data).toEqual([]);
	});

	it('answers a chair of another committee nothing', async () => {
		const { conference, otherCommitteeId, delegationId } = await conferenceWithAChair();
		const otherChair = await createSignedInClient('Other Chair');
		await addChair(conference.supabase, otherCommitteeId, otherChair.userId);

		expect(await delegationSeenBy(otherChair.supabase, delegationId)).toEqual([]);
	});

	it("answers the delegation's own head and the organiser too, so one read serves every page", async () => {
		const { conference, delegationId, head } = await conferenceWithAChair();

		expect(await delegationSeenBy(head.supabase, delegationId)).toHaveLength(1);
		expect(await delegationSeenBy(conference.supabase, delegationId)).toHaveLength(1);
	});

	it('answers a signed-in stranger nothing, and refuses a visitor', async () => {
		const { delegationId } = await conferenceWithAChair();
		const stranger = await createSignedInClient('Stranger');

		expect(await delegationSeenBy(stranger.supabase, delegationId)).toEqual([]);

		const { error } = await createVisitorClient().from('participant_delegations').select('id');

		expect(error).not.toBeNull();
	});
});

describe('join_delegation, the conference team (M18)', () => {
	/** Who is in the delegation, read the way its head would. */
	async function memberIdsSeenBy(head: SignedInClient, delegationId: string): Promise<string[]> {
		const { data, error } = await head.supabase
			.from('delegation_members')
			.select('user_id')
			.eq('delegation_id', delegationId);

		if (error) {
			throw new Error(`Could not read the fixture delegation's members: ${error.message}`);
		}

		return (data ?? []).map((row) => row.user_id).sort();
	}

	it('refuses a chair of the conference', async () => {
		const { conference, delegationId, head, chair } = await conferenceWithAChair();
		const joinCode = await readJoinCode(head, delegationId);

		const { error } = await joinAs(chair, conference, joinCode);

		expect(error?.message).toContain('team cannot join');
		expect(await memberIdsSeenBy(head, delegationId)).toEqual([head.userId]);
	});

	it('refuses a volunteer on the team, and the organiser who owns the conference', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Delegation Head');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);
		const joinCode = await readJoinCode(head, delegationId);

		const volunteer = await createSignedInClient('Volunteer');
		await addStaff(conference.supabase, conference.conferenceId, volunteer.userId);

		const { error: volunteerError } = await joinAs(volunteer, conference, joinCode);
		const { error: organiserError } = await joinAs(
			{ supabase: conference.supabase, userId: conference.userId, email: conference.email },
			conference,
			joinCode
		);

		expect(volunteerError?.message).toContain('team cannot join');
		expect(organiserError?.message).toContain('team cannot join');
		expect(await memberIdsSeenBy(head, delegationId)).toEqual([head.userId]);
	});

	it('still lets somebody who is not on the team join', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Delegation Head');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);
		const joinCode = await readJoinCode(head, delegationId);
		const student = await createSignedInClient('Student');

		const { data, error } = await joinAs(student, conference, joinCode);

		expect(error).toBeNull();
		expect(data).toBe(delegationId);
	});

	it('leaves a member who is later put on the team where they are', async () => {
		const { conference, head, delegationId, member } = await delegationWithAMember();

		// The gate is on joining, not on staying: a member the organisers later
		// make a volunteer keeps their membership, as the brief asks.
		await addStaff(conference.supabase, conference.conferenceId, member.userId);

		expect(await memberIdsSeenBy(head, delegationId)).toEqual([head.userId, member.userId].sort());
	});
});
