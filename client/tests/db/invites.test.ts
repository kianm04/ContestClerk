import { describe, expect, it } from 'vitest';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient
} from './supabase-test-client';
import { addCommittee, createConferenceOwnedByMe, presetRoleId } from './conference-fixtures';

// The `invites` table and the three functions that go with it: get_invite,
// list_my_invites and accept_invite. See the `invites` row of
// specs/02-architecture/permissions.md and the functions table in
// specs/02-architecture/data-model.md.
//
// Since docs/roles-and-permissions.md an invitation to a conference names one
// of the conference's own roles by id (`role_id`) and the `role` text column
// serves organisation invitations alone; `invites_role_matches_kind` holds the
// two apart. The tests ask for the preset roles by name through `presetRoleId`.

/** A token is 32 url-safe characters. Any unique text does for a test. */
function makeToken(): string {
	return crypto.randomUUID().replaceAll('-', '');
}

describe('invites, sending one', () => {
	it('lets an organisation admin invite somebody to the organisation', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();

		const { data, error } = await supabase
			.from('invites')
			.insert({
				kind: 'organization_member',
				organization_id: organizationId,
				email: 'new.member@example.com',
				role: 'admin',
				token: makeToken(),
				invited_by: userId
			})
			.select('role');

		expect(error).toBeNull();
		expect(data).toEqual([{ role: 'admin' }]);
	});

	it('refuses an invitation to an organisation the sender has nothing to do with', async () => {
		const { organizationId } = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: organizationId,
			email: 'gatecrasher@example.com',
			role: 'owner',
			token: makeToken(),
			invited_by: stranger.userId
		});

		expect(error).not.toBeNull();
	});

	it('refuses an address that is not lowercase, so that matching one is just "="', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();

		const { error } = await supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: organizationId,
			email: 'Shouting@Example.com',
			role: 'member',
			token: makeToken(),
			invited_by: userId
		});

		expect(error).not.toBeNull();
	});

	it('refuses an organisation invitation that names a conference instead', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();

		const { error } = await supabase.from('invites').insert({
			kind: 'organization_member',
			conference_id: conferenceId,
			email: 'confused@example.com',
			role: 'member',
			token: makeToken(),
			invited_by: userId
		});

		expect(error).not.toBeNull();
	});
});

describe('invites, reading them', () => {
	it('lets the organiser who sent it see it, and shows it to nobody else', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: 'future.chair@example.com',
			role_id: await presetRoleId(supabase, conferenceId, 'Chair'),
			token,
			invited_by: userId
		});

		const { data: mine } = await supabase.from('invites').select('email').eq('token', token);
		expect(mine).toEqual([{ email: 'future.chair@example.com' }]);

		const stranger = await createSignedInClient();
		const { data: theirs } = await stranger.supabase
			.from('invites')
			.select('email')
			.eq('token', token);

		expect(theirs).toEqual([]);
	});

	it('lets the organiser withdraw it again', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: 'changed.our.mind@example.com',
			role_id: await presetRoleId(supabase, conferenceId, 'Volunteer'),
			token,
			invited_by: userId
		});

		const { data, error } = await supabase.from('invites').delete().eq('token', token).select('id');

		expect(error).toBeNull();
		expect(data?.length).toBe(1);
	});

	it("refuses to let a stranger withdraw somebody else's invitation", async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: 'still.wanted@example.com',
			role_id: await presetRoleId(supabase, conferenceId, 'Chair'),
			token,
			invited_by: userId
		});

		const stranger = await createSignedInClient();
		const { data: deleted } = await stranger.supabase
			.from('invites')
			.delete()
			.eq('token', token)
			.select('id');

		expect(deleted).toEqual([]);

		// The invitation is still there, which the organiser can see.
		const { data: remaining } = await supabase.from('invites').select('id').eq('token', token);

		expect(remaining?.length).toBe(1);
	});
});

describe('check_invite_committee', () => {
	it("refuses a chair invitation that names another conference's committee", async () => {
		const ourConference = await createConferenceOwnedByMe();
		const someoneElse = await createConferenceOwnedByMe();

		// The committee is made by the organiser it belongs to, and is a committee
		// of a conference we have nothing to do with.
		const committeeId = await addCommittee(
			someoneElse.supabase,
			someoneElse.conferenceId,
			'Their Security Council'
		);

		const { error } = await ourConference.supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: ourConference.conferenceId,
			committee_id: committeeId,
			email: 'chair.of.their.committee@example.com',
			role_id: await presetRoleId(ourConference.supabase, ourConference.conferenceId, 'Chair'),
			token: makeToken(),
			invited_by: ourConference.userId
		});

		expect(error?.message).toContain('different conference');
	});

	it('allows a chair invitation for a committee of its own conference', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();

		const committeeId = await addCommittee(supabase, conferenceId, 'Our Security Council');

		const { data, error } = await supabase
			.from('invites')
			.insert({
				kind: 'conference_staff',
				conference_id: conferenceId,
				committee_id: committeeId,
				email: 'our.chair@example.com',
				role_id: await presetRoleId(supabase, conferenceId, 'Chair'),
				token: makeToken(),
				invited_by: userId
			})
			.select('committee_id');

		expect(error).toBeNull();
		expect(data).toEqual([{ committee_id: committeeId }]);
	});
});

