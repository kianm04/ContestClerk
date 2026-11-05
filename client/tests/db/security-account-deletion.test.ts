import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	type SignedInClient
} from './supabase-test-client';
import {
	addDelegation,
	createConferenceOwnedByMe,
	createOpenConferenceOwnedByMe,
	presetRoleId,
	whileTheConferenceIsJoinable,
	type ConferenceFixture
} from './conference-fixtures';

// delete_my_account after the security review of 2026-10-10
// (docs/security-review-2026-10-10.md, findings L20, L29 and L43), in
// migration 20261022123000_account_deletion_hardening.sql:
//
//   * L20: the pending invitations addressed to the person go with the account.
//   * L29: the only head of a delegation is told which delegation stands in the
//     way and how to get past it, instead of the bare "A delegation needs at
//     least one head" that prevent_last_delegation_head_removal raised from the
//     cascade. That trigger now lets the last head of a withdrawn or rejected
//     delegation go, which is what makes "withdraw the delegation" a real way out.
//   * L43: the function refuses unless the person signed in within the last
//     fifteen minutes. Every client here has just signed up, so the ordinary
//     path is what can be tested; the refusal is exercised by hand, see the
//     comment at the bottom.
//
// The everyday rules of the function, the sole owner of an organisation and the
// person's quick sessions, stay tested in organizations.test.ts and
// quick-sessions.test.ts.

/** A token is 32 url-safe characters. Any unique text does for a test. */
function makeToken(): string {
	return crypto.randomUUID().replaceAll('-', '');
}

/**
 * Signs somebody new up and puts them in the delegation with its join code,
 * through join_delegation, the only way a member ever gets in.
 */
async function joinDelegation(
	conference: ConferenceFixture,
	delegationId: string,
	head: SignedInClient,
	fullName: string
): Promise<SignedInClient> {
	const { data: delegation } = await head.supabase
		.from('delegations')
		.select('join_code')
		.eq('id', delegationId)
		.single();

	const member = await createSignedInClient(fullName);

	const { error } = await whileTheConferenceIsJoinable(conference, () =>
		member.supabase.rpc('join_delegation', { code: delegation?.join_code })
	);

	if (error) {
		throw new Error(`Could not join the fixture delegation: ${error.message}`);
	}

	return member;
}

/** True while the account still exists, read as the person themselves. */
async function accountStillExists(person: SignedInClient): Promise<boolean> {
	const { data } = await person.supabase.from('profiles').select('id').eq('id', person.userId);

	return data?.length === 1;
}

describe('delete_my_account, the invitations addressed to the person (L20)', () => {
	it('deletes the pending invitations addressed to the person, and no others', async () => {
		const organiser = await createConferenceOwnedByMe();
		const leaver = await createSignedInClient('Leaving Person');
		const stayingAddress = `still.invited.${crypto.randomUUID()}@example.com`;

		// One of each kind for the person who is about to leave, and one for
		// somebody else, which has to survive.
		const { error: inviteError } = await organiser.supabase.from('invites').insert([
			{
				kind: 'organization_member',
				organization_id: organiser.organizationId,
				email: leaver.email,
				role: 'admin',
				token: makeToken(),
				invited_by: organiser.userId
			},
			{
				kind: 'conference_staff',
				conference_id: organiser.conferenceId,
				email: leaver.email,
				role_id: await presetRoleId(organiser.supabase, organiser.conferenceId, 'Chair'),
				token: makeToken(),
				invited_by: organiser.userId
			},
			{
				kind: 'organization_member',
				organization_id: organiser.organizationId,
				email: stayingAddress,
				role: 'member',
				token: makeToken(),
				invited_by: organiser.userId
			}
		]);
		expect(inviteError).toBeNull();

		const { error } = await leaver.supabase.rpc('delete_my_account');
		expect(error).toBeNull();

		// The organiser who sent them may read their own invitations, so an empty
		// answer for the address means the rows are gone rather than hidden.
		const { data: remaining } = await organiser.supabase
			.from('invites')
			.select('email')
			.in('email', [leaver.email, stayingAddress]);
		expect(remaining).toEqual([{ email: stayingAddress }]);
	});
});

