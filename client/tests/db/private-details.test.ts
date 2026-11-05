import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addCommittee,
	addDelegation,
	addRole,
	addSeat,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	giveRole,
	giveSeatTo,
	type ConferenceFixture
} from './conference-fixtures';

// The two views from migration 20261007140000_private_details and section 5 of
// docs/roles-and-permissions.md: `staff_contact_details` (email and phone) for
// `read_contact_details`, `staff_welfare_details` (date of birth, dietary
// requirements, emergency contact) for `read_welfare_details`. Each answers
// only for the people taking part where the reader holds its permission, and
// the team no longer reads `profile_details` itself.
//
// The conference below has two committees, each with one seated delegate.

type TwoCommitteeConference = ConferenceFixture & {
	committeeA: string;
	committeeB: string;
	delegateA: SignedInClient;
	delegateB: SignedInClient;
};

let conference: TwoCommitteeConference;

/** A new team member holding one role with these permissions, at this scope. */
async function teamMemberWith(
	permissions: string[],
	scope: 'conference' | 'committees' = 'conference',
	committeeIds: string[] = []
): Promise<SignedInClient> {
	const person = await createSignedInClient('Team Member');
	const roleId = await addRole(conference.supabase, conference.conferenceId, {
		name: `Role ${crypto.randomUUID().slice(0, 8)}`,
		scope,
		permissions
	});

	await giveRole(conference.supabase, conference.conferenceId, person.userId, roleId);

	// A role that applies per committee applies in the committees its holder is assigned to.
	for (const committeeId of committeeIds) {
		const { error } = await conference.supabase
			.from('committee_chairs')
			.insert({ committee_id: committeeId, user_id: person.userId });

		if (error) {
			throw new Error(`Could not assign the fixture committee: ${error.message}`);
		}
	}

	return person;
}

/** The user ids a view answers this reader with, about the two delegates. */
async function idsInView(
	reader: SupabaseClient,
	view: 'staff_contact_details' | 'staff_welfare_details'
): Promise<string[]> {
	const { data, error } = await reader
		.from(view)
		.select('user_id')
		.in('user_id', [conference.delegateA.userId, conference.delegateB.userId]);

	if (error) {
		throw new Error(`Could not read ${view}: ${error.message}`);
	}

	return (data ?? []).map((row) => row.user_id).sort();
}

/** Both delegates, sorted the way `idsInView` sorts its answer. */
function bothDelegates(): string[] {
	return [conference.delegateA.userId, conference.delegateB.userId].sort();
}

beforeAll(async () => {
	const fixture = await createConferenceOwnedByMe();
	const committeeA = await addCommittee(fixture.supabase, fixture.conferenceId);
	const committeeB = await addCommittee(fixture.supabase, fixture.conferenceId);
	const seatA = await addSeat(fixture.supabase, committeeA, 'France', 'FR');
	const seatB = await addSeat(fixture.supabase, committeeB, 'Kenya', 'KE');
	const delegateA = await createSignedInClient('Delegate A');
	const delegateB = await createSignedInClient('Delegate B');

	await giveSeatTo(fixture.supabase, seatA, delegateA.userId);
	await giveSeatTo(fixture.supabase, seatB, delegateB.userId);

	conference = { ...fixture, committeeA, committeeB, delegateA, delegateB };
});

describe('staff_contact_details and staff_welfare_details', () => {
	it('answer an administrator with everybody taking part', async () => {
		expect(await idsInView(conference.supabase, 'staff_contact_details')).toEqual(bothDelegates());
		expect(await idsInView(conference.supabase, 'staff_welfare_details')).toEqual(bothDelegates());
	});

	it('give read_contact_details the contact view and not the welfare one', async () => {
		const desk = await teamMemberWith(['read_participants', 'read_contact_details']);

		expect(await idsInView(desk.supabase, 'staff_contact_details')).toEqual(bothDelegates());
		expect(await idsInView(desk.supabase, 'staff_welfare_details')).toEqual([]);
	});

	it('give read_welfare_details the welfare view and not the contact one', async () => {
		const welfare = await teamMemberWith(['read_welfare_details']);

		expect(await idsInView(welfare.supabase, 'staff_welfare_details')).toEqual(bothDelegates());
		expect(await idsInView(welfare.supabase, 'staff_contact_details')).toEqual([]);
	});

	it('answer a role held per committee for its own committee only', async () => {
		const chair = await teamMemberWith(['read_contact_details'], 'committees', [
			conference.committeeA
		]);

		expect(await idsInView(chair.supabase, 'staff_contact_details')).toEqual([
			conference.delegateA.userId
		]);
	});

	it('answer a team member without either permission with nobody', async () => {
		const volunteer = await teamMemberWith([]);

		expect(await idsInView(volunteer.supabase, 'staff_contact_details')).toEqual([]);
		expect(await idsInView(volunteer.supabase, 'staff_welfare_details')).toEqual([]);
	});

	it("answer the team of another conference with nobody of this one's", async () => {
		const otherOrganiser = await createConferenceOwnedByMe();

		expect(await idsInView(otherOrganiser.supabase, 'staff_contact_details')).toEqual([]);
	});

	it('are refused to somebody who is not signed in', async () => {
		const { error } = await createVisitorClient().from('staff_contact_details').select('user_id');

		expect(error).not.toBeNull();
	});

	it('carry the details themselves, not just the people', async () => {
		const { data } = await conference.supabase
			.from('staff_contact_details')
			.select('email')
			.eq('user_id', conference.delegateA.userId);

		expect(data).toEqual([{ email: conference.delegateA.email }]);
	});
});