describe('get_invite', () => {
	it('tells a visitor holding the token what the invitation is for', async () => {
		const { supabase, conferenceId, userId, conferenceSlug } = await createConferenceOwnedByMe();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: 'invited.person@example.com',
			role_id: await presetRoleId(supabase, conferenceId, 'Chair'),
			token,
			invited_by: userId
		});

		// Nobody is signed in: the token is the secret, and the page needs the
		// address so the register form can be filled in for the person.
		const visitor = createVisitorClient();
		const { data, error } = await visitor.rpc('get_invite', { token });

		expect(error).toBeNull();
		// The role comes back by its name, with what it lets the person do, so
		// the accept page knows where to send them without a second lookup.
		expect(data?.[0]).toMatchObject({
			kind: 'conference_staff',
			role: 'Chair',
			role_scope: 'committees',
			email: 'invited.person@example.com',
			conference_slug: conferenceSlug,
			accepted_at: null
		});
		expect(data?.[0].role_permissions).toContain('run_room');
	});

	it('returns nothing for a token nobody was given', async () => {
		const visitor = createVisitorClient();

		const { data } = await visitor.rpc('get_invite', { token: makeToken() });

		expect(data).toEqual([]);
	});
});

describe('accept_invite', () => {
	it('adds the membership and sends the person to their organisation', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: organizationId,
			email: invited.email,
			role: 'member',
			token,
			invited_by: userId
		});

		const { data: destination, error } = await invited.supabase.rpc('accept_invite', { token });

		expect(error).toBeNull();
		expect(destination).toContain('/manage/organizations/');

		const { data: memberships } = await invited.supabase
			.from('organization_members')
			.select('role')
			.eq('organization_id', organizationId)
			.eq('user_id', invited.userId);

		expect(memberships).toEqual([{ role: 'member' }]);
	});

	it('adds a chair to the conference team and sends them to the conference', async () => {
		const { supabase, conferenceId, userId, conferenceSlug } = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: invited.email,
			role_id: await presetRoleId(supabase, conferenceId, 'Chair'),
			token,
			invited_by: userId
		});

		const { data: destination, error } = await invited.supabase.rpc('accept_invite', { token });

		expect(error).toBeNull();
		expect(destination).toBe(`/manage/${conferenceSlug}`);

		const { data: team } = await invited.supabase
			.from('conference_staff')
			.select('user_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', invited.userId);

		expect(team).toEqual([{ user_id: invited.userId }]);

		const { data: roles } = await invited.supabase
			.from('conference_role_members')
			.select('role_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', invited.userId);

		expect(roles).toEqual([{ role_id: await presetRoleId(supabase, conferenceId, 'Chair') }]);
	});

	it('refuses somebody signed in with a different address', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();
		const wrongPerson = await createSignedInClient();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: organizationId,
			email: 'somebody.else@example.com',
			role: 'member',
			token,
			invited_by: userId
		});

		const { error } = await wrongPerson.supabase.rpc('accept_invite', { token });

		expect(error?.message).toContain('different email address');
	});

	it('refuses an invitation that has already been used', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: organizationId,
			email: invited.email,
			role: 'member',
			token,
			invited_by: userId
		});

		await invited.supabase.rpc('accept_invite', { token });
		const { error } = await invited.supabase.rpc('accept_invite', { token });

		expect(error?.message).toContain('already been used');
	});

	it('refuses an invitation that has expired', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: organizationId,
			email: invited.email,
			role: 'member',
			token,
			invited_by: userId,
			expires_at: new Date(Date.now() - 1000).toISOString()
		});

		const { error } = await invited.supabase.rpc('accept_invite', { token });

		expect(error?.message).toContain('expired');
	});

	it('accepts a chair invitation that names a committee, and hands the committee over', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const token = makeToken();

		const committeeId = await addCommittee(supabase, conferenceId);

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			committee_id: committeeId,
			email: invited.email,
			role_id: await presetRoleId(supabase, conferenceId, 'Chair'),
			token,
			invited_by: userId
		});

		const { error } = await invited.supabase.rpc('accept_invite', { token });

		expect(error).toBeNull();

		const { data: roles } = await invited.supabase
			.from('conference_role_members')
			.select('role_id')
			.eq('conference_id', conferenceId)
			.eq('user_id', invited.userId);

		expect(roles).toEqual([{ role_id: await presetRoleId(supabase, conferenceId, 'Chair') }]);

		// The migration for task T02 replaced accept_invite with one that writes
		// the committee_chairs row as well, now that the table exists.
		const { data: chairs } = await invited.supabase
			.from('committee_chairs')
			.select('title')
			.eq('committee_id', committeeId)
			.eq('user_id', invited.userId);

		expect(chairs).toEqual([{ title: 'Chair' }]);
	});

	it('refuses to write an organisation invitation whose role is not an organisation role', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();

		// `role` is text, because one column once held two enum types. Since
		// 20261022121000 the table itself holds it to the organisation roles
		// (invites_role_is_organization_role), so a wrong word is refused on the
		// way in rather than caught by accept_invite on the way out.
		const { error } = await supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: organizationId,
			email: 'wrong.word@example.com',
			role: 'chair',
			token: makeToken(),
			invited_by: userId
		});

		expect(error?.message).toContain('invites_role_is_organization_role');
	});

	it('refuses to write a conference invitation that names no role', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();

		// A conference invitation is for one of the conference's roles, by id.
		// The insert policy turns the organiser away first, because there is no
		// role for it to ask whether they may give; the table's own constraint
		// is behind it, and the service-role client, which no policy limits, is
		// the way to show that the constraint refuses the row by itself.
		const { error: policyError } = await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: 'roleless@example.com',
			token: makeToken(),
			invited_by: userId
		});

		expect(policyError).not.toBeNull();

		const { error } = await createServiceRoleClient().from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: 'roleless@example.com',
			token: makeToken(),
			invited_by: userId
		});

		expect(error?.message).toContain('invites_role_matches_kind');
	});

	it('refuses to write a conference invitation whose role is an organisation word', async () => {
		const { conferenceId, userId } = await createConferenceOwnedByMe();

		// As above: the constraint is what holds the two kinds apart, so it is
		// asked directly.
		const { error } = await createServiceRoleClient().from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: 'wrong.kind@example.com',
			role: 'owner',
			token: makeToken(),
			invited_by: userId
		});

		expect(error?.message).toContain('invites_role_matches_kind');
	});

	it("refuses to write a conference invitation naming another conference's role", async () => {
		const ourConference = await createConferenceOwnedByMe();
		const someoneElse = await createConferenceOwnedByMe();

		// The role is read through its own organiser, who may read it; the
		// invites_check_role trigger (check_invite_role) is what has to notice
		// it is not ours.
		const theirChairRoleId = await presetRoleId(
			someoneElse.supabase,
			someoneElse.conferenceId,
			'Chair'
		);

		const { error } = await ourConference.supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: ourConference.conferenceId,
			email: 'chair.with.their.role@example.com',
			role_id: theirChairRoleId,
			token: makeToken(),
			invited_by: ourConference.userId
		});

		expect(error?.message).toContain('different conference');
	});

	it('withdraws the open invitations of a role that is deleted', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const token = makeToken();

		const { data: role } = await supabase
			.from('conference_roles')
			.insert({ conference_id: conferenceId, name: 'Press', position: 5 })
			.select('id')
			.single();

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: 'press.officer@example.com',
			role_id: role?.id,
			token,
			invited_by: userId
		});

		// An invitation to a role that no longer exists would give nothing when
		// accepted, so it goes with the role ("on delete cascade").
		const { error } = await supabase.from('conference_roles').delete().eq('id', role?.id);

		expect(error).toBeNull();

		const { data: remaining } = await supabase.from('invites').select('id').eq('token', token);

		expect(remaining).toEqual([]);
	});
});