describe('delete_my_account, the only head of a delegation (L29)', () => {
	it('refuses, naming the delegation, its conference and both ways out', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Amelie Dubois');
		await addDelegation(head.supabase, conference.conferenceId, 'Lycée Fixture Delegation');

		const { error } = await head.supabase.rpc('delete_my_account');

		// The sentence is shown on /settings as it stands, so it is checked whole.
		expect(error?.message).toBe(
			'You are the only head of Lycée Fixture Delegation at Fixture Conference. ' +
				'Make another member a head, or withdraw the delegation, before deleting your account.'
		);
		expect(await accountStillExists(head)).toBe(true);
	});

	it('offers only the handover once the delegation is accepted, which a head cannot withdraw', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(
			head.supabase,
			conference.conferenceId,
			'Accepted Delegation'
		);
		await head.supabase.from('delegations').update({ status: 'submitted' }).eq('id', delegationId);
		// Only allocate_delegation_seats accepts a delegation now (migration
		// 20261022140100), and it needs seats this test has no use for. The
		// accepted status is the starting point here, not what is tested, so the
		// service role sets it.
		const { error: decisionError } = await createServiceRoleClient()
			.from('delegations')
			.update({ status: 'accepted' })
			.eq('id', delegationId);
		expect(decisionError).toBeNull();

		const { error } = await head.supabase.rpc('delete_my_account');

		expect(error?.message).toBe(
			'You are the only head of Accepted Delegation at Fixture Conference. ' +
				'Make another member a head before deleting your account.'
		);
		expect(await accountStillExists(head)).toBe(true);
	});

	it('lets the head go once another member is a head', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);
		const secondHead = await joinDelegation(conference, delegationId, head, 'Nadia Haddad');

		const { error: handoverError } = await head.supabase
			.from('delegation_members')
			.update({ role: 'head' })
			.eq('delegation_id', delegationId)
			.eq('user_id', secondHead.userId);
		expect(handoverError).toBeNull();

		const { error } = await head.supabase.rpc('delete_my_account');

		expect(error).toBeNull();
		expect(await accountStillExists(secondHead)).toBe(true);
	});

	it('lets the head go once the delegation is withdrawn, and keeps the withdrawn request on record', async () => {
		const conference = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);

		const { error: withdrawError } = await head.supabase
			.from('delegations')
			.update({ status: 'withdrawn' })
			.eq('id', delegationId);
		expect(withdrawError).toBeNull();

		// Before this change prevent_last_delegation_head_removal, the function
		// behind the delegation_members_keep_a_head trigger, refused the cascade
		// here too: a withdrawn request kept its head for ever.
		const { error } = await head.supabase.rpc('delete_my_account');
		expect(error).toBeNull();

		// The organisers still see that the school asked and changed its mind.
		const { data: delegation } = await conference.supabase
			.from('delegations')
			.select('status')
			.eq('id', delegationId)
			.single();
		expect(delegation).toEqual({ status: 'withdrawn' });
	});

	it('still refuses demoting the only head of a live delegation', async () => {
		// The exemption is for delegations that are over. A draft keeps the rule
		// delegations.test.ts documents, so the trigger has not been loosened for
		// everybody.
		const conference = await createOpenConferenceOwnedByMe();
		const head = await createSignedInClient('Amelie Dubois');
		const delegationId = await addDelegation(head.supabase, conference.conferenceId);

		const { error } = await head.supabase
			.from('delegation_members')
			.update({ role: 'member' })
			.eq('delegation_id', delegationId)
			.eq('user_id', head.userId);

		expect(error?.message).toContain('A delegation needs at least one head');
	});
});

describe('delete_my_account, how recent the sign-in has to be (L43)', () => {
	it('deletes the account of somebody who signed in just now', async () => {
		// createSignedInClient signs the account up seconds before this call, so
		// the access token's amr claim carries a sign-in well inside the fifteen
		// minutes the function allows.
		const leaver = await createSignedInClient();

		const { error } = await leaver.supabase.rpc('delete_my_account');

		expect(error).toBeNull();

		const other = await createSignedInClient();
		const { data } = await other.supabase.from('profiles').select('id').eq('id', leaver.userId);
		expect(data).toEqual([]);
	});

	/*
		The refusal cannot be arranged from here: GoTrue mints every token these
		clients hold, and it stamps the sign-in with the moment it happened. To see
		the refusal, hand the function a claim of your own in psql against the
		local database (`docker exec -i supabase_db_<project> psql -U postgres -d
		postgres`), inside a transaction that is rolled back so that nothing is
		deleted even if the check were wrong:

			begin;
			select set_config('request.jwt.claims', json_build_object(
				'sub', (select id from auth.users limit 1),
				'role', 'authenticated',
				'amr', json_build_array(json_build_object(
					'method', 'password',
					'timestamp', extract(epoch from now() - interval '16 minutes')::bigint
				))
			)::text, true);
			select public.delete_my_account();
			rollback;

		The call ends with "You signed in more than 15 minutes ago. Sign in again
		before deleting your account." Change the interval to 14 minutes and the
		same call gets past the check and on to the rules below it. A token with no
		amr claim at all is refused the same way: the check does not fall back to
		the token's issued-at stamp, because a refreshed token carries a new one
		and so says nothing about when the person last proved who they are.
	*/
});