describe('private_details_user_ids', () => {
	it("answers with the people a permission opens, from the caller's own roles", async () => {
		const chair = await teamMemberWith(['read_welfare_details'], 'committees', [
			conference.committeeB
		]);

		const { data, error } = await chair.supabase.rpc('private_details_user_ids', {
			permission: 'read_welfare_details'
		});

		expect(error).toBeNull();
		expect(data).toContain(conference.delegateB.userId);
		expect(data).not.toContain(conference.delegateA.userId);
	});
});

describe('profile_details, now closed to the team', () => {
	it('answers even a holder of both permissions with nothing of anybody else', async () => {
		const desk = await teamMemberWith(['read_contact_details', 'read_welfare_details']);

		const { data } = await desk.supabase
			.from('profile_details')
			.select('user_id')
			.eq('user_id', conference.delegateA.userId);

		expect(data).toEqual([]);
	});

	it('answers the conference owner with nothing of anybody else either', async () => {
		const { data } = await conference.supabase
			.from('profile_details')
			.select('user_id')
			.eq('user_id', conference.delegateA.userId);

		expect(data).toEqual([]);
	});
});

describe('the delegations a participant reader lists', () => {
	it('lets read_participants read the delegation of a delegate in their committee only', async () => {
		const open = await createOpenConferenceOwnedByMe();
		const committeeA = await addCommittee(open.supabase, open.conferenceId);
		const committeeB = await addCommittee(open.supabase, open.conferenceId);
		const seatA = await addSeat(open.supabase, committeeA, 'France', 'FR');
		const head = await createSignedInClient('Delegation Head');
		const delegationId = await addDelegation(head.supabase, open.conferenceId);

		// The seat is the delegation's and the head sits in it, as allocation leaves it.
		const { error } = await createServiceRoleClient()
			.from('seats')
			.update({ delegation_id: delegationId, user_id: head.userId })
			.eq('id', seatA);

		if (error) {
			throw new Error(`Could not give the fixture seat to the delegation: ${error.message}`);
		}

		/** A reader of participants in one committee of the open conference. */
		async function chairOf(committeeId: string): Promise<SignedInClient> {
			const person = await createSignedInClient('Chair');
			const roleId = await addRole(open.supabase, open.conferenceId, {
				name: `Chair ${crypto.randomUUID().slice(0, 8)}`,
				scope: 'committees',
				permissions: ['read_participants']
			});

			await giveRole(open.supabase, open.conferenceId, person.userId, roleId);
			await open.supabase
				.from('committee_chairs')
				.insert({ committee_id: committeeId, user_id: person.userId });

			return person;
		}

		const chairA = await chairOf(committeeA);
		const chairB = await chairOf(committeeB);

		// The delegation is read through the `participant_delegations` view since
		// migration 20261022111000: the table itself answers a chair nothing, because
		// a whole row carries the join code (security review 2026-10-10, M18, with
		// its own tests in security-delegation-private-reads.test.ts).
		const readDelegation = (reader: SupabaseClient) =>
			reader.from('participant_delegations').select('id').eq('id', delegationId);
		const readDelegationRow = (reader: SupabaseClient) =>
			reader.from('delegations').select('id').eq('id', delegationId);
		const readMembers = (reader: SupabaseClient) =>
			reader.from('delegation_members').select('user_id').eq('delegation_id', delegationId);

		expect((await readDelegation(chairA.supabase)).data).toEqual([{ id: delegationId }]);
		expect((await readDelegationRow(chairA.supabase)).data).toEqual([]);
		expect((await readMembers(chairA.supabase)).data).toEqual([{ user_id: head.userId }]);
		expect((await readDelegation(chairB.supabase)).data).toEqual([]);
		expect((await readMembers(chairB.supabase)).data).toEqual([]);

		// The view and the members policy ask participant_list_delegation_ids, which answers the same way.
		const { data: listedByA } = await chairA.supabase.rpc('participant_list_delegation_ids');
		const { data: listedByB } = await chairB.supabase.rpc('participant_list_delegation_ids');

		expect(listedByA).toContain(delegationId);
		expect(listedByB ?? []).not.toContain(delegationId);
	});
});