describe('list_my_invites', () => {
	it('shows the signed-in person the invitations waiting for them, and no others', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();

		await supabase.from('invites').insert([
			{
				kind: 'organization_member',
				organization_id: organizationId,
				email: invited.email,
				role: 'member',
				token: makeToken(),
				invited_by: userId
			},
			{
				kind: 'organization_member',
				organization_id: organizationId,
				email: 'not.them@example.com',
				role: 'member',
				token: makeToken(),
				invited_by: userId
			}
		]);

		const { data, error } = await invited.supabase.rpc('list_my_invites');

		expect(error).toBeNull();
		expect(data?.length).toBe(1);
		expect(data?.[0]).toMatchObject({ kind: 'organization_member', role: 'member' });
	});

	it('names the role of a conference invitation by its name', async () => {
		const { supabase, conferenceId, userId } = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();

		await supabase.from('invites').insert({
			kind: 'conference_staff',
			conference_id: conferenceId,
			email: invited.email,
			role_id: await presetRoleId(supabase, conferenceId, 'Volunteer'),
			token: makeToken(),
			invited_by: userId
		});

		const { data } = await invited.supabase.rpc('list_my_invites');

		expect(data?.[0]).toMatchObject({
			kind: 'conference_staff',
			role: 'Volunteer',
			conference_name: 'Fixture Conference'
		});
	});

	it('leaves out an invitation that has already been accepted', async () => {
		const { supabase, organizationId, userId } = await createConferenceOwnedByMe();
		const invited = await createSignedInClient();
		const token = makeToken();

		await supabase.from('invites').insert({
			kind: 'organization_member',
			organization_id: organizationId,
			email: invited.email,
			role: 'member',
			token,
			invited_by: userId
		});

		await invited.supabase.rpc('accept_invite', { token });
		const { data } = await invited.supabase.rpc('list_my_invites');

		expect(data).toEqual([]);
	});
});
